"""Billing router — balance, usage, invoices, Stripe payments, and webhooks.

Stripe operations (topup, setup, webhooks) stay in the middleware since they
don't require hardware access. DB reads for balance/usage/invoices are done
directly here.
"""

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
from app.auth.dependencies import get_current_user
from app.lib.billing import get_balance, get_this_month_usage, write_ledger_entry
from app.models import CreditLedger, Invoice, UsageLog, User
from app.schemas.billing import (
    BalanceResponse,
    InvoiceResponse,
    PaymentMethodResponse,
    SetupIntentResponse,
    TopUpRequest,
    TopUpResponse,
    UsageLogResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/account", tags=["account"])


@router.get("/balance", response_model=BalanceResponse)
async def account_balance(
    user: User | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        return BalanceResponse(
            balance_nzd=0.0,
            this_month_usage_nzd=0.15,
            hard_limit_nzd=0.0,
            billing_type="prepaid",
            total_topped_up_nzd=0.0,
            total_used_nzd=0.15,
            total_inference_cost_nzd=0.15,
            total_cloud_inference_cost_nzd=0.15,
            total_render_cost_nzd=0.0,
        )

    balance = await get_balance(db, user.id)
    month_usage = await get_this_month_usage(db, user.id)

    topped_up_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id, CreditLedger.amount > 0
        )
    )
    total_topped_up = float(topped_up_result.scalar_one())

    used_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id, CreditLedger.amount < 0
        )
    )
    total_used = abs(float(used_result.scalar_one()))

    inference_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id,
            CreditLedger.type.in_(["inference_usage", "cloud_inference_usage"]),
        )
    )
    total_inference_cost = abs(float(inference_result.scalar_one()))

    cloud_inference_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id,
            CreditLedger.type == "cloud_inference_usage",
        )
    )
    total_cloud_inference_cost = abs(float(cloud_inference_result.scalar_one()))

    render_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user.id, CreditLedger.type == "render_usage"
        )
    )
    total_render_cost = abs(float(render_result.scalar_one()))

    return BalanceResponse(
        balance_nzd=float(balance),
        this_month_usage_nzd=float(month_usage),
        hard_limit_nzd=float(user.hard_limit_nzd),
        billing_type=user.billing_type,
        total_topped_up_nzd=total_topped_up,
        total_used_nzd=total_used,
        total_inference_cost_nzd=total_inference_cost,
        total_cloud_inference_cost_nzd=total_cloud_inference_cost,
        total_render_cost_nzd=total_render_cost,
    )


@router.get("/usage", response_model=list[UsageLogResponse])
async def account_usage(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UsageLog)
        .where(UsageLog.user_id == user.id)
        .order_by(UsageLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [UsageLogResponse.model_validate(r) for r in result.scalars().all()]


@router.get("/invoices", response_model=list[InvoiceResponse])
async def account_invoices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at.desc())
    )
    return [InvoiceResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/topup", response_model=TopUpResponse)
async def account_topup(
    body: TopUpRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.name or user.email,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        await db.flush()

    amount_cents = int(round(body.amount_nzd * 100))
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
                        "name": "GPUShare Credit Top-Up",
                        "description": f"NZ${body.amount_nzd:.2f} credit",
                    },
                },
                "quantity": 1,
            }
        ],
        metadata={"user_id": str(user.id), "type": "topup"},
        success_url="https://gpunode.app/account?topup=success",
        cancel_url="https://gpunode.app/account?topup=cancelled",
    )
    return TopUpResponse(checkout_url=session.url)


@router.post("/payment-method/setup", response_model=SetupIntentResponse)
async def setup_payment_method(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.name or user.email,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        await db.flush()

    setup_intent = stripe.SetupIntent.create(
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
        metadata={"user_id": str(user.id)},
    )
    return SetupIntentResponse(client_secret=setup_intent.client_secret)


@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
async def list_payment_methods(user: User = Depends(get_current_user)):
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    if not user.stripe_customer_id:
        return []

    payment_methods = stripe.PaymentMethod.list(customer=user.stripe_customer_id, type="card")
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


@router.delete("/payment-methods/{payment_method_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_method(
    payment_method_id: str,
    user: User = Depends(get_current_user),
):
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        payment_method = stripe.PaymentMethod.retrieve(payment_method_id)
        if payment_method.customer != user.stripe_customer_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Payment method does not belong to this user")
        stripe.PaymentMethod.detach(payment_method_id)
    except stripe.error.InvalidRequestError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment method not found")


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------

webhook_router = APIRouter(tags=["webhooks"])


@webhook_router.post("/v1/webhooks/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    stripe.api_key = settings.STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature header")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")

    event_type = event["type"]
    data_object = event["data"]["object"]

    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata", {})
        if metadata.get("type") != "topup":
            return {"status": "ignored"}
        user_id = metadata.get("user_id")
        amount_total = data_object.get("amount_total", 0)
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

    elif event_type == "invoice.paid":
        stripe_invoice_id = data_object.get("id")
        result = await db.execute(select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id))
        invoice = result.scalar_one_or_none()
        if invoice:
            invoice.status = "paid"
            invoice.paid_at = datetime.utcnow()
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

    elif event_type == "invoice.payment_failed":
        stripe_invoice_id = data_object.get("id")
        result = await db.execute(select(Invoice).where(Invoice.stripe_invoice_id == stripe_invoice_id))
        invoice = result.scalar_one_or_none()
        if invoice:
            invoice.status = "failed"

    return {"status": "ok"}
