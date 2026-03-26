"""GPU auto-detection for accurate power consumption estimates.

Queries nvidia-smi for TDP/power limits, uses VRAM-based heuristics as
fallback, and supports Apple Silicon via sysctl.
"""

from __future__ import annotations

import platform
import subprocess
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class GpuInfo:
    """Detected GPU information."""

    name: str
    vendor: str  # "nvidia" | "apple" | "amd" | "unknown"
    vram_mb: int
    tdp_watts: float | None  # TDP from nvidia-smi if available
    inference_watts: float  # Estimated GPU draw during inference
    render_watts: float  # Estimated GPU draw during Blender rendering
    system_watts: float  # CPU + RAM + drives idle draw

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "vendor": self.vendor,
            "vram_mb": self.vram_mb,
            "tdp_watts": self.tdp_watts,
            "inference_watts": self.inference_watts,
            "render_watts": self.render_watts,
            "system_watts": self.system_watts,
        }


def _run_cmd(cmd: list[str]) -> str | None:
    """Run a command and return stripped stdout, or None on failure."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass
    return None


def _detect_nvidia() -> GpuInfo | None:
    """Detect NVIDIA GPU via nvidia-smi and read TDP."""
    name = _run_cmd(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits"])
    if not name:
        return None

    vram_str = _run_cmd(
        ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"]
    )
    vram_mb = int(float(vram_str)) if vram_str else 0

    # TDP / power limit — the key value for accurate cost calculation
    tdp_str = _run_cmd(
        ["nvidia-smi", "--query-gpu=power.limit", "--format=csv,noheader,nounits"]
    )
    tdp_watts = float(tdp_str) if tdp_str else None

    # Derive per-workload estimates from TDP or VRAM heuristics
    if tdp_watts and tdp_watts > 0:
        # Inference: sustained compute, ~80% of TDP
        inference_watts = round(tdp_watts * 0.80, 1)
        # Render: sustained 3D, closer to TDP
        render_watts = round(tdp_watts * 0.95, 1)
    else:
        # VRAM-based fallback heuristic
        vram_gb = vram_mb / 1024
        if vram_gb >= 24:
            inference_watts, render_watts = 280.0, 380.0
        elif vram_gb >= 16:
            inference_watts, render_watts = 200.0, 300.0
        elif vram_gb >= 8:
            inference_watts, render_watts = 150.0, 200.0
        else:
            inference_watts, render_watts = 100.0, 150.0

    return GpuInfo(
        name=name.strip(),
        vendor="nvidia",
        vram_mb=vram_mb,
        tdp_watts=tdp_watts,
        inference_watts=inference_watts,
        render_watts=render_watts,
        system_watts=80.0,
    )


def _detect_apple_silicon() -> GpuInfo | None:
    """Detect Apple Silicon GPU via sysctl."""
    if platform.system() != "Darwin":
        return None

    # Try to get GPU model name
    brand = _run_cmd(["sysctl", "-n", "machdep.cpu.brand_string"])
    if not brand or "Apple" not in brand:
        # Check for Apple GPU via system_profiler
        sp = _run_cmd(["system_profiler", "SPDisplaysDataType"])
        if sp:
            for line in sp.split("\n"):
                if "Chip:" in line or "Chipset Model:" in line:
                    brand = line.split(":", 1)[-1].strip()
                    break
        if not brand:
            brand = "Apple Silicon"

    # Total RAM = unified memory
    mem_bytes_str = _run_cmd(["sysctl", "-n", "hw.memsize"])
    vram_mb = int(int(mem_bytes_str) / (1024 * 1024)) if mem_bytes_str else 8192

    # Apple Silicon TDP estimates by chip family
    brand_lower = brand.lower()
    if "m4" in brand_lower:
        tdp_watts = 22.0
        inference_watts, render_watts = 18.0, 20.0
    elif "m3" in brand_lower:
        tdp_watts = 20.0
        inference_watts, render_watts = 16.0, 18.0
    elif "m2" in brand_lower:
        tdp_watts = 20.0
        inference_watts, render_watts = 15.0, 17.0
    elif "m1" in brand_lower:
        tdp_watts = 15.0
        inference_watts, render_watts = 12.0, 14.0
    else:
        tdp_watts = 20.0
        inference_watts, render_watts = 15.0, 17.0

    return GpuInfo(
        name=brand,
        vendor="apple",
        vram_mb=vram_mb,
        tdp_watts=tdp_watts,
        inference_watts=inference_watts,
        render_watts=render_watts,
        system_watts=25.0,  # Apple Silicon system idle
    )


def _detect_amd() -> GpuInfo | None:
    """Detect AMD GPU via rocm-smi (Linux)."""
    if platform.system() != "Linux":
        return None

    name = _run_cmd(["rocm-smi", "--showproductname", "--csv"])
    if not name or "GPU" not in name:
        return None

    # Parse first GPU name from CSV output
    lines = name.split("\n")
    gpu_name = "AMD GPU"
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) >= 2:
            gpu_name = parts[1].strip().strip('"')
            break

    # rocm-smi power readings if available
    power_str = _run_cmd(["rocm-smi", "--showpower", "--csv"])
    tdp_watts = None
    if power_str:
        for line in power_str.split("\n")[1:]:
            parts = line.split(",")
            if len(parts) >= 2:
                try:
                    tdp_watts = float(parts[1].strip())
                except ValueError:
                    pass
                break

    if tdp_watts and tdp_watts > 0:
        inference_watts = round(tdp_watts * 0.80, 1)
        render_watts = round(tdp_watts * 0.95, 1)
    else:
        inference_watts, render_watts = 200.0, 300.0

    return GpuInfo(
        name=gpu_name,
        vendor="amd",
        vram_mb=0,
        tdp_watts=tdp_watts,
        inference_watts=inference_watts,
        render_watts=render_watts,
        system_watts=80.0,
    )


@lru_cache(maxsize=1)
def detect_gpu() -> GpuInfo:
    """Auto-detect GPU and return power consumption estimates.

    Tries NVIDIA → Apple Silicon → AMD → unknown fallback.
    Results are cached for the lifetime of the process.
    """
    for detector in (_detect_nvidia, _detect_apple_silicon, _detect_amd):
        result = detector()
        if result:
            return result

    # Safe fallback
    return GpuInfo(
        name="Unknown GPU",
        vendor="unknown",
        vram_mb=0,
        tdp_watts=None,
        inference_watts=150.0,
        render_watts=300.0,
        system_watts=80.0,
    )
