"""
Billing CRUD operations for MongoDB.

Handles all database operations for the billing collection:
- Creating billing records
- Updating payment status
- Checking for duplicate webhook events (idempotency)
- Querying billing history

Collection Schema:
    {
        "_id": ObjectId,
        "organization_id": ObjectId,
        "proposal_id": ObjectId,
        "charge_type": "basic" | "advanced",
        "stripe_payment_intent_id": "pi_xxx",
        "stripe_event_id": "evt_xxx",  # For webhook idempotency
        "amount_cents": 10000,
        "currency": "usd",
        "status": "pending" | "succeeded" | "failed",
        "error_message": null | "string",
        "description": "string",
        "triggered_by_user_id": ObjectId,
        "created_at": datetime,
        "updated_at": datetime
    }
"""

import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from bson import ObjectId

from auth.database import get_mongodb_client

logger = logging.getLogger(__name__)

# Permanent cache for succeeded billing records (they never change)
# Key: "{proposal_id}:{charge_type}" -> billing record dict
_succeeded_billing_cache: Dict[str, Dict[str, Any]] = {}

# Collection name
BILLING_COLLECTION = "billing"


class BillingCRUD:
    """
    CRUD operations for billing records.

    Thread-safe singleton pattern matching other CRUD classes in the codebase.
    """

    def __init__(self):
        """Initialize with MongoDB connection."""
        self.client = get_mongodb_client()
        self.db = self.client.get_database()
        self.collection = self.db[BILLING_COLLECTION]
        self._ensure_indexes()

    def _ensure_indexes(self):
        """Create indexes for efficient queries."""
        try:
            # Composite index for proposal lookups
            self.collection.create_index(
                [("proposal_id", 1), ("charge_type", 1)],
                name="proposal_charge_lookup"
            )

            # Unique sparse index for webhook idempotency
            # sparse=True allows multiple null values
            self.collection.create_index(
                "stripe_event_id",
                unique=True,
                sparse=True,
                name="stripe_event_idempotency"
            )

            # Index for organization billing history
            self.collection.create_index(
                [("organization_id", 1), ("created_at", -1)],
                name="org_billing_history"
            )

            # Index for payment intent lookups (webhook handling)
            self.collection.create_index(
                "stripe_payment_intent_id",
                name="payment_intent_lookup"
            )

            # Index for status queries (analytics)
            self.collection.create_index(
                [("status", 1), ("created_at", -1)],
                name="status_analytics"
            )

            logger.info("Billing collection indexes ensured")

        except Exception as e:
            logger.warning(f"Could not create billing indexes: {e}")

    def create_billing_record(
        self,
        organization_id: str,
        proposal_id: str,
        charge_type: str,
        amount_cents: int,
        description: str,
        triggered_by_user_id: str,
        stripe_payment_intent_id: Optional[str] = None,
        status: str = "pending",
        currency: str = "usd"
    ) -> str:
        """
        Create a new billing record.

        Called when initiating a charge. Status starts as 'pending' and
        is updated by webhook when payment completes/fails.

        Args:
            organization_id: Organization being charged
            proposal_id: Proposal this charge is for
            charge_type: "basic" or "advanced"
            amount_cents: Amount in cents
            description: Human-readable description
            triggered_by_user_id: User who initiated the charge
            stripe_payment_intent_id: Stripe PaymentIntent ID
            status: Initial status (usually "pending")
            currency: Currency code (default "usd")

        Returns:
            Created billing record ID as string
        """
        now = datetime.utcnow()

        record = {
            "organization_id": ObjectId(organization_id),
            "proposal_id": ObjectId(proposal_id),
            "charge_type": charge_type,
            "stripe_payment_intent_id": stripe_payment_intent_id,
            # stripe_event_id omitted - sparse index only skips MISSING fields, not null
            # Webhook adds this field later via update_by_payment_intent()
            "amount_cents": amount_cents,
            "currency": currency,
            "status": status,
            "error_message": None,
            "description": description,
            "triggered_by_user_id": triggered_by_user_id,  # UUID string, not ObjectId
            "created_at": now,
            "updated_at": now
        }

        result = self.collection.insert_one(record)
        billing_id = str(result.inserted_id)

        logger.info(
            f"Created billing record {billing_id} for proposal {proposal_id} "
            f"({charge_type}, ${amount_cents/100:.2f})"
        )

        return billing_id

    def update_by_payment_intent(
        self,
        payment_intent_id: str,
        status: str,
        stripe_event_id: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Update billing record by PaymentIntent ID.

        Called by webhook handler when payment succeeds/fails.

        Args:
            payment_intent_id: Stripe PaymentIntent ID
            status: New status ("succeeded" or "failed")
            stripe_event_id: Stripe event ID for idempotency
            error_message: Error message if failed

        Returns:
            True if record was updated, False if not found
        """
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow()
        }

        if stripe_event_id:
            update_data["stripe_event_id"] = stripe_event_id

        if error_message:
            update_data["error_message"] = error_message

        result = self.collection.update_one(
            {"stripe_payment_intent_id": payment_intent_id},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            logger.info(
                f"Updated billing record for PaymentIntent {payment_intent_id} "
                f"to status: {status}"
            )
            return True
        else:
            logger.warning(
                f"No billing record found for PaymentIntent {payment_intent_id}"
            )
            return False

    def get_by_payment_intent(self, payment_intent_id: str) -> Optional[Dict[str, Any]]:
        """
        Get billing record by PaymentIntent ID.

        Args:
            payment_intent_id: Stripe PaymentIntent ID

        Returns:
            Billing record dict or None
        """
        record = self.collection.find_one(
            {"stripe_payment_intent_id": payment_intent_id}
        )

        if record:
            return self._serialize(record)
        return None

    def get_by_proposal(
        self,
        proposal_id: str,
        charge_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get billing records for a proposal.

        Args:
            proposal_id: Proposal ID
            charge_type: Optional filter by charge type

        Returns:
            List of billing records
        """
        query = {"proposal_id": ObjectId(proposal_id)}

        if charge_type:
            query["charge_type"] = charge_type

        records = self.collection.find(query).sort("created_at", -1)
        return [self._serialize(r) for r in records]

    def get_proposal_billing_status(
        self,
        proposal_id: str,
        charge_type: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get the latest billing status for a proposal charge type.

        Uses permanent cache for succeeded payments (they never change).

        Args:
            proposal_id: Proposal ID
            charge_type: "basic" or "advanced"

        Returns:
            Latest billing record for this charge type, or None
        """
        cache_key = f"{proposal_id}:{charge_type}"

        # Check cache first (succeeded payments never change)
        if cache_key in _succeeded_billing_cache:
            return _succeeded_billing_cache[cache_key]

        # Query DB
        record = self.collection.find_one(
            {
                "proposal_id": ObjectId(proposal_id),
                "charge_type": charge_type
            },
            sort=[("created_at", -1)]
        )

        if record:
            serialized = self._serialize(record)
            # Cache if succeeded (permanent cache)
            if serialized.get("status") == "succeeded":
                _succeeded_billing_cache[cache_key] = serialized
            return serialized
        return None

    def is_proposal_charged(self, proposal_id: str, charge_type: str) -> bool:
        """
        Check if a proposal has been successfully charged.

        Used to prevent duplicate charges (in addition to idempotency key).
        Uses permanent cache for succeeded payments (they never change).

        Args:
            proposal_id: Proposal ID
            charge_type: "basic" or "advanced"

        Returns:
            True if successfully charged, False otherwise
        """
        cache_key = f"{proposal_id}:{charge_type}"

        # Check cache first (succeeded payments never change)
        if cache_key in _succeeded_billing_cache:
            return True

        # Query DB
        record = self.collection.find_one({
            "proposal_id": ObjectId(proposal_id),
            "charge_type": charge_type,
            "status": "succeeded"
        })

        # Cache if succeeded
        if record:
            _succeeded_billing_cache[cache_key] = self._serialize(record)
            return True

        return False

    def event_exists(self, stripe_event_id: str) -> bool:
        """
        Check if a Stripe event has already been processed.

        Used for webhook idempotency - Stripe may send the same event
        multiple times.

        Args:
            stripe_event_id: Stripe event ID (evt_xxx)

        Returns:
            True if event was already processed
        """
        record = self.collection.find_one(
            {"stripe_event_id": stripe_event_id}
        )
        return record is not None

    def get_organization_history(
        self,
        organization_id: str,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get billing history for an organization.

        Args:
            organization_id: Organization ID
            skip: Number of records to skip (pagination)
            limit: Maximum records to return
            status: Optional filter by status

        Returns:
            List of billing records, newest first
        """
        query = {"organization_id": ObjectId(organization_id)}

        if status:
            query["status"] = status

        records = (
            self.collection
            .find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )

        return [self._serialize(r) for r in records]

    def get_organization_stats(self, organization_id: str) -> Dict[str, Any]:
        """
        Get billing statistics for an organization.

        Args:
            organization_id: Organization ID

        Returns:
            Stats dict with counts and totals
        """
        pipeline = [
            {"$match": {"organization_id": ObjectId(organization_id)}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_cents": {"$sum": "$amount_cents"}
            }}
        ]

        results = list(self.collection.aggregate(pipeline))

        stats = {
            "total_charges": 0,
            "successful_charges": 0,
            "failed_charges": 0,
            "pending_charges": 0,
            "total_amount_cents": 0,
            "successful_amount_cents": 0
        }

        for r in results:
            status = r["_id"]
            count = r["count"]
            amount = r["total_cents"]

            stats["total_charges"] += count

            if status == "succeeded":
                stats["successful_charges"] = count
                stats["successful_amount_cents"] = amount
                stats["total_amount_cents"] += amount
            elif status == "failed":
                stats["failed_charges"] = count
            elif status == "pending":
                stats["pending_charges"] = count

        return stats

    def _serialize(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Serialize MongoDB record to JSON-safe dict.

        Converts ObjectId to string and handles datetime formatting.
        """
        if not record:
            return record

        result = {}
        for key, value in record.items():
            if key == "_id":
                result["id"] = str(value)
            elif isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value

        return result


# Singleton instance
_billing_crud: Optional[BillingCRUD] = None


def get_billing_crud() -> BillingCRUD:
    """
    Get or create BillingCRUD singleton.

    Returns:
        BillingCRUD instance
    """
    global _billing_crud
    if _billing_crud is None:
        _billing_crud = BillingCRUD()
    return _billing_crud
