"""
Stripe client for payment processing.

Production-ready implementation with:
- Singleton pattern for connection reuse
- Comprehensive error handling
- Idempotency support
- Webhook signature verification
- Support for both test and live modes (same code, different API keys)

Environment Variables Required:
    STRIPE_SECRET_KEY: Stripe secret key (sk_test_xxx or sk_live_xxx)
    STRIPE_WEBHOOK_SECRET: Webhook signing secret (whsec_xxx)
    BASIC_PROPOSAL_PRICE_CENTS: Price for basic proposal (default: 500 = $5.00)
    ADVANCED_ANALYSIS_PRICE_CENTS: Price for advanced analysis (default: 1000 = $10.00)

Test Cards (only work with sk_test_xxx):
    4242424242424242 - Success
    4000000000000002 - Declined
    4000000000009995 - Insufficient funds
    4000002500003155 - Requires 3D Secure
"""

import stripe
import os
import logging
import threading
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)

_stripe_service: Optional["StripeService"] = None
_lock = threading.RLock()


class ChargeType(str, Enum):
    """Types of charges we support."""
    BASIC = "basic"
    ADVANCED = "advanced"


class PaymentStatus(str, Enum):
    """Payment status values."""
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class StripeError(Exception):
    """Custom exception for Stripe-related errors."""
    def __init__(self, message: str, code: str = "stripe_error", decline_code: Optional[str] = None):
        self.message = message
        self.code = code
        self.decline_code = decline_code
        super().__init__(self.message)


class StripeService:
    """
    Stripe service for payment operations.

    Thread-safe singleton that handles all Stripe API interactions.
    Works with both test and live API keys - same code, different env vars.
    """

    def __init__(self):
        """Initialize Stripe with API key from environment."""
        self._api_key = os.getenv("STRIPE_SECRET_KEY")
        self._webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

        if not self._api_key:
            logger.warning(
                "STRIPE_SECRET_KEY not set. Billing features will be disabled. "
                "Set this in your .env file to enable payments."
            )
        else:
            stripe.api_key = self._api_key
            mode = "LIVE" if self._api_key.startswith("sk_live_") else "TEST"
            logger.info(f"Stripe initialized in {mode} mode")

        # Configurable pricing (in cents)
        self.prices = {
            ChargeType.BASIC: int(os.getenv("BASIC_PROPOSAL_PRICE_CENTS", 500)),
            ChargeType.ADVANCED: int(os.getenv("ADVANCED_ANALYSIS_PRICE_CENTS", 1000)),
        }

    @property
    def is_configured(self) -> bool:
        """Check if Stripe is properly configured."""
        return bool(self._api_key)

    @property
    def is_live_mode(self) -> bool:
        """Check if using live (real money) mode."""
        return bool(self._api_key and self._api_key.startswith("sk_live_"))

    @property
    def webhook_secret(self) -> Optional[str]:
        """Get webhook signing secret."""
        return self._webhook_secret

    def get_price(self, charge_type: ChargeType) -> int:
        """Get price in cents for a charge type."""
        return self.prices.get(charge_type, 0)

    # =========================================================================
    # CUSTOMER MANAGEMENT
    # =========================================================================

    def create_customer(
        self,
        email: str,
        name: str,
        organization_id: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Create a Stripe customer for an organization.

        Args:
            email: Billing email for receipts and notifications
            name: Organization/company name
            organization_id: Internal organization ID for reference
            metadata: Additional metadata to store

        Returns:
            Stripe customer ID (cus_xxx)

        Raises:
            StripeError: If customer creation fails
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            customer_metadata = {
                "organization_id": str(organization_id),
                "platform": "priceiq",
                "created_at": datetime.utcnow().isoformat(),
            }
            if metadata:
                customer_metadata.update(metadata)

            customer = stripe.Customer.create(
                email=email,
                name=name,
                metadata=customer_metadata
            )

            logger.info(
                f"Created Stripe customer {customer.id} for organization {organization_id}"
            )
            return customer.id

        except stripe.error.StripeError as e:
            logger.error(f"Failed to create Stripe customer: {e}")
            raise StripeError(str(e), code="customer_creation_failed")

    def get_customer(self, customer_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve Stripe customer details.

        Args:
            customer_id: Stripe customer ID

        Returns:
            Customer details dict or None if not found/deleted
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            customer = stripe.Customer.retrieve(customer_id)

            if customer.deleted:
                return None

            return {
                "id": customer.id,
                "email": customer.email,
                "name": customer.name,
                "default_payment_method": (
                    customer.invoice_settings.default_payment_method
                    if customer.invoice_settings else None
                ),
                "created": customer.created,
                "metadata": dict(customer.metadata) if customer.metadata else {}
            }

        except stripe.error.InvalidRequestError:
            return None
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retrieve customer {customer_id}: {e}")
            raise StripeError(str(e), code="customer_retrieval_failed")

    # =========================================================================
    # PAYMENT METHOD MANAGEMENT (SetupIntent flow)
    # =========================================================================

    def create_setup_intent(self, customer_id: str) -> Dict[str, str]:
        """
        Create a SetupIntent for securely collecting payment method.

        The returned client_secret is used by Stripe.js on the frontend
        to collect card details without them touching your server (PCI compliant).

        Args:
            customer_id: Stripe customer ID

        Returns:
            Dict with:
                - client_secret: For Stripe.js on frontend
                - setup_intent_id: For reference/tracking
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            setup_intent = stripe.SetupIntent.create(
                customer=customer_id,
                payment_method_types=["card"],
                usage="off_session",  # Required for charging without user present
                metadata={
                    "platform": "priceiq",
                    "created_at": datetime.utcnow().isoformat()
                }
            )

            logger.info(f"Created SetupIntent {setup_intent.id} for customer {customer_id}")

            return {
                "client_secret": setup_intent.client_secret,
                "setup_intent_id": setup_intent.id
            }

        except stripe.error.StripeError as e:
            logger.error(f"Failed to create SetupIntent: {e}")
            raise StripeError(str(e), code="setup_intent_failed")

    def attach_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
        set_as_default: bool = True
    ) -> Dict[str, Any]:
        """
        Attach a payment method to a customer.

        Called after SetupIntent succeeds on frontend. The payment_method_id
        comes from the SetupIntent confirmation.

        Args:
            customer_id: Stripe customer ID
            payment_method_id: Payment method ID from SetupIntent (pm_xxx)
            set_as_default: Whether to set as default payment method

        Returns:
            Payment method details
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            # Attach payment method to customer
            payment_method = stripe.PaymentMethod.attach(
                payment_method_id,
                customer=customer_id
            )

            # Set as default if requested
            if set_as_default:
                stripe.Customer.modify(
                    customer_id,
                    invoice_settings={
                        "default_payment_method": payment_method_id
                    }
                )

            logger.info(
                f"Attached payment method {payment_method_id} to customer {customer_id}"
            )

            return {
                "id": payment_method.id,
                "brand": payment_method.card.brand if payment_method.card else None,
                "last4": payment_method.card.last4 if payment_method.card else None,
                "exp_month": payment_method.card.exp_month if payment_method.card else None,
                "exp_year": payment_method.card.exp_year if payment_method.card else None,
            }

        except stripe.error.StripeError as e:
            logger.error(f"Failed to attach payment method: {e}")
            raise StripeError(str(e), code="payment_method_attach_failed")

    def list_payment_methods(self, customer_id: str) -> List[Dict[str, Any]]:
        """
        List all payment methods for a customer.

        Args:
            customer_id: Stripe customer ID

        Returns:
            List of payment methods with card details
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            methods = stripe.PaymentMethod.list(
                customer=customer_id,
                type="card"
            )

            return [{
                "id": pm.id,
                "brand": pm.card.brand,
                "last4": pm.card.last4,
                "exp_month": pm.card.exp_month,
                "exp_year": pm.card.exp_year,
                "created": pm.created
            } for pm in methods.data]

        except stripe.error.StripeError as e:
            logger.error(f"Failed to list payment methods: {e}")
            raise StripeError(str(e), code="payment_method_list_failed")

    def detach_payment_method(self, payment_method_id: str) -> bool:
        """
        Remove a payment method.

        Args:
            payment_method_id: Payment method ID to remove

        Returns:
            True if successful
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            stripe.PaymentMethod.detach(payment_method_id)
            logger.info(f"Detached payment method {payment_method_id}")
            return True

        except stripe.error.StripeError as e:
            logger.error(f"Failed to detach payment method: {e}")
            raise StripeError(str(e), code="payment_method_detach_failed")

    # =========================================================================
    # CHARGING (PaymentIntent)
    # =========================================================================

    def create_payment_intent(
        self,
        customer_id: str,
        payment_method_id: str,
        amount_cents: int,
        description: str,
        metadata: Dict[str, str],
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create and confirm a PaymentIntent to charge a customer.

        Uses off_session=True to charge saved payment method without user interaction.
        Supports idempotency to prevent duplicate charges on retries.

        Args:
            customer_id: Stripe customer ID
            payment_method_id: Saved payment method ID
            amount_cents: Amount in cents (500 = $5.00)
            description: Description for invoice/statement
            metadata: Additional data (proposal_id, charge_type, etc.)
            idempotency_key: Optional key to prevent duplicate charges

        Returns:
            Dict with:
                - success: bool
                - payment_intent_id: str (if successful)
                - status: str
                - error: str (if failed)
                - code: str (error code if failed)
                - decline_code: str (if card declined)
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            # Build request params
            params = {
                "amount": amount_cents,
                "currency": "usd",
                "customer": customer_id,
                "payment_method": payment_method_id,
                "off_session": True,
                "confirm": True,
                "description": description,
                "metadata": {
                    **metadata,
                    "platform": "priceiq",
                    "charged_at": datetime.utcnow().isoformat()
                }
            }

            # Create with idempotency key if provided
            if idempotency_key:
                payment_intent = stripe.PaymentIntent.create(
                    **params,
                    idempotency_key=idempotency_key
                )
            else:
                payment_intent = stripe.PaymentIntent.create(**params)

            logger.info(
                f"Payment successful: ${amount_cents/100:.2f} - {description} "
                f"(PaymentIntent: {payment_intent.id})"
            )

            return {
                "success": True,
                "payment_intent_id": payment_intent.id,
                "charge_id": payment_intent.latest_charge,
                "amount_cents": amount_cents,
                "status": payment_intent.status
            }

        except stripe.error.CardError as e:
            # Card was declined
            error = e.error
            decline_code = getattr(error, "decline_code", None)

            logger.warning(
                f"Card declined: {error.message} "
                f"(code: {error.code}, decline_code: {decline_code})"
            )

            return {
                "success": False,
                "payment_intent_id": getattr(e, "payment_intent", {}).get("id") if hasattr(e, "payment_intent") else None,
                "error": error.message,
                "code": error.code,
                "decline_code": decline_code
            }

        except stripe.error.InvalidRequestError as e:
            # Invalid parameters
            logger.error(f"Invalid Stripe request: {e}")
            return {
                "success": False,
                "error": str(e),
                "code": "invalid_request"
            }

        except stripe.error.AuthenticationError as e:
            # API key issue
            logger.error(f"Stripe authentication failed: {e}")
            return {
                "success": False,
                "error": "Payment service configuration error. Please contact support.",
                "code": "auth_error"
            }

        except stripe.error.StripeError as e:
            # Catch-all for other Stripe errors
            logger.error(f"Stripe error during payment: {e}")
            return {
                "success": False,
                "error": "Payment processing error. Please try again.",
                "code": "stripe_error"
            }

    def charge_for_proposal(
        self,
        customer_id: str,
        payment_method_id: str,
        charge_type: ChargeType,
        proposal_id: str,
        proposal_name: str,
        organization_id: str
    ) -> Dict[str, Any]:
        """
        Convenience method to charge for a proposal.

        Automatically sets correct price, description, and metadata.
        Uses proposal_id + charge_type as idempotency key to prevent double charges.

        Args:
            customer_id: Stripe customer ID
            payment_method_id: Saved payment method ID
            charge_type: Type of charge (basic or advanced)
            proposal_id: Internal proposal ID
            proposal_name: Proposal name for description
            organization_id: Organization ID for metadata

        Returns:
            Payment result dict
        """
        amount = self.get_price(charge_type)

        # Create descriptive text for statement
        charge_label = "Basic Proposal" if charge_type == ChargeType.BASIC else "Advanced Analysis"
        description = f"PriceIQ {charge_label}: {proposal_name[:50]}"

        # Idempotency key prevents duplicate charges for same proposal+type
        idempotency_key = f"priceiq_{proposal_id}_{charge_type.value}"

        metadata = {
            "proposal_id": str(proposal_id),
            "organization_id": str(organization_id),
            "charge_type": charge_type.value,
            "proposal_name": proposal_name[:100]  # Stripe metadata limit
        }

        return self.create_payment_intent(
            customer_id=customer_id,
            payment_method_id=payment_method_id,
            amount_cents=amount,
            description=description,
            metadata=metadata,
            idempotency_key=idempotency_key
        )

    # =========================================================================
    # WEBHOOK HANDLING
    # =========================================================================

    def construct_webhook_event(
        self,
        payload: bytes,
        signature: str
    ) -> stripe.Event:
        """
        Verify webhook signature and construct event.

        CRITICAL: payload must be raw bytes, not parsed JSON!
        Stripe signs the raw payload, so parsing before verification fails.

        Args:
            payload: Raw request body (bytes)
            signature: Value of 'stripe-signature' header

        Returns:
            Verified Stripe event object

        Raises:
            StripeError: If signature verification fails
        """
        if not self._webhook_secret:
            raise StripeError(
                "STRIPE_WEBHOOK_SECRET not configured",
                code="webhook_not_configured"
            )

        try:
            event = stripe.Webhook.construct_event(
                payload=payload,
                sig_header=signature,
                secret=self._webhook_secret
            )
            return event

        except ValueError as e:
            logger.error(f"Invalid webhook payload: {e}")
            raise StripeError("Invalid payload", code="invalid_payload")

        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Webhook signature verification failed: {e}")
            raise StripeError("Invalid signature", code="invalid_signature")

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def get_payment_intent(self, payment_intent_id: str) -> Optional[Dict[str, Any]]:
        """
        Get details of a specific payment.

        Useful for checking payment status or displaying receipts.

        Args:
            payment_intent_id: Payment intent ID (pi_xxx)

        Returns:
            Payment details or None if not found
        """
        if not self.is_configured:
            raise StripeError("Stripe not configured", code="not_configured")

        try:
            pi = stripe.PaymentIntent.retrieve(payment_intent_id)
            return {
                "id": pi.id,
                "amount": pi.amount,
                "currency": pi.currency,
                "status": pi.status,
                "description": pi.description,
                "created": pi.created,
                "metadata": dict(pi.metadata) if pi.metadata else {}
            }
        except stripe.error.InvalidRequestError:
            return None
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retrieve PaymentIntent: {e}")
            raise StripeError(str(e), code="payment_intent_retrieval_failed")


def get_stripe_service() -> StripeService:
    """
    Get or create Stripe service singleton.

    Thread-safe initialization ensures only one instance exists.

    Returns:
        StripeService instance
    """
    global _stripe_service
    with _lock:
        if _stripe_service is None:
            _stripe_service = StripeService()
        return _stripe_service
