# Multi-Organization User Model

## Overview

Users can now belong to multiple organizations simultaneously. This document explains the new data model and how to work with it.

## User Data Model

### New Structure
```javascript
{
  _id: "user-uuid",
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  
  // NEW: Array of all organization memberships
  organizations: [
    {
      organization_id: ObjectId("org123"),
      role: "admin",
      status: "active"
    },
    {
      organization_id: ObjectId("org456"),
      role: "user",
      status: "active"
    }
  ],
  
  // NEW: Which organization the user is currently viewing
  current_organization_id: ObjectId("org123"),
  
  // Standard fields
  auth_method: "email",
  createdAt: Date,
  updatedAt: Date
}
```

### Key Fields

- **`organizations`** (array): List of all organizations the user belongs to
  - Each entry has `organization_id`, `role`, and `status`
  - User can have different roles in different organizations
  
- **`current_organization_id`** (ObjectId): The organization the user is currently viewing
  - Used to determine which org's data to show in UI
  - Updated when user switches workspaces

### Removed Fields

❌ **OLD (removed):**
- `organization_id` (single ObjectId)
- `role` (single string)
- `status` (single string)

These have been replaced by the `organizations` array.

## Querying Users

### Get Members of an Organization

```python
# Query users who are active members of an organization
members = await users_collection.find({
    "organizations": {
        "$elemMatch": {
            "organization_id": org_id,
            "status": "active"
        }
    }
}).to_list(length=None)
```

### Get User's Current Organization

```python
user = await users_collection.find_one({"email": email})
current_org_id = user.get("current_organization_id")

# Find the membership details
current_org = next(
    (org for org in user.get("organizations", [])
     if org["organization_id"] == current_org_id),
    None
)

if current_org:
    role = current_org["role"]
    status = current_org["status"]
```

## Common Operations

### Add User to Organization (Invitation Acceptance)

```python
new_org = {
    "organization_id": invitation["organization_id"],
    "role": invitation["role"],
    "status": "active"
}

await users_collection.update_one(
    {"_id": user_id},
    {
        "$push": {"organizations": new_org},
        "$set": {
            "current_organization_id": invitation["organization_id"],
            "updatedAt": datetime.utcnow()
        }
    }
)
```

### Remove User from Organization

```python
# Soft delete: mark as "removed" in that organization
await users_collection.update_one(
    {
        "_id": user_id,
        "organizations.organization_id": org_id
    },
    {
        "$set": {
            "organizations.$.status": "removed",
            "updatedAt": datetime.utcnow()
        }
    }
)
```

### Switch Organization (Workspace Switcher)

```python
# Update which organization the user is currently viewing
await users_collection.update_one(
    {"_id": user_id},
    {
        "$set": {
            "current_organization_id": new_org_id,
            "updatedAt": datetime.utcnow()
        }
    }
)
```

## Authentication Flow

When a user logs in, `auth/dependencies.py:get_current_user()`:

1. Gets user from database
2. Finds their current organization from `current_organization_id`
3. Looks up that membership in `organizations` array
4. Adds flat fields to user object for easy access:
   ```python
   user["organization_id"] = current_org["organization_id"]
   user["role"] = current_org["role"]
   user["status"] = current_org["status"]
   ```

This way, endpoints can still use `current_user["organization_id"]` and `current_user["role"]` as before!

## Migration

Existing users were migrated using `scripts/migrate_to_multi_org.py`:

- Converted `organization_id` → `organizations` array
- Set `current_organization_id` to their single org
- Removed old fields

## Benefits

✅ Users can be members of multiple organizations
✅ Different roles in different organizations
✅ Easy workspace switching without losing memberships
✅ Invitation system supports multi-org
✅ Clean separation between "all orgs" and "current org"

## Updated Files

**Core logic:**
- `auth/crud.py` - User creation with organizations array
- `auth/dependencies.py` - Extract current org from array
- `utils/organizations.py` - Query organizations array
- `routers/invitations.py` - Add to organizations array
- `routers/organizations.py` - Query organizations array for stats

**Migration:**
- `scripts/migrate_to_multi_org.py` - One-time migration script
