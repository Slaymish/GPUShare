"""Billing router — balance, usage, invoices, top-up, and Stripe webhooks."""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.routers.auth import get_current_user
from app.lib.billing import get_balance, get_this_month_usage, write_ledger_entry
from app.models import CreditLedger, Invoice, UsageLog, User
from app.schemas.billing import (
    BalanceResponse,
    InvoiceResponse,
    TopUpRequest,
    TopUpResponse,
    UsageLogResponse,
    SetupIntentResponse,
    PaymentMethodResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/account", tags=["account"])


# ---------------------------------------------------------------------------
# GET /v1/account/balance
# ---------------------------------------------------------------------------
@router.get("/balance", response_model=BalanceResponse)
async def account_balance(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the caller's current credit balance and month-to-date usage."""
    balance = await get_balance(db, user.id)
    month_usage = await get_this_month_usage(db, user.id)

    # Total topped up (sum of all positive ledger entries)
    topped_up_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id,
            CreditLedger.amount > 0,
        )
    )
    total_topped_up = float(topped_up_result.scalar_one())

    # Total used (absolute sum of all negative ledger entries)
    used_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id,
            CreditLedger.amount < 0,
        )
    )
    total_used = abs(float(used_result.scalar_one()))

    return BalanceResponse(
        balance_nzd=float(balance),
        this_month_usage_nzd=float(month_usage),
        hard_limit_nzd=float(user.hard_limit_nzd),
        billing_type=user.billing_type,
        total_topped_up_nzd=total_topped_up,
        total_used_nzd=total_used,
    )


# ---------------------------------------------------------------------------
# GET /v1/account/usage
# ---------------------------------------------------------------------------
@router.get("/usage", response_model=list[UsageLogResponse])
async def account_usage(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated usage logs for the current user."""
    result = await db.execute(
        select(UsageLog)
        .where(UsageLog.user_id == user.id)
        .order_by(UsageLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()
    return [UsageLogResponse.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /v1/account/invoices
# ---------------------------------------------------------------------------
@router.get("/invoices", response_model=list[InvoiceResponse])
async def account_invoices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all invoices for the current user, newest first."""
    result = await db.execute(
        select(Invoice)
        .where(Invoice.user_id == user.id)
        .order_by(Invoice.created_at.desc())
    )
    rows = result.scalars().all()
    return [InvoiceResponse.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# POST /v1/account/topup
# ---------------------------------------------------------------------------
@router.post("/topup", response_model=TopUpResponse)
async def account_topup(
    body: TopUpRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Checkout Session for a prepaid credit top-up."""
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Ensure the user has a Stripe customer ID
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.name or user.email,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        await db.flush()

    amount_cents = int(round(body.amount_nzd * 100))
    frontend_url = settings.NODE_NAME  # placeholder; see success/cancel below

    session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        mode="payment",
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "nzd",
                    "unit_amount": amount_cents,
                    "product_data": {
                        "name": "GPU Node Credit Top-Up",
                        "description": f"NZ${body.amount_nzd:.2f} credit",
                    },
                },
                "quantity": 1,
            }
        ],
        metadata={
            "user_id": str(user.id),
            "type": "topup",
        },
        success_url="https://gpunode.app/account?topup=success",
        cancel_url="https://gpunode.app/account?topup=cancelled",
    )

    return TopUpResponse(checkout_url=session.url)


# ---------------------------------------------------------------------------
# POST /v1/account/payment-method/setup
# ---------------------------------------------------------------------------
@router.post("/payment-method/setup", response_model=SetupIntentResponse)
async def setup_payment_method(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Setup Intent for adding a payment method."""
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Ensure the user has a Stripe customer ID
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.name or user.email,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        await db.flush()

    # Create Setup Intent
    setup_intent = stripe.SetupIntent.create(
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
        metadata={"user_id": str(user.id)},
    )

    return SetupIntentResponse(client_secret=setup_intent.client_secret)


# ---------------------------------------------------------------------------
# GET /v1/account/payment-methods
# ---------------------------------------------------------------------------
@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
async def list_payment_methods(
    user: User = Depends(get_current_user),
):
    """List all payment methods for the current user."""
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    if not user.stripe_customer_id:
        return []

    payment_methods = stripe.PaymentMethod.list(
        customer=user.stripe_customer_id,
        type="card",
    )

    return [
        PaymentMethodResponse(
            id=pm.id,
            card_brand=pm.card.brand,
            card_last4=pm.card.last4,
            card_exp_month=pm.card.exp_month,
            card_exp_year=pm.card.exp_year,
        )
        for pm in payment_methods.data
    ]


# ---------------------------------------------------------------------------
# DELETE /v1/account/payment-methods/{payment_method_id}
# ---------------------------------------------------------------------------
@router.delete("/payment-methods/{payment_method_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_method(
    payment_method_id: str,
    user: User = Depends(get_current_user),
):
    """Detach a payment method from the customer."""
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        payment_method = stripe.PaymentMethod.retrieve(payment_method_id)
        
        # Verify this payment method belongs to this user's customer
        if payment_method.customer != user.stripe_customer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Payment method does not belong to this user",
            )
        
        stripe.PaymentMethod.detach(payment_method_id)
    except stripe.error.InvalidRequestError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment method not found",
        )


# ---------------------------------------------------------------------------
# POST /v1/webhooks/stripe  (no auth — verified by Stripe signature)
# ---------------------------------------------------------------------------
webhook_router = APIRouter(tags=["webhooks"])


@webhook_router.post("/v1/webhooks/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Receive and process Stripe webhook events.

    Verifies the request signature then handles:
      - checkout.session.completed  -> credit top-up
      - invoice.paid               -> mark invoice paid, ledger credit
      - invoice.payment_failed     -> mark invoice failed
    """
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe signature header",
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Stripe signature",
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload",
        )

    event_type = event["type"]
    data_object = event["data"]["object"]

    # ── checkout.session.completed ────────────────────────────────────
    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata", {})
        if metadata.get("type") != "topup":
            return {"status": "ignored"}

        user_id = metadata.get("user_id")
        amount_total = data_object.get("amount_total", 0)  # in cents
        amount_nzd = Decimal(str(amount_total)) / 100

        if user_id and amount_nzd > 0:
            from uuid import UUID

            await write_ledger_entry(
                db,
                user_id=UUID(user_id),
                amount=amount_nzd,
                entry_type="topup",
                description=f"Stripe top-up NZ${amount_nzd:.2f}",
                stripe_id=data_object.get("payment_intent"),
            )
            logger.info("Top-up of $%s credited to user %s", amount_nzd, user_id)

    # ── invoice.paid ──────────────────────────────────────────────────
    elif event_type == "invoice.paid":
        stripe_invoice_id = data_object.get("id")
        result = await db.execute(
            select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
        )
        invoice = result.scalar_one_or_none()

        if invoice:
            invoice.status = "paid"
            invoice.paid_at = datetime.utcnow()

            # Write a ledger credit entry (positive amount clears the debt)
            amount_paid = Decimal(str(data_object.get("amount_paid", 0))) / 100
            if amount_paid > 0:
                await write_ledger_entry(
                    db,
                    user_id=invoice.user_id,
                    amount=amount_paid,
                    entry_type="invoice_payment",
                    description=f"Invoice payment {stripe_invoice_id}",
                    stripe_id=stripe_invoice_id,
                )
            logger.info("Invoice %s marked as paid", stripe_invoice_id)

    # ── invoice.payment_failed ────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        stripe_invoice_id = data_object.get("id")
        result = await db.execute(
            select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id)
        )
        invoice = result.scalar_one_or_none()

        if invoice:
            invoice.status = "failed"
            logger.warning("Invoice %s payment failed", stripe_invoice_id)

    else:
        logger.debug("Unhandled Stripe event type: %s", event_type)

    return {"status": "ok"}
