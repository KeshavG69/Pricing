import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from auth import config


class EmailService:
    def __init__(self):
        self.smtp_host = config.SMTP_HOST
        self.smtp_port = config.SMTP_PORT
        self.smtp_user = config.SMTP_USER
        self.smtp_password = config.SMTP_PASSWORD
        self.from_email = config.FROM_EMAIL
        self.frontend_url = config.FRONTEND_URL

    def send_invitation_email(
        self,
        to_email: str,
        token: str,
        organization_name: str,
        invited_by_name: str
    ):
        """Send organization invitation email"""
        invitation_url = f"{self.frontend_url}/invite/accept?token={token}"

        html = f"""
        <html>
        <body>
            <h2>You've been invited to join {organization_name}</h2>
            <p>{invited_by_name} has invited you to collaborate on PriceIQ.</p>
            <p>
                <a href="{invitation_url}"
                   style="background-color: #4CAF50; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                    Accept Invitation
                </a>
            </p>
            <p style="color: #666; font-size: 12px;">
                This invitation expires in 7 days.<br>
                If you didn't expect this invitation, you can safely ignore this email.
            </p>
        </body>
        </html>
        """

        message = MIMEMultipart("alternative")
        message["Subject"] = f"Invitation to join {organization_name}"
        message["From"] = self.from_email
        message["To"] = to_email

        html_part = MIMEText(html, "html")
        message.attach(html_part)

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(message)
        except Exception as e:
            print(f"Failed to send email: {e}")
            raise

    def send_verification_email(
        self,
        to_email: str,
        token: str,
        user_name: str = None
    ):
        """Send email verification magic link"""
        verification_url = f"{self.frontend_url}/auth/verify-email?token={token}"

        greeting = f"Hi {user_name}," if user_name else "Hello,"

        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #4CAF50;">Verify Your Email Address</h2>
                <p>{greeting}</p>
                <p>Welcome to PriceIQ! Please verify your email address to activate your account and start using all features.</p>
                <p style="margin: 30px 0;">
                    <a href="{verification_url}"
                       style="background-color: #4CAF50; color: white; padding: 14px 28px;
                              text-decoration: none; border-radius: 4px; display: inline-block;
                              font-weight: bold;">
                        Verify Email Address
                    </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    Or copy and paste this link into your browser:<br>
                    <a href="{verification_url}" style="color: #4CAF50; word-break: break-all;">
                        {verification_url}
                    </a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">
                    This verification link expires in 24 hours.<br>
                    If you didn't create an account with PriceIQ, you can safely ignore this email.
                </p>
            </div>
        </body>
        </html>
        """

        message = MIMEMultipart("alternative")
        message["Subject"] = "Verify your email - PriceIQ"
        message["From"] = self.from_email
        message["To"] = to_email

        html_part = MIMEText(html, "html")
        message.attach(html_part)

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(message)
        except Exception as e:
            print(f"Failed to send verification email: {e}")
            raise
