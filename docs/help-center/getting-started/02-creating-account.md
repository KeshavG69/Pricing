# Creating Your Account & First Login

**Article Type:** Tutorial | **Priority:** P0 | **Reading Time:** 2-3 minutes

Step-by-step guide to signing up for PriceIQ and logging in for the first time.

---

## Before You Start

**What You'll Need:**
- Valid email address (work email recommended)
- Strong password (8+ characters, mix of letters, numbers, symbols)
- Company/organization name
- Internet connection

**Account Types:**
- **Individual**: Create new organization (you become admin/owner)
- **Team Member**: Join via email invitation (existing organization)

---

## Creating a New Account

### Step 1: Navigate to Signup Page

**How to Access:**
1. Go to PriceIQ website (URL provided by your organization)
2. Click **"Sign Up"** button (top-right corner, blue)
3. Signup form appears

**What You'll See:**
- **Email field** (required)
- **Password field** (required, 8+ characters)
- **Company Name field** (required)
- **Terms & Conditions checkbox** (required)
- **"Create Account" button** (blue, bottom of form)

---

### Step 2: Enter Your Information

**Email Address:**
- **Field location**: Top input field
- **Requirements**: Valid email format (e.g., yourname@company.com)
- **Best practice**: Use work email (not personal)
- **Verification**: You'll receive confirmation email

**Password:**
- **Field location**: Second input field (masked with •••)
- **Requirements**:
  - Minimum 8 characters
  - Mix of uppercase and lowercase letters recommended
  - Include numbers and symbols for stronger security
- **Toggle**: Click eye icon (👁️) to show/hide password
- **Strength indicator**: Bar below field shows weak/medium/strong

**Company Name:**
- **Field location**: Third input field
- **Purpose**: Creates your organization workspace
- **Example**: "Acme Solutions Inc."
- **Note**: Can be changed later in Settings

**Terms & Conditions:**
- **Location**: Checkbox above "Create Account" button
- **Required**: Must check to proceed
- **Link**: Click "Terms & Conditions" link to read full text (opens in new tab)

---

### Step 3: Create Account

**Action:**
1. **Review** all entered information
2. **Check** Terms & Conditions checkbox
3. **Click** "Create Account" button (blue, bottom-right)

**What Happens:**
- **Validation**: System checks email format, password strength, required fields
- **Processing**: Spinner appears (2-3 seconds)
- **Account Creation**:
  - User account created in database
  - New organization created (you are owner)
  - Organization gets default settings (indirect rates, escalation rates)
  - You are assigned Admin role
- **Redirect**: Automatically logged in, redirected to dashboard

**Success Indicator:**
- Welcome message appears: "Welcome to PriceIQ!"
- Dashboard loads with empty proposals list
- Your organization name appears in top navigation

---

### Step 4: Email Verification (Optional)

**Verification Email:**
- Sent to your email address
- Subject: "Verify Your PriceIQ Account"
- Contains verification link

**Action:**
1. Check your email inbox (may take 1-2 minutes)
2. Open verification email
3. Click "Verify Email" button
4. Redirected to PriceIQ with confirmation message

**Note**: Some features may be limited until email is verified (organization-dependent setting).

---

## Logging In (After Initial Signup)

### Login Page

**How to Access:**
1. Go to PriceIQ website
2. If not logged in, click "Login" button (top-right, or auto-redirect)
3. Login form appears

**What You'll See:**
- **Email field**
- **Password field**
- **"Forgot Password?" link** (below password field)
- **"Remember Me" checkbox** (optional)
- **"Login" button** (blue, bottom)
- **"Don't have an account? Sign Up" link** (bottom, below Login button)

---

### Login Process

**Step 1: Enter Credentials**
1. **Type** your email address in Email field
2. **Type** your password in Password field (masked)
3. **Optional**: Check "Remember Me" (keeps you logged in for 30 days)

**Step 2: Click Login**
1. **Click** "Login" button (blue)
2. **Processing**: System validates credentials (1-2 seconds)
3. **JWT Token**: Generated and stored in browser memory
4. **Redirect**: Dashboard loads

**Success Indicator:**
- Dashboard appears with your proposals
- Your name/email appears in top-right corner
- Organization name appears in top navigation

---

## Troubleshooting

### "Email already exists"

**Problem:** Email address already registered.

**Solutions:**
- **Login instead**: Click "Login" link and use existing credentials
- **Forgot password**: Click "Forgot Password?" and reset
- **Different email**: Use a different email address (if you want separate account)

---

### "Password too weak"

**Problem:** Password doesn't meet security requirements.

**Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one symbol (e.g., !@#$%^&*)

**Solution:** Choose a stronger password like: `Pr1ce!Q2025`

---

### "Must accept Terms & Conditions"

**Problem:** Terms checkbox not checked.

**Solution:**
1. Read Terms & Conditions (click link)
2. Check the checkbox
3. Click "Create Account" again

---

### "Invalid email format"

**Problem:** Email doesn't follow valid format.

**Valid formats:**
- yourname@company.com ✓
- first.last@subdomain.company.org ✓
- user+tag@domain.co.uk ✓

**Invalid formats:**
- yourname@ (missing domain) ✗
- @company.com (missing username) ✗
- yourname.company.com (missing @) ✗

---

### Verification email not received

**Possible causes:**
1. **Spam folder**: Check spam/junk folder
2. **Typo in email**: Re-check email address entered during signup
3. **Delayed**: May take 5-10 minutes in rare cases
4. **Blocked**: Corporate email filter may block automated emails

**Solutions:**
- Wait 10 minutes and check spam folder
- Contact support@priceiq.com for manual verification
- Request resend verification email (from Settings → Account)

---

### Can't login after signup

**Problem:** "Invalid credentials" error on login attempt.

**Possible causes:**
1. **Wrong password**: Check caps lock, spelling
2. **Wrong email**: Verify email address (check signup confirmation email)
3. **Account not activated**: Check email for verification link
4. **Browser issue**: Clear cache and cookies

**Solutions:**
- Use "Forgot Password?" to reset
- Copy-paste email from signup confirmation email
- Try different browser (Chrome, Firefox, Edge)
- Contact support if issue persists

---

## Joining via Invitation (Team Members)

**If you received an email invitation from your organization admin:**

### Step 1: Open Invitation Email

**Email details:**
- **From**: noreply@priceiq.com (or your org's email)
- **Subject**: "You're invited to join [Organization Name] on PriceIQ"
- **Contains**: Blue "Accept Invitation" button

---

### Step 2: Click Accept Invitation

**Action:**
1. **Click** "Accept Invitation" button in email
2. **Redirect**: PriceIQ signup page with pre-filled organization info
3. **Note**: Invitation link is single-use and expires in 7 days

---

### Step 3: Complete Signup

**If you don't have an account:**
1. Enter email address (must match invitation email)
2. Create password
3. Check Terms & Conditions
4. Click "Accept Invitation & Create Account"

**If you already have an account:**
1. Login with existing credentials
2. Confirm joining organization
3. Click "Accept Invitation"

**Result:**
- You're added to the organization
- Your role is assigned (Admin or User, set by inviter)
- You can now see organization proposals (depending on role)

---

### Step 4: Access Organization Workspace

**What happens:**
1. Dashboard loads showing organization context
2. Organization name appears in top navigation
3. If Admin: You see all organization proposals
4. If User: You see your own + shared proposals

---

## After Signup: Next Steps

**Recommended Path:**

1. **Verify Email** (if not done automatically)
   - Check inbox for verification email
   - Click verification link

2. **Complete Profile** (Optional but recommended)
   - Navigate to Settings (gear icon, top-right)
   - Add full name, job title, phone number
   - Upload profile photo (optional)

3. **Configure Organization Settings** (Admins only)
   - Settings → Organization tab
   - Set company indirect rates (Fringe, OH, G&A, Fee)
   - Configure escalation rates
   - Add company address for proposals

4. **Create Your First Proposal**
   - Follow: [Your First Proposal: 5-Minute Quick Start](03-first-proposal.md)
   - Upload a test RFP document
   - Explore the pricing workspace

5. **Invite Team Members** (Admins only)
   - Settings → Team tab
   - Click "Invite Team Member"
   - Enter email and assign role
   - Follow: [Inviting Team Members](../team-organization/02-inviting-team-members.md)

---

## Security Best Practices

**Password Security:**
- Use unique password (don't reuse from other sites)
- Enable password manager (1Password, LastPass, etc.)
- Change password every 90 days
- Never share password with team members

**Account Security:**
- Logout when using shared computers
- Don't check "Remember Me" on public computers
- Report suspicious activity immediately
- Enable 2FA if available (coming soon)

**Email Security:**
- Use work email (not personal)
- Don't forward invitation links (they're single-use)
- Report phishing attempts to support@priceiq.com

---

## Related Articles

**Next Steps:**
- [Your First Proposal: 5-Minute Quick Start](03-first-proposal.md)
- [Understanding Your Dashboard](04-understanding-dashboard.md)
- [What Documents Can I Upload?](05-supported-documents.md)

**Team Management:**
- [Inviting Team Members](../team-organization/02-inviting-team-members.md)
- [Understanding Organizations & Workspaces](../team-organization/01-organizations-workspaces.md)
- [Admin vs User Roles](../team-organization/03-admin-vs-user-roles.md)

**Troubleshooting:**
- [Login Problems](../troubleshooting/05-login-issues.md)
- [Invitation Not Received](../troubleshooting/06-invitation-issues.md)

---

## FAQs

**Q: Can I change my email address after signup?**
A: Contact support@priceiq.com for email changes (security verification required).

**Q: Can I use the same email for multiple organizations?**
A: Yes! You can join multiple organizations and switch between them.

**Q: What happens if I forget my password?**
A: Click "Forgot Password?" on login page, enter email, follow reset instructions.

**Q: Can I delete my account?**
A: Contact support@priceiq.com for account deletion (permanent, cannot be undone).

**Q: Is there a free trial?**
A: Contact sales@priceiq.com for trial access and pricing information.

---

**Need help?** Contact support@priceiq.com

**Last Updated**: January 15, 2026
