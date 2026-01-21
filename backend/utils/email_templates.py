"""
Email templates for account management notifications.

Includes templates for account deletion, promotion, and other account events.
"""


def account_deleted_confirmation(user_email: str, user_name: str) -> dict:
    """
    Email template for account deletion confirmation.

    Args:
        user_email: User's email address
        user_name: User's full name

    Returns:
        Dictionary with subject and body
    """
    return {
        "subject": "Your PriceIQ Account Has Been Deleted",
        "body": f"""Hi {user_name},

Your PriceIQ account has been successfully deleted.

What's been removed:
- Your profile and login credentials
- Access to all organizations

What's been retained (for legal/audit purposes):
- Proposals you created (anonymized as "Deleted User")
- Billing records

If you didn't request this deletion, please contact support immediately at support@priceiq.com.

Best regards,
The PriceIQ Team
"""
    }


def promoted_to_admin_notification(user_email: str, org_name: str, promoted_by: str) -> dict:
    """
    Email template for user promotion to admin role.

    Args:
        user_email: Promoted user's email
        org_name: Organization name
        promoted_by: Name of the admin who performed the promotion

    Returns:
        Dictionary with subject and body
    """
    return {
        "subject": f"You've Been Promoted to Admin in '{org_name}'",
        "body": f"""Hi,

You've been promoted to Admin in the organization '{org_name}' by {promoted_by}.

As an admin, you can now:
- Invite and manage members
- Access all proposals in the organization
- Manage organization settings and rates
- Share proposals with team members

Log in to PriceIQ to start using your new permissions.

Best regards,
The PriceIQ Team
"""
    }
