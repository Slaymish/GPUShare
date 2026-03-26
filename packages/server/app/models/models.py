"""SQLAlchemy ORM models for GPUShare."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        String, default="pending", server_default=text("'pending'")
    )
    role: Mapped[str] = mapped_column(
        String, default="user", server_default=text("'user'")
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    billing_type: Mapped[str] = mapped_column(
        String, default="postpaid", server_default=text("'postpaid'")
    )
    hard_limit_nzd: Mapped[Decimal] = mapped_column(
        Numeric, default=Decimal("-20.00"), server_default=text("-20.00")
    )
    services_enabled: Mapped[List[str]] = mapped_column(
        ARRAY(String),
        server_default=text("'{inference,render}'"),
    )
    password_reset_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    password_reset_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    theme: Mapped[str] = mapped_column(
        String, default="default", server_default=text("'default'")
    )
    auto_light_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    auto_heavy_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    auto_token_threshold: Mapped[int] = mapped_column(
        Integer, default=2000, server_default=text("2000")
    )
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )

    # Relationships
    api_keys: Mapped[List["ApiKey"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    credit_entries: Mapped[List["CreditLedger"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    usage_logs: Mapped[List["UsageLog"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    render_jobs: Mapped[List["RenderJob"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    invoices: Mapped[List["Invoice"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    key_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_used: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="api_keys")


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    claimed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )
    claimed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stripe_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="credit_entries")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    model: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_nzd: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    kwh: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="usage_logs")


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String, default="queued", server_default=text("'queued'")
    )
    engine: Mapped[str] = mapped_column(String, nullable=False)
    frame_start: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1")
    )
    frame_end: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    samples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resolution_x: Mapped[int] = mapped_column(
        Integer, default=1920, server_default=text("1920")
    )
    resolution_y: Mapped[int] = mapped_column(
        Integer, default=1080, server_default=text("1080")
    )
    output_format: Mapped[str] = mapped_column(
        String, default="PNG", server_default=text("'PNG'")
    )
    blend_file_key: Mapped[str] = mapped_column(String, nullable=False)
    output_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    download_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    download_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    frames_done: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0")
    )
    render_seconds: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    cost_nzd: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="render_jobs")


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    amount_nzd: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    stripe_invoice_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(
        String, default="pending", server_default=text("'pending'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="invoices")
