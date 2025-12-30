"""
Billing API router for Stripe payments.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from bson import ObjectId

from auth.dependencies import get_current_user, require_admin
from client.stripe_client import get_stripe_service, ChargeType, StripeError
from utils.billing_crud import get_billing_crud
from utils.organizations import get_organization_crud
from utils.proposals import get_proposal_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


# =============================================================================
# REQUEST MODELS (Only what we need)
# =============================================================================

class PaymentMethodRequest(BaseModel):
    payment_method_id: str


class ChargeRequest(BaseModel):
    proposal_id: str
    charge_type: str  # "basic" or "advanced"


# =============================================================================
# SETUP INTENT (For Adding Cards)
# =============================================================================

@router.post("/setup-intent")
async def create_setup_intent(current_user: dict = Depends(require_admin)):
    """Create SetupIntent for adding payment method. Admin only."""
    stripe_service = get_stripe_service()

    if not stripe_service.is_configured:
        raise HTTPException(503, "Payment service not configured")

    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(404, "Organization not found")

    try:
        # Create Stripe customer if needed
        if not org.get("stripe_customer_id"):
            customer_id = stripe_service.create_customer(
                email=current_user["email"],
                name=org["name"],
                organization_id=str(org["_id"])
            )
            org_crud.collection.update_one(
                {"_id": org["_id"]},
                {"$set": {"stripe_customer_id": customer_id, "updated_at": datetime.utcnow()}}
            )
        else:
            customer_id = org["stripe_customer_id"]

        result = stripe_service.create_setup_intent(customer_id)
        return result

    except StripeError as e:
        raise HTTPException(500, f"Failed to create setup intent: {e.message}")


# =============================================================================
# PAYMENT METHOD MANAGEMENT
# =============================================================================

@router.post("/payment-methods", status_code=201)
async def save_payment_method(data: PaymentMethodRequest, current_user: dict = Depends(require_admin)):
    """Save payment method after SetupIntent. Admin only."""
    stripe_service = get_stripe_service()

    if not stripe_service.is_configured:
        raise HTTPException(503, "Payment service not configured")

    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org or not org.get("stripe_customer_id"):
        raise HTTPException(400, "Organization not set up for billing")

    try:
        stripe_service.attach_payment_method(
            customer_id=org["stripe_customer_id"],
            payment_method_id=data.payment_method_id,
            set_as_default=True
        )

        org_crud.collection.update_one(
            {"_id": org["_id"]},
            {"$set": {"default_payment_method_id": data.payment_method_id, "updated_at": datetime.utcnow()}}
        )

        return {"message": "Payment method saved"}

    except StripeError as e:
        raise HTTPException(400, f"Failed to save payment method: {e.message}")


@router.get("/payment-methods")
async def list_payment_methods(current_user: dict = Depends(require_admin)):
    """List saved payment methods. Admin only."""
    stripe_service = get_stripe_service()

    if not stripe_service.is_configured:
        raise HTTPException(503, "Payment service not configured")

    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org or not org.get("stripe_customer_id"):
        return []

    try:
        methods = stripe_service.list_payment_methods(org["stripe_customer_id"])
        default_pm = org.get("default_payment_method_id")

        for m in methods:
            m["is_default"] = (m["id"] == default_pm)

        return methods

    except StripeError as e:
        raise HTTPException(500, "Failed to list payment methods")


@router.delete("/payment-methods/{payment_method_id}")
async def delete_payment_method(payment_method_id: str, current_user: dict = Depends(require_admin)):
    """Remove payment method. Admin only."""
    stripe_service = get_stripe_service()

    if not stripe_service.is_configured:
        raise HTTPException(503, "Payment service not configured")

    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(404, "Organization not found")

    try:
        stripe_service.detach_payment_method(payment_method_id)

        if org.get("default_payment_method_id") == payment_method_id:
            org_crud.collection.update_one(
                {"_id": org["_id"]},
                {"$unset": {"default_payment_method_id": ""}, "$set": {"updated_at": datetime.utcnow()}}
            )

        return {"message": "Payment method removed"}

    except StripeError as e:
        raise HTTPException(400, f"Failed to remove payment method: {e.message}")


class SetDefaultRequest(BaseModel):
    payment_method_id: str


@router.patch("/payment-methods/default")
async def set_default_payment_method(data: SetDefaultRequest, current_user: dict = Depends(require_admin)):
    """Set a payment method as default. Admin only."""
    stripe_service = get_stripe_service()

    if not stripe_service.is_configured:
        raise HTTPException(503, "Payment service not configured")

    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(404, "Organization not found")

    if not org.get("stripe_customer_id"):
        raise HTTPException(400, "No Stripe customer configured")

    try:
        # Update default in Stripe
        stripe_service.set_default_payment_method(org["stripe_customer_id"], data.payment_method_id)

        # Update default in our database
        org_crud.collection.update_one(
            {"_id": org["_id"]},
            {"$set": {"default_payment_method_id": data.payment_method_id, "updated_at": datetime.utcnow()}}
        )

        return {"message": "Default payment method updated"}

    except StripeError as e:
        raise HTTPException(400, f"Failed to set default payment method: {e.message}")


# =============================================================================
# BILLING STATUS
# =============================================================================

@router.get("/status")
async def get_billing_status(current_user: dict = Depends(get_current_user)):
    """Check if org has billing configured."""
    stripe_service = get_stripe_service()
    org_crud = get_organization_crud()
    org = org_crud.get_by_id(current_user["organization_id"])

    if not org:
        raise HTTPException(404, "Organization not found")

    has_payment_method = bool(
        org.get("stripe_customer_id") and org.get("default_payment_method_id")
    )

    return {
        "has_payment_method": has_payment_method,
        "can_create_proposals": has_payment_method,
        "is_admin": current_user.get("role") == "admin",
        "stripe_configured": stripe_service.is_configured
    }


# =============================================================================
# CHARGING
# =============================================================================

@router.post("/charge")
async def charge_for_proposal(data: ChargeRequest, current_user: dict = Depends(get_current_user)):
    """Charge for proposal (basic or advanced)."""
    stripe_service = get_stripe_service()
    billing_crud = get_billing_crud()
    org_crud = get_organization_crud()
    proposal_crud = get_proposal_crud()

    if not stripe_service.is_configured:
        raise HTTPException(503, "Payment service not configured")

    # Validate charge type
    if data.charge_type not in ["basic", "advanced"]:
        raise HTTPException(400, "Invalid charge type. Must be 'basic' or 'advanced'")

    charge_type = ChargeType(data.charge_type)

    # Get org
    org = org_crud.get_by_id(current_user["organization_id"])
    if not org:
        raise HTTPException(404, "Organization not found")

    if not org.get("stripe_customer_id") or not org.get("default_payment_method_id"):
        raise HTTPException(402, "No payment method configured. Admin must add a card.")

    # Get proposal
    proposal = proposal_crud.get_by_id(data.proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")

    if str(proposal.get("organization_id")) != str(org["_id"]):
        raise HTTPException(403, "Proposal does not belong to your organization")

    # Check if already charged (idempotent)
    if billing_crud.is_proposal_charged(data.proposal_id, charge_type.value):
        existing = billing_crud.get_proposal_billing_status(data.proposal_id, charge_type.value)
        return {"success": True, "billing_id": existing["id"] if existing else None, "already_charged": True}

    # Get price and create billing record
    amount_cents = stripe_service.get_price(charge_type)
    proposal_name = proposal.get("name", "Untitled")

    billing_id = billing_crud.create_billing_record(
        organization_id=str(org["_id"]),
        proposal_id=data.proposal_id,
        charge_type=charge_type.value,
        amount_cents=amount_cents,
        description=f"PriceIQ {charge_type.value.title()}: {proposal_name[:50]}",
        triggered_by_user_id=str(current_user["_id"]),
        status="pending"
    )

    # Charge
    result = stripe_service.charge_for_proposal(
        customer_id=org["stripe_customer_id"],
        payment_method_id=org["default_payment_method_id"],
        charge_type=charge_type,
        proposal_id=data.proposal_id,
        proposal_name=proposal_name,
        organization_id=str(org["_id"])
    )

    if result["success"]:
        # Update billing record
        billing_crud.collection.update_one(
            {"_id": ObjectId(billing_id)},
            {"$set": {
                "stripe_payment_intent_id": result["payment_intent_id"],
                "status": "succeeded",
                "updated_at": datetime.utcnow()
            }}
        )

        # Update proposal
        proposal_crud.collection.update_one(
            {"_id": ObjectId(data.proposal_id)},
            {"$set": {"billing_status": "paid", "updated_at": datetime.utcnow()}}
        )

        return {
            "success": True,
            "billing_id": billing_id,
            "payment_intent_id": result["payment_intent_id"],
            "amount_cents": amount_cents
        }
    else:
        # Update billing as failed
        billing_crud.collection.update_one(
            {"_id": ObjectId(billing_id)},
            {"$set": {"status": "failed", "error_message": result.get("error"), "updated_at": datetime.utcnow()}}
        )

        proposal_crud.collection.update_one(
            {"_id": ObjectId(data.proposal_id)},
            {"$set": {"billing_status": "failed", "updated_at": datetime.utcnow()}}
        )

        raise HTTPException(402, result.get("error", "Payment failed"))


# =============================================================================
# HISTORY
# =============================================================================

@router.get("/history")
async def get_billing_history(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(require_admin)
):
    """Get billing history. Admin only."""
    billing_crud = get_billing_crud()
    records = billing_crud.get_organization_history(
        organization_id=str(current_user["organization_id"]),
        skip=skip,
        limit=limit
    )
    return {"records": records, "count": len(records)}


@router.get("/stats")
async def get_billing_stats(current_user: dict = Depends(require_admin)):
    """Get billing stats. Admin only."""
    billing_crud = get_billing_crud()
    return billing_crud.get_organization_stats(str(current_user["organization_id"]))


@router.get("/proposal/{proposal_id}")
async def get_proposal_billing(proposal_id: str, current_user: dict = Depends(get_current_user)):
    """Get billing for a proposal."""
    billing_crud = get_billing_crud()
    proposal_crud = get_proposal_crud()

    proposal = proposal_crud.get_by_id(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")

    if str(proposal.get("organization_id")) != str(current_user["organization_id"]):
        raise HTTPException(403, "Access denied")

    return {
        "proposal_id": proposal_id,
        "basic": billing_crud.get_proposal_billing_status(proposal_id, "basic"),
        "advanced": billing_crud.get_proposal_billing_status(proposal_id, "advanced")
    }
