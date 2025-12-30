"""
Stripe webhook handler for payment event processing.

Handles events:
- payment_intent.succeeded: Mark billing record as paid
- payment_intent.payment_failed: Mark as failed, update proposal
- setup_intent.succeeded: Log successful card save

Security:
- Signature verification with STRIPE_WEBHOOK_SECRET
- Idempotency check prevents duplicate processing
- Raw body required for signature verification
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException
from bson import ObjectId

from client.stripe_client import get_stripe_service, StripeError
from utils.billing_crud import get_billing_crud
from utils.proposals import get_proposal_crud

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    """
    Receive and process Stripe webhook events.

    CRITICAL: Request body must be raw bytes for signature verification.
    FastAPI's default JSON parsing would break the signature.
    """
    stripe_service = get_stripe_service()
    billing_crud = get_billing_crud()
    proposal_crud = get_proposal_crud()

    # Get raw body (required for signature verification)
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    if not signature:
        logger.warning("Webhook received without signature header")
        raise HTTPException(400, "Missing stripe-signature header")

    # Verify signature and construct event
    try:
        event = stripe_service.construct_webhook_event(payload, signature)
    except StripeError as e:
        logger.error(f"Webhook signature verification failed: {e.message}")
        raise HTTPException(400, f"Invalid signature: {e.message}")

    # Idempotency check - prevent duplicate processing
    if billing_crud.event_exists(event.id):
        logger.info(f"Webhook event {event.id} already processed, skipping")
        return {"status": "already_processed"}

    logger.info(f"Processing webhook event: {event.type} ({event.id})")

    # Route to appropriate handler
    try:
        if event.type == "payment_intent.succeeded":
            handle_payment_succeeded(event, billing_crud, proposal_crud)

        elif event.type == "payment_intent.payment_failed":
            handle_payment_failed(event, billing_crud, proposal_crud)

        elif event.type == "setup_intent.succeeded":
            handle_setup_succeeded(event)

        else:
            logger.debug(f"Unhandled event type: {event.type}")

    except Exception as e:
        logger.error(f"Error processing webhook {event.id}: {e}")
        # Still return 200 to prevent Stripe retries for application errors
        # Log error for investigation
        return {"status": "error", "message": str(e)}

    return {"status": "ok"}


def handle_payment_succeeded(event, billing_crud, proposal_crud):
    """
    Handle successful payment.

    Updates:
    - Billing record status → "succeeded"
    - Proposal billing_status → "paid"
    """
    payment_intent = event.data.object
    payment_intent_id = payment_intent.id
    metadata = payment_intent.get("metadata", {})

    logger.info(
        f"Payment succeeded: {payment_intent_id} "
        f"(${payment_intent.amount / 100:.2f})"
    )

    # Update billing record
    updated = billing_crud.update_by_payment_intent(
        payment_intent_id=payment_intent_id,
        status="succeeded",
        stripe_event_id=event.id
    )

    if not updated:
        logger.warning(
            f"No billing record found for PaymentIntent {payment_intent_id}. "
            "This may be from a different source."
        )
        return

    # Update proposal status
    proposal_id = metadata.get("proposal_id")
    if proposal_id:
        try:
            proposal_crud.collection.update_one(
                {"_id": ObjectId(proposal_id)},
                {"$set": {"billing_status": "paid", "updated_at": datetime.utcnow()}}
            )
            logger.info(f"Proposal {proposal_id} marked as paid")
        except Exception as e:
            logger.error(f"Failed to update proposal {proposal_id}: {e}")


def handle_payment_failed(event, billing_crud, proposal_crud):
    """
    Handle failed payment.

    Updates:
    - Billing record status → "failed" with error message
    - Proposal billing_status → "failed"
    """
    payment_intent = event.data.object
    payment_intent_id = payment_intent.id
    metadata = payment_intent.get("metadata", {})

    # Extract error details
    last_error = payment_intent.get("last_payment_error", {})
    error_message = last_error.get("message", "Payment failed")
    decline_code = last_error.get("decline_code")

    logger.warning(
        f"Payment failed: {payment_intent_id} - {error_message}"
        f"{f' (decline_code: {decline_code})' if decline_code else ''}"
    )

    # Update billing record
    billing_crud.update_by_payment_intent(
        payment_intent_id=payment_intent_id,
        status="failed",
        stripe_event_id=event.id,
        error_message=error_message
    )

    # Update proposal status
    proposal_id = metadata.get("proposal_id")
    if proposal_id:
        try:
            proposal_crud.collection.update_one(
                {"_id": ObjectId(proposal_id)},
                {"$set": {"billing_status": "failed", "updated_at": datetime.utcnow()}}
            )
            logger.info(f"Proposal {proposal_id} marked as failed")
        except Exception as e:
            logger.error(f"Failed to update proposal {proposal_id}: {e}")


def handle_setup_succeeded(event):
    """
    Handle successful SetupIntent (card saved).

    This is informational - the actual payment method attachment
    is handled in the billing router after frontend confirmation.
    """
    setup_intent = event.data.object
    customer_id = setup_intent.get("customer")
    payment_method = setup_intent.get("payment_method")

    logger.info(
        f"SetupIntent succeeded for customer {customer_id}, "
        f"payment_method: {payment_method}"
    )
