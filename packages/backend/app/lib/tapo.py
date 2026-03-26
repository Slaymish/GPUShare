"""Tapo P110 smart plug integration for real-time energy monitoring."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class PowerReading:
    """Current power reading from the smart plug."""
    current_power_w: float      # watts being drawn right now
    today_energy_wh: float      # watt-hours used today
    month_energy_wh: float      # watt-hours used this month
    today_runtime_min: int      # minutes the plug has been on today
    month_runtime_min: int      # minutes the plug has been on this month


@dataclass
class EnergyUsageSummary:
    """Energy usage summary from the smart plug."""
    today_kwh: float
    month_kwh: float
    today_cost: float           # calculated from electricity rate
    month_cost: float           # calculated from electricity rate
    current_watts: float


def is_configured() -> bool:
    """Return True if Tapo credentials and device IP are set."""
    s = get_settings()
    return bool(s.TAPO_EMAIL and s.TAPO_PASSWORD and s.TAPO_DEVICE_IP)


async def get_current_power() -> Optional[PowerReading]:
    """Get the current power draw and energy usage from the Tapo plug."""
    if not is_configured():
        return None

    s = get_settings()
    try:
        from tapo import ApiClient

        client = ApiClient(s.TAPO_EMAIL, s.TAPO_PASSWORD)
        device = await client.p110(s.TAPO_DEVICE_IP)

        power = await device.get_current_power()
        energy = await device.get_energy_usage()

        power_dict = power.to_dict()
        energy_dict = energy.to_dict()

        return PowerReading(
            current_power_w=power_dict.get("current_power", 0),
            today_energy_wh=energy_dict.get("today_energy", 0),
            month_energy_wh=energy_dict.get("month_energy", 0),
            today_runtime_min=energy_dict.get("today_runtime", 0),
            month_runtime_min=energy_dict.get("month_runtime", 0),
        )
    except Exception as e:
        logger.warning("Tapo read failed: %s", e)
        return None


async def get_energy_summary() -> Optional[EnergyUsageSummary]:
    """Get a summary of energy usage with cost calculations."""
    reading = await get_current_power()
    if reading is None:
        return None

    s = get_settings()
    rate = s.ELECTRICITY_RATE_KWH

    today_kwh = reading.today_energy_wh / 1000
    month_kwh = reading.month_energy_wh / 1000

    return EnergyUsageSummary(
        today_kwh=round(today_kwh, 3),
        month_kwh=round(month_kwh, 3),
        today_cost=round(today_kwh * rate, 4),
        month_cost=round(month_kwh * rate, 4),
        current_watts=reading.current_power_w,
    )
