"""
Admin dashboard — served at /admin/users.

Protected by HTTP Basic Auth (ADMIN_USERNAME / ADMIN_PASSWORD env vars).
All routes excluded from OpenAPI schema.
"""

from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, JSONResponse

from app.admin_auth import verify_admin
from auth.database import get_mongodb_client

router = APIRouter()

_STATIC = Path(__file__).resolve().parent.parent / "static"


@router.get("/admin/users", include_in_schema=False)
def admin_dashboard(_: str = Depends(verify_admin)):
    return FileResponse(_STATIC / "admin-users.html")


@router.get("/admin/api/users", include_in_schema=False)
def admin_users_data(_: str = Depends(verify_admin)):
    """
    Returns all users with their proposal counts and org name.
    Aggregates in two MongoDB calls — no N+1.
    """
    db = get_mongodb_client().get_database()

    # --- proposals per user ---
    pipeline = [
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]
    proposal_counts = {
        row["_id"]: row["count"]
        for row in db["proposals"].aggregate(pipeline)
    }

    # --- org id → name lookup ---
    orgs = {
        str(o["_id"]): o.get("name", "—")
        for o in db["organizations"].find({}, {"name": 1})
    }

    users = []
    for u in db["users"].find({"status": {"$ne": "deleted"}}, {
        "firstName": 1, "lastName": 1, "email": 1,
        "role": 1, "status": 1, "createdAt": 1,
        "organization_id": 1, "auth_method": 1, "email_verified": 1,
    }).sort("createdAt", -1):
        uid = str(u["_id"])
        org_id = str(u.get("organization_id", ""))
        created = u.get("createdAt")
        users.append({
            "id": uid,
            "name": f"{u.get('firstName', '')} {u.get('lastName', '')}".strip() or "—",
            "email": u.get("email", ""),
            "role": u.get("role", "user"),
            "status": u.get("status", "active"),
            "auth_method": u.get("auth_method", "email"),
            "email_verified": u.get("email_verified", False),
            "org_name": orgs.get(org_id, "—"),
            "created_at": created.isoformat() if created else None,
            "proposals": proposal_counts.get(uid, 0),
        })

    return JSONResponse({"users": users, "total": len(users)})
