# Stripe Payment Gateway Integration Plan

## Overview
Integrate Stripe payment processing for two-tier pricing model (Basic Analysis + Advanced Analysis) with one-time payments. Users pay before receiving analysis results.

## Business Model
- **Basic Analysis**: $49 (upload docs → SOC codes → wage data → basic Excel)
- **Advanced Analysis**: $149 (everything + multi-year projections + escalation + full workbook)
- **Payment method**: One-time payment (not subscription)
- **Fulfillment**: After successful payment, process documents and deliver results

---

## Implementation Steps

### Phase 1: Stripe Account Setup (Day 1 - 30 minutes)

**Tasks:**
1. Create Stripe account at https://stripe.com
2. Complete business verification
   - Business name
   - Tax ID (EIN)
   - Bank account for payouts
   - Business address
3. Enable test mode for development
4. Save API keys (test + live):
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`
   - Webhook signing secret: `whsec_...`

**Files to create:**
- Add to `.env` file:
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  STRIPE_BASIC_PRICE_ID=price_...
  STRIPE_ADVANCED_PRICE_ID=price_...
  ```

---

### Phase 2: Install Dependencies (Day 1 - 5 minutes)

**Tasks:**
1. Add Stripe Python SDK to `pyproject.toml`
2. Run `uv add stripe`

**Files to modify:**
- `pyproject.toml` - add `stripe = "^8.0.0"`

---

### Phase 3: Create Stripe Products (Day 1 - 15 minutes)

**Tasks:**
1. In Stripe Dashboard → Products → Create Product:
   - **Product 1**: "Basic Pricing Analysis"
     - Price: $49.00 USD
     - One-time payment
     - Save price ID to env

   - **Product 2**: "Advanced Pricing Analysis"
     - Price: $149.00 USD
     - One-time payment
     - Save price ID to env

---

### Phase 4: Backend Implementation (Day 1-2 - 4 hours)

#### 4.1 Create Stripe Configuration File

**New file: `app/stripe_config.py`**

```python
"""
Stripe configuration and helper functions.
"""
import stripe
from app.settings import settings

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(
    tier: str,
    customer_email: str,
    metadata: dict,
    success_url: str,
    cancel_url: str
) -> stripe.checkout.Session:
    """
    Create a Stripe Checkout session.

    Args:
        tier: "basic" or "advanced"
        customer_email: Customer's email address
        metadata: Additional data to store (file_count, job_count, etc.)
        success_url: URL to redirect after successful payment
        cancel_url: URL to redirect if payment cancelled

    Returns:
        Stripe Checkout Session object
    """
    # Get price ID based on tier
    price_id = (
        settings.STRIPE_BASIC_PRICE_ID if tier == "basic"
        else settings.STRIPE_ADVANCED_PRICE_ID
    )

    session = stripe.checkout.Session.create(
        line_items=[{
            'price': price_id,
            'quantity': 1,
        }],
        mode='payment',
        success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url=cancel_url,
        customer_email=customer_email,
        metadata=metadata,
        payment_intent_data={
            'metadata': metadata
        }
    )

    return session


def verify_webhook_signature(payload: bytes, sig_header: str) -> stripe.Event:
    """
    Verify Stripe webhook signature and return event.

    Args:
        payload: Raw request body
        sig_header: Stripe-Signature header value

    Returns:
        Verified Stripe Event

    Raises:
        ValueError: If signature is invalid
    """
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
        return event
    except ValueError:
        raise ValueError("Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise ValueError("Invalid signature")


def get_session_details(session_id: str) -> dict:
    """
    Get Stripe Checkout Session details.

    Args:
        session_id: Stripe session ID

    Returns:
        Dictionary with session details
    """
    session = stripe.checkout.Session.retrieve(session_id)

    return {
        'id': session.id,
        'payment_status': session.payment_status,
        'amount_total': session.amount_total,
        'customer_email': session.customer_email,
        'metadata': session.metadata,
        'payment_intent': session.payment_intent
    }


def create_refund(payment_intent_id: str, reason: str = None) -> stripe.Refund:
    """
    Create a refund for a payment.

    Args:
        payment_intent_id: Stripe PaymentIntent ID
        reason: Reason for refund

    Returns:
        Stripe Refund object
    """
    refund = stripe.Refund.create(
        payment_intent=payment_intent_id,
        reason=reason
    )
    return refund
```

---

#### 4.2 Create Payment Router

**New file: `routers/payments.py`**

```python
"""
Payment router for Stripe integration.
"""
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging

from app.stripe_config import (
    create_checkout_session,
    verify_webhook_signature,
    get_session_details
)
from utils.email import send_payment_confirmation, send_analysis_complete

router = APIRouter()
logger = logging.getLogger(__name__)


class CheckoutRequest(BaseModel):
    tier: str  # "basic" or "advanced"
    customer_email: EmailStr
    file_count: int
    job_count: int
    file_names: list[str]


class VerifyPaymentRequest(BaseModel):
    session_id: str


@router.post("/create-checkout")
async def create_checkout(data: CheckoutRequest):
    """
    Create a Stripe Checkout session for payment.

    Returns checkout URL to redirect user to Stripe.
    """
    try:
        # Validate tier
        if data.tier not in ["basic", "advanced"]:
            raise HTTPException(status_code=400, detail="Invalid tier")

        # Prepare metadata
        metadata = {
            "tier": data.tier,
            "file_count": str(data.file_count),
            "job_count": str(data.job_count),
            "file_names": ",".join(data.file_names)
        }

        # Create checkout session
        session = create_checkout_session(
            tier=data.tier,
            customer_email=data.customer_email,
            metadata=metadata,
            success_url="http://localhost:8000/success",
            cancel_url="http://localhost:8000/cancel"
        )

        logger.info(f"Created checkout session: {session.id}")

        return {
            "checkout_url": session.url,
            "session_id": session.id
        }

    except Exception as e:
        logger.error(f"Error creating checkout: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-payment")
async def verify_payment(data: VerifyPaymentRequest):
    """
    Verify that a payment was completed successfully.
    """
    try:
        session_details = get_session_details(data.session_id)

        if session_details['payment_status'] != 'paid':
            raise HTTPException(
                status_code=402,
                detail="Payment not completed"
            )

        return {
            "paid": True,
            "amount": session_details['amount_total'],
            "tier": session_details['metadata'].get('tier'),
            "customer_email": session_details['customer_email']
        }

    except Exception as e:
        logger.error(f"Error verifying payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Handle Stripe webhook events.

    This endpoint receives notifications from Stripe when events occur
    (e.g., payment succeeded, payment failed).
    """
    try:
        # Get raw payload and signature
        payload = await request.body()
        sig_header = request.headers.get('stripe-signature')

        if not sig_header:
            raise HTTPException(status_code=400, detail="Missing signature")

        # Verify webhook signature
        event = verify_webhook_signature(payload, sig_header)

        logger.info(f"Received webhook: {event['type']}")

        # Handle different event types
        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']

            # Payment successful - trigger background processing
            background_tasks.add_task(
                process_paid_analysis,
                session_id=session['id'],
                customer_email=session['customer_email'],
                metadata=session['metadata']
            )

            logger.info(f"Payment completed: {session['id']}")

        elif event['type'] == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            logger.warning(f"Payment failed: {payment_intent['id']}")

        return JSONResponse(content={"status": "success"})

    except ValueError as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_paid_analysis(session_id: str, customer_email: str, metadata: dict):
    """
    Background task to process analysis after payment.

    This function:
    1. Retrieves uploaded files
    2. Processes with agents
    3. Generates Excel/dashboard
    4. Sends email with results
    """
    try:
        tier = metadata.get('tier')

        # Send confirmation email
        send_payment_confirmation(customer_email, tier)

        # TODO: Implement actual processing logic
        # 1. Retrieve files from temporary storage
        # 2. Call process_dataframe_with_agents()
        # 3. Generate Excel workbook
        # 4. Store results in database
        # 5. Generate download link

        # Send completion email
        download_url = f"http://yourapp.com/download/{session_id}"
        send_analysis_complete(customer_email, download_url, tier)

        logger.info(f"Analysis completed for session: {session_id}")

    except Exception as e:
        logger.error(f"Error processing analysis: {e}")
        # TODO: Send error email to customer
        # TODO: Consider automatic refund
```

---

#### 4.3 Modify Existing Pricing Router

**File: `routers/pricing.py`**

**Add new preview endpoint:**

```python
@router.post("/preview")
async def preview_documents(files: List[UploadFile] = File(...)):
    """
    Preview uploaded documents without processing wage data.

    Returns job count and preview info for pricing selection.
    """
    temp_dir = None

    try:
        # Create temp directory for uploaded files
        temp_dir = Path(tempfile.mkdtemp())
        file_paths = []
        file_names = []

        # Save uploaded files
        for file in files:
            file_path = temp_dir / file.filename
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            file_paths.append(str(file_path))
            file_names.append(file.filename)

        # Step 1: Parse documents to DataFrame (without wage data)
        df = await parse_documents_to_dataframe(file_paths)

        # Return preview data
        preview_data = {
            "job_count": len(df),
            "file_count": len(files),
            "file_names": file_names,
            "jobs_preview": df[['labor_category', 'experience', 'location', 'hours']].to_dict('records')[:10]
        }

        return JSONResponse(content=preview_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/process")
async def process_documents(
    files: List[UploadFile] = File(...),
    session_id: str = None
):
    """
    Process documents AFTER payment verification.

    Requires session_id from Stripe Checkout.
    """
    # Verify payment first
    if not session_id:
        raise HTTPException(
            status_code=402,
            detail="Payment required. Please complete checkout first."
        )

    try:
        # Verify session and payment status
        session_details = get_session_details(session_id)

        if session_details['payment_status'] != 'paid':
            raise HTTPException(
                status_code=402,
                detail="Payment not completed"
            )

        # Get tier from metadata
        tier = session_details['metadata'].get('tier', 'basic')

        # ... rest of existing processing logic ...

        # Return results based on tier
        if tier == 'advanced':
            # Include multi-year projections
            pass

        return JSONResponse(content=response_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

#### 4.4 Update Settings

**File: `app/settings.py`**

Add Stripe configuration:

```python
class Settings(BaseSettings):
    # ... existing settings ...

    # Stripe Configuration
    STRIPE_SECRET_KEY: str
    STRIPE_PUBLISHABLE_KEY: str
    STRIPE_WEBHOOK_SECRET: str
    STRIPE_BASIC_PRICE_ID: str
    STRIPE_ADVANCED_PRICE_ID: str

    class Config:
        env_file = ".env"
```

---

### Phase 5: Frontend Implementation (Day 2 - 3 hours)

#### 5.1 Update Dashboard HTML

**File: `dashboard_test.html`**

**Add payment selection section (after upload section):**

```html
<!-- Payment Selection Section -->
<section id="payment-section" class="hidden">
    <div class="pricing-container">
        <h2>Select Analysis Type</h2>
        <p class="subtitle">Found <span id="preview-job-count">0</span> jobs in <span id="preview-file-count">0</span> files</p>

        <div class="pricing-cards">
            <!-- Basic Analysis Card -->
            <div class="pricing-card">
                <div class="card-header">
                    <h3>Basic Analysis</h3>
                    <div class="price">
                        <span class="currency">$</span>
                        <span class="amount">49</span>
                    </div>
                </div>
                <div class="card-body">
                    <ul class="features">
                        <li>✓ SOC code mapping</li>
                        <li>✓ BLS wage data (5 percentiles)</li>
                        <li>✓ Interactive dashboard</li>
                        <li>✓ Basic Excel export</li>
                        <li>✓ Jobs table with calculations</li>
                    </ul>
                </div>
                <div class="card-footer">
                    <button class="checkout-btn" onclick="checkout('basic')">
                        Get Basic Analysis
                    </button>
                </div>
            </div>

            <!-- Advanced Analysis Card -->
            <div class="pricing-card featured">
                <div class="badge">Most Popular</div>
                <div class="card-header">
                    <h3>Advanced Analysis</h3>
                    <div class="price">
                        <span class="currency">$</span>
                        <span class="amount">149</span>
                    </div>
                </div>
                <div class="card-body">
                    <ul class="features">
                        <li>✓ Everything in Basic, plus:</li>
                        <li>✓ Multi-year projections</li>
                        <li>✓ Escalation rate calculations</li>
                        <li>✓ Opportunity years modeling</li>
                        <li>✓ Complete Excel workbook</li>
                        <li>✓ Priority support</li>
                    </ul>
                </div>
                <div class="card-footer">
                    <button class="checkout-btn featured-btn" onclick="checkout('advanced')">
                        Get Advanced Analysis
                    </button>
                </div>
            </div>
        </div>

        <button class="back-btn" onclick="backToUpload()">← Back to Upload</button>
    </div>
</section>

<!-- Processing Section -->
<section id="processing-section" class="hidden">
    <div class="processing-container">
        <div class="spinner-large"></div>
        <h2>Processing Your Analysis</h2>
        <p>This may take a few moments. Please don't close this window.</p>
        <div class="progress-steps">
            <div class="step active">✓ Payment Confirmed</div>
            <div class="step active">⏳ Parsing Documents</div>
            <div class="step">⏳ Mapping SOC Codes</div>
            <div class="step">⏳ Fetching Wage Data</div>
            <div class="step">⏳ Generating Dashboard</div>
        </div>
    </div>
</section>
```

**Add styling:**

```css
.pricing-container {
    background: white;
    border-radius: 20px;
    padding: 60px 40px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    margin: 40px auto;
    max-width: 1200px;
}

.pricing-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 40px;
    margin: 40px 0;
}

.pricing-card {
    background: white;
    border: 2px solid #e0e0e0;
    border-radius: 20px;
    padding: 40px;
    transition: all 0.3s ease;
    position: relative;
}

.pricing-card:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 50px rgba(102, 126, 234, 0.3);
    border-color: #667eea;
}

.pricing-card.featured {
    border-color: #667eea;
    border-width: 3px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
}

.badge {
    position: absolute;
    top: -15px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
}

.price {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    margin: 20px 0;
}

.currency {
    font-size: 24px;
    font-weight: 600;
    color: #667eea;
}

.amount {
    font-size: 64px;
    font-weight: 700;
    color: #667eea;
}

.features {
    list-style: none;
    padding: 0;
    margin: 30px 0;
}

.features li {
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 15px;
}

.checkout-btn {
    width: 100%;
    padding: 18px;
    background: white;
    border: 2px solid #667eea;
    color: #667eea;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
}

.checkout-btn:hover {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.featured-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
}

.processing-container {
    text-align: center;
    padding: 80px 40px;
}

.spinner-large {
    width: 80px;
    height: 80px;
    border: 8px solid rgba(102, 126, 234, 0.2);
    border-top: 8px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 30px;
}

.progress-steps {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 40px;
    flex-wrap: wrap;
}

.step {
    padding: 10px 20px;
    background: #f5f5f5;
    border-radius: 20px;
    font-size: 14px;
    color: #86868b;
}

.step.active {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
    color: #667eea;
}
```

**Add JavaScript functions:**

```javascript
let previewData = null;

// Modified upload function to show preview
async function uploadFilesForPreview() {
    const formData = new FormData();
    const files = fileInput.files;

    if (files.length === 0) {
        alert('Please select at least one file');
        return;
    }

    Array.from(files).forEach(file => {
        formData.append('files', file);
    });

    // Show loading
    document.getElementById('loading').classList.remove('hidden');
    uploadBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/pricing/preview`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to preview documents');
        }

        previewData = await response.json();

        // Hide upload section, show payment selection
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('payment-section').classList.remove('hidden');

        // Update preview info
        document.getElementById('preview-job-count').textContent = previewData.job_count;
        document.getElementById('preview-file-count').textContent = previewData.file_count;

    } catch (error) {
        console.error('Error:', error);
        alert(`Error previewing documents: ${error.message}`);
    } finally {
        document.getElementById('loading').classList.add('hidden');
        uploadBtn.disabled = false;
    }
}

// Checkout function
async function checkout(tier) {
    try {
        // Get customer email (you might want to collect this earlier)
        const email = prompt('Please enter your email address:');
        if (!email) return;

        const response = await fetch(`${API_BASE}/api/payments/create-checkout`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                tier: tier,
                customer_email: email,
                file_count: previewData.file_count,
                job_count: previewData.job_count,
                file_names: previewData.file_names
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create checkout session');
        }

        const data = await response.json();

        // Redirect to Stripe Checkout
        window.location.href = data.checkout_url;

    } catch (error) {
        console.error('Error:', error);
        alert(`Error creating checkout: ${error.message}`);
    }
}

// Back to upload
function backToUpload() {
    document.getElementById('payment-section').classList.add('hidden');
    document.getElementById('upload-section').classList.remove('hidden');
}

// Handle return from Stripe (on success page)
async function handlePaymentSuccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) {
        console.error('No session ID found');
        return;
    }

    // Show processing section
    document.getElementById('processing-section').classList.remove('hidden');

    // Poll for completion
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/payments/verify-payment`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_id: sessionId})
            });

            if (response.ok) {
                const data = await response.json();
                if (data.paid) {
                    clearInterval(pollInterval);
                    // Process documents
                    await processWithSession(sessionId);
                }
            }
        } catch (error) {
            console.error('Error verifying payment:', error);
        }
    }, 2000);
}

async function processWithSession(sessionId) {
    // TODO: Implement document processing with session_id
    // This would upload the files again with session_id
    // Or retrieve them from temporary storage
}

// Call on page load if returning from Stripe
if (window.location.pathname === '/success') {
    handlePaymentSuccess();
}
```

---

#### 5.2 Create Success/Cancel Pages

**New file: `static/success.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 60px 40px;
            text-align: center;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        .checkmark {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: linear-gradient(135deg, #34c759 0%, #30d158 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 30px;
            font-size: 48px;
            color: white;
        }

        h1 {
            font-size: 32px;
            margin-bottom: 15px;
            color: #1d1d1f;
        }

        p {
            font-size: 16px;
            color: #86868b;
            margin-bottom: 30px;
        }

        .spinner {
            border: 4px solid rgba(102, 126, 234, 0.2);
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 30px auto;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="checkmark">✓</div>
        <h1>Payment Successful!</h1>
        <p>Thank you for your purchase. We're processing your analysis now.</p>
        <div class="spinner"></div>
        <p>You'll receive an email with your results shortly.<br>Don't close this window.</p>
    </div>

    <script>
        // Redirect to dashboard after processing
        setTimeout(() => {
            window.location.href = '/dashboard_test.html';
        }, 3000);
    </script>
</body>
</html>
```

**New file: `static/cancel.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Cancelled</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 60px 40px;
            text-align: center;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        .icon {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #ff3b30;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 30px;
            font-size: 48px;
            color: white;
        }

        h1 {
            font-size: 32px;
            margin-bottom: 15px;
            color: #1d1d1f;
        }

        p {
            font-size: 16px;
            color: #86868b;
            margin-bottom: 30px;
        }

        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 18px 50px;
            border-radius: 50px;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 40px rgba(102, 126, 234, 0.6);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✕</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment was cancelled. No charges were made.</p>
        <a href="/dashboard_test.html" class="btn">Return to Upload</a>
    </div>
</body>
</html>
```

---

### Phase 6: Email Notifications (Day 2 - 1 hour)

**New file: `utils/email.py`**

```python
"""
Email notification functions using SendGrid.
"""
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import logging

logger = logging.getLogger(__name__)

SENDGRID_API_KEY = os.getenv('SENDGRID_API_KEY')
FROM_EMAIL = os.getenv('FROM_EMAIL', 'noreply@yourapp.com')


def send_payment_confirmation(email: str, tier: str):
    """Send payment confirmation email."""
    amount = "$49" if tier == "basic" else "$149"

    message = Mail(
        from_email=FROM_EMAIL,
        to_emails=email,
        subject='Payment Confirmed - Pricing Analysis',
        html_content=f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0;">Payment Confirmed!</h1>
            </div>
            <div style="padding: 40px; background: #f9f9f9;">
                <p style="font-size: 16px;">Thank you for your purchase!</p>
                <p style="font-size: 14px; color: #666;">
                    We've received your payment of <strong>{amount}</strong> for the <strong>{tier.title()} Analysis</strong>.
                </p>
                <p style="font-size: 14px; color: #666;">
                    We're now processing your documents. You'll receive another email with your results shortly.
                </p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="font-size: 12px; color: #999;">
                    Questions? Contact us at support@yourapp.com
                </p>
            </div>
        </body>
        </html>
        """
    )

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"Payment confirmation sent to {email}")
    except Exception as e:
        logger.error(f"Error sending email: {e}")


def send_analysis_complete(email: str, download_url: str, tier: str):
    """Send analysis completion email with download link."""

    message = Mail(
        from_email=FROM_EMAIL,
        to_emails=email,
        subject='Your Pricing Analysis is Ready!',
        html_content=f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0;">Your Analysis is Ready!</h1>
            </div>
            <div style="padding: 40px; background: #f9f9f9;">
                <p style="font-size: 16px;">Great news! Your <strong>{tier.title()} Analysis</strong> is complete.</p>
                <p style="font-size: 14px; color: #666;">
                    Click the button below to view your interactive dashboard and download your results.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{download_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-size: 16px; display: inline-block;">
                        View Dashboard
                    </a>
                </div>
                <p style="font-size: 12px; color: #999;">
                    This link will expire in 7 days.
                </p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="font-size: 12px; color: #999;">
                    Questions? Contact us at support@yourapp.com
                </p>
            </div>
        </body>
        </html>
        """
    )

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"Analysis completion email sent to {email}")
    except Exception as e:
        logger.error(f"Error sending email: {e}")


def send_payment_failed(email: str, reason: str):
    """Send payment failure notification."""

    message = Mail(
        from_email=FROM_EMAIL,
        to_emails=email,
        subject='Payment Failed - Pricing Analysis',
        html_content=f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #ff3b30; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0;">Payment Failed</h1>
            </div>
            <div style="padding: 40px; background: #f9f9f9;">
                <p style="font-size: 16px;">We were unable to process your payment.</p>
                <p style="font-size: 14px; color: #666;">
                    Reason: {reason}
                </p>
                <p style="font-size: 14px; color: #666;">
                    Please try again or contact your bank for more information.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://yourapp.com" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-size: 16px; display: inline-block;">
                        Try Again
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                <p style="font-size: 12px; color: #999;">
                    Questions? Contact us at support@yourapp.com
                </p>
            </div>
        </body>
        </html>
        """
    )

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"Payment failure email sent to {email}")
    except Exception as e:
        logger.error(f"Error sending email: {e}")
```

**Add to `.env`:**
```
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=noreply@yourapp.com
```

---

### Phase 7: Database Models (Day 2 - 1 hour)

**New file: `models/payment.py`**

```python
"""
Database models for payments and analyses.
"""
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class Payment(Base):
    """Payment record from Stripe."""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    stripe_session_id = Column(String, unique=True, index=True, nullable=False)
    stripe_payment_intent_id = Column(String, unique=True, index=True)
    amount = Column(Integer, nullable=False)  # Amount in cents
    currency = Column(String, default="usd")
    tier = Column(String, nullable=False)  # "basic" or "advanced"
    status = Column(String, default="pending")  # pending, completed, failed, refunded
    customer_email = Column(String, nullable=False)
    metadata = Column(JSON)  # Store file info, job count, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)

    # Relationship
    analysis = relationship("Analysis", back_populates="payment", uselist=False)


class Analysis(Base):
    """Analysis results and processing status."""
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), unique=True)
    file_paths = Column(JSON)  # List of uploaded file paths
    results = Column(JSON)  # Complete analysis results
    status = Column(String, default="pending")  # pending, processing, completed, failed
    download_url = Column(String)  # Link to download results
    excel_path = Column(String)  # Path to generated Excel file
    expires_at = Column(DateTime)  # Link expiration date
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    error_message = Column(String)  # If processing failed

    # Relationship
    payment = relationship("Payment", back_populates="analysis")
```

**Create database tables:**

```python
# In app/database.py or similar
from models.payment import Base, Payment, Analysis

def create_tables(engine):
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)
```

---

### Phase 8: Testing Checklist (Day 3 - 2 hours)

#### Test Mode Testing

**Stripe Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Insufficient funds: `4000 0000 0000 9995`
- 3D Secure required: `4000 0025 0000 3155`

**Test Scenarios:**

1. **Happy Path - Basic**
   - [ ] Upload 3 PDF files
   - [ ] See preview with job count
   - [ ] Click "Get Basic Analysis"
   - [ ] Enter email
   - [ ] Redirect to Stripe
   - [ ] Enter test card 4242...
   - [ ] Complete payment
   - [ ] Webhook fires correctly
   - [ ] Email confirmation received
   - [ ] Processing completes
   - [ ] Dashboard loads with results
   - [ ] Excel export works

2. **Happy Path - Advanced**
   - [ ] Same flow as Basic
   - [ ] Verify $149 charge
   - [ ] Verify advanced features included

3. **Payment Declined**
   - [ ] Upload files
   - [ ] Select tier
   - [ ] Use decline card 4000 0000 0000 0002
   - [ ] See error message
   - [ ] Redirected to cancel page
   - [ ] No charge created

4. **3D Secure Authentication**
   - [ ] Use card 4000 0025 0000 3155
   - [ ] Complete 3D Secure challenge
   - [ ] Payment succeeds

5. **Webhook Failures**
   - [ ] Simulate webhook failure
   - [ ] Verify Stripe retries
   - [ ] Verify idempotency (no duplicate processing)

6. **Email Delivery**
   - [ ] Payment confirmation arrives
   - [ ] Analysis completion email arrives
   - [ ] Links work correctly

7. **Session Expiration**
   - [ ] Start checkout
   - [ ] Wait 24 hours
   - [ ] Verify session expired
   - [ ] Can't process with expired session

---

### Phase 9: Security & Production Prep (Day 3 - 1 hour)

**Security Checklist:**

1. **Environment Variables**
   - [ ] All Stripe keys in .env
   - [ ] .env in .gitignore
   - [ ] Never commit secrets

2. **Webhook Security**
   - [ ] Signature verification implemented
   - [ ] Reject unsigned webhooks
   - [ ] Log all webhook attempts

3. **Payment Verification**
   - [ ] Always verify session_id with Stripe API
   - [ ] Don't trust client-side data
   - [ ] Check payment_status === "paid"

4. **Rate Limiting**
   - [ ] Limit checkout creation (5/hour per IP)
   - [ ] Prevent abuse

5. **Error Handling**
   - [ ] Graceful error messages
   - [ ] Log all errors
   - [ ] Monitor failed payments

6. **Data Protection**
   - [ ] Never store card data
   - [ ] Encrypt sensitive info
   - [ ] HTTPS only in production

7. **CORS Configuration**
   - [ ] Restrict origins in production
   - [ ] Allow only your domain

---

### Phase 10: Go Live (Day 4)

#### Pre-Launch Checklist

- [ ] Stripe account fully verified
- [ ] Business information complete
- [ ] Bank account connected
- [ ] Switch to live API keys
- [ ] Update webhook endpoint to production URL
- [ ] Test live payment with real card (small amount)
- [ ] Verify webhook works in production
- [ ] Set up monitoring alerts
- [ ] Configure payout schedule
- [ ] Add Terms of Service link
- [ ] Add Refund Policy
- [ ] Test email delivery from production
- [ ] Set up customer support email

#### Launch Day

1. **Deploy to production**
   ```bash
   git push production main
   ```

2. **Update Stripe webhook**
   - Go to Stripe Dashboard → Webhooks
   - Update endpoint URL to production
   - Verify signing secret

3. **Test one live transaction**
   - Use your own credit card
   - Complete full flow
   - Verify webhook received
   - Verify email sent
   - Request refund after testing

4. **Monitor first transactions**
   - Watch Stripe Dashboard
   - Check logs for errors
   - Verify webhooks delivering

5. **Set up alerts**
   - Failed payment alert
   - Webhook failure alert
   - High error rate alert

---

## Files Summary

### New Files to Create

1. **Backend:**
   - `app/stripe_config.py` - Stripe initialization and helpers
   - `routers/payments.py` - Payment endpoints and webhook handler
   - `models/payment.py` - Database models for payments and analyses
   - `utils/email.py` - Email notification functions

2. **Frontend:**
   - `static/success.html` - Payment success page
   - `static/cancel.html` - Payment cancelled page

3. **Configuration:**
   - Update `.env` with Stripe keys

### Files to Modify

1. **Backend:**
   - `app/settings.py` - Add Stripe configuration
   - `app/server.py` - Register payments router
   - `routers/pricing.py` - Add preview endpoint, verify payment
   - `pyproject.toml` - Add stripe dependency

2. **Frontend:**
   - `dashboard_test.html` - Add payment selection UI

### Database Migrations

```sql
-- Create payments table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'usd',
    tier VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    customer_email VARCHAR(255) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Create analyses table
CREATE TABLE analyses (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER REFERENCES payments(id) UNIQUE,
    file_paths JSONB,
    results JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    download_url VARCHAR(500),
    excel_path VARCHAR(500),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Create indexes
CREATE INDEX idx_payments_session_id ON payments(stripe_session_id);
CREATE INDEX idx_payments_email ON payments(customer_email);
CREATE INDEX idx_analyses_payment_id ON analyses(payment_id);
CREATE INDEX idx_analyses_status ON analyses(status);
```

---

## Cost Estimates

### Per Transaction Costs

| Tier | Price | Stripe Fee | Net Revenue | Fee % |
|------|-------|------------|-------------|-------|
| Basic | $49.00 | $1.72 | $47.28 | 3.5% |
| Advanced | $149.00 | $4.62 | $144.38 | 3.1% |

### Monthly Projections (Example)

**At 100 transactions/month:**
- 70 Basic ($49) = $3,430
- 30 Advanced ($149) = $4,470
- **Total Revenue:** $7,900
- **Stripe Fees:** $259
- **Net Revenue:** $7,641 (96.7%)

**At 500 transactions/month:**
- 350 Basic = $17,150
- 150 Advanced = $22,350
- **Total Revenue:** $39,500
- **Stripe Fees:** $1,295
- **Net Revenue:** $38,205 (96.7%)

### Additional Costs

- SendGrid: Free for first 100 emails/day
- Server hosting: ~$50-200/month
- Domain: ~$15/year
- SSL: Free (Let's Encrypt)

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 1. Stripe Account Setup | 30 min | 30 min |
| 2. Install Dependencies | 5 min | 35 min |
| 3. Create Products | 15 min | 50 min |
| 4. Backend Implementation | 4 hours | 5 hours |
| 5. Frontend Implementation | 3 hours | 8 hours |
| 6. Email Integration | 1 hour | 9 hours |
| 7. Database Models | 1 hour | 10 hours |
| 8. Testing | 2 hours | 12 hours |
| 9. Security & Production Prep | 1 hour | 13 hours |
| 10. Go Live | 1 day | 2-3 days |

**Total Implementation Time: 2-3 days** (for experienced developer)

---

## Support Resources

1. **Stripe Documentation:**
   - Checkout: https://stripe.com/docs/payments/checkout
   - Webhooks: https://stripe.com/docs/webhooks
   - Python SDK: https://stripe.com/docs/api/python

2. **FastAPI + Stripe Tutorials:**
   - https://www.fast-saas.com/blog/fastapi-stripe-integration
   - https://testdriven.io/blog/fastapi-stripe/

3. **Testing:**
   - Test cards: https://stripe.com/docs/testing
   - Webhook testing: https://stripe.com/docs/webhooks/test

4. **Stripe Support:**
   - Dashboard: https://dashboard.stripe.com
   - Support: https://support.stripe.com

---

## Next Steps

1. ✅ Save this plan
2. ⬜ Create Stripe account
3. ⬜ Set up test environment
4. ⬜ Implement backend endpoints
5. ⬜ Update frontend flow
6. ⬜ Test thoroughly
7. ⬜ Deploy to production
8. ⬜ Go live!

---

## Notes

- Start with test mode, don't use live keys until ready
- Test thoroughly with all test card scenarios
- Monitor first 10-20 transactions closely
- Set up alerts for failed payments
- Keep Stripe Dashboard open during launch
- Have customer support plan ready

**Questions?** Refer to Stripe documentation or ask for help!
