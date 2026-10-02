"""Central configuration. Everything tunable lives here or in environment variables."""
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(os.environ.get("F1_ROOT", Path(__file__).resolve().parents[2]))
DATA_DIR = Path(os.environ.get("F1_DATA_DIR", ROOT / "data")).resolve()
CACHE_DIR = DATA_DIR / "fastf1_cache"
PARQUET_DIR = DATA_DIR / "parquet"
REPORTS_DIR = DATA_DIR / "reports"
PIPELINE_VERSION = "2.0.0"


@dataclass(frozen=True)
class ModelProfile:
    name: str
    num_ctx: int
    temperature: float
    top_p: float
    top_k: int | None = None
    presence_penalty: float | None = None
    num_predict: int = 1024

    def options(self) -> dict:
        opts: dict = {
            "num_ctx": self.num_ctx,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "num_predict": self.num_predict,
        }
        if self.top_k is not None:
            opts["top_k"] = self.top_k
        if self.presence_penalty is not None:
            opts["presence_penalty"] = self.presence_penalty
        return opts


MODELS = {
    "qwen3.5:4b": ModelProfile(
        "qwen3.5:4b",
        num_ctx=8192,
        temperature=0.7,
        top_p=0.8,
        top_k=20,
        presence_penalty=1.5,
    ),
    "granite4.2:8b": ModelProfile(
        "granite4.2:8b",
        num_ctx=8192,
        temperature=1.0,
        top_p=0.95,
    ),
}
DEBRIEF_MODEL = os.environ.get("F1_DEBRIEF_MODEL", "qwen3.5:4b")
CHAT_MODEL = os.environ.get("F1_CHAT_MODEL", "qwen3.5:4b")

# Lap classification (tune on fixtures)
PUSH_THRESHOLD = 1.015        # within 1.5 % of the driver's session best
COOLDOWN_THRESHOLD = 1.07     # slower than 107 % of the driver's best
LONG_RUN_MIN_LAPS = 5
LONG_RUN_BAND = 0.03          # long-run laps within ±3 % of the run median
WARMUP_LAPS = 1               # dropped from the start of each long run

# Telemetry thresholds
FULL_THROTTLE = 98            # percent; never test Throttle == 100
FULL_THROTTLE_HOLD_S = 0.5

# Fuel model: PLACEHOLDERS. Calibrate per circuit; 2026 cars carry much less fuel than 2025.
FUEL_KG_PER_LAP = float(os.environ.get("F1_FUEL_KG_PER_LAP", 1.2))
FUEL_S_PER_KG = float(os.environ.get("F1_FUEL_S_PER_KG", 0.03))
