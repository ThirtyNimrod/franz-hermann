"""Atomic-ish per-session Parquet writes (hive-partitioned by session_id)."""
import shutil
import time
from pathlib import Path

import pandas as pd

from f1_ai.config import PARQUET_DIR

STAGING = PARQUET_DIR / "_staging"


def write_table(df: pd.DataFrame, table: str, session_id: str) -> Path:
    """Replace one session's partition of `table`. Readers never see a half-written file."""
    final_dir = PARQUET_DIR / table / f"session_id={session_id}"
    tmp_dir = STAGING / table / f"session_id={session_id}"
    shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    # session_id comes from the folder name (hive partitioning), so drop it from the file
    df.drop(columns=["session_id"], errors="ignore").to_parquet(tmp_dir / "part-0.parquet", index=False)

    final_dir.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(5):                      # Windows: a reader may briefly hold the old file
        try:
            if final_dir.exists():
                shutil.rmtree(final_dir)
            tmp_dir.rename(final_dir)
            return final_dir
        except PermissionError:
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"Could not replace {final_dir}; is a process holding it open?")
