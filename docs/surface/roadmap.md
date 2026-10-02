# Formula 1 AI Race Engineer — Implementation Roadmap v2

## Phase 1: Surface Laptop 3 (development platform)

> **Companion document:** `f1_ai_race_engineer_alienware_deltas.md` lists everything that changes when the project moves to the Alienware M15 R2. This document is the complete plan; the companion only covers differences.
>
> **Revised:** October 2026. Updated for the 2026 technical regulations, Qwen3.5-4B, Granite 4.2 8B, and Ollama's thinking controls.

---

## 0. What changed from v1

| Area | v1 | v2 |
|---|---|---|
| Storage | One DuckDB file shared by the writer and the MCP server | Per-session Parquet files, read through DuckDB views (no file locks) |
| Lap selection | All laps treated alike | Every lap classified (`push`, `long_run`, `out_in`, `cooldown`, `invalid`); comparisons are always like-for-like |
| Corner metrics | Single-lap markers in "metres from lap start" | Markers relative to each corner, anchored per lap by X/Y position, reported as median and spread |
| Time loss | Inferred from markers | Measured per track segment (`segment_deltas`); markers explain it |
| Tyre degradation | OLS on stint lap index | Theil–Sen on `TyreLife`, with the fuel model stored next to every result |
| Straight-line analysis | DRS/ERS-era wing-trim logic | 2026 energy-deployment (clipping) signature, measured separately from drag |
| "Deep Agent" | Free-roaming agent | Deterministic pipeline with one structured LLM call per team, a grounding check, and a deterministic fallback |
| Local models | qwen2.5:3b / qwen3.5:9b | `qwen3.5:4b` (Surface primary), `granite4.2:8b` (comparison; Alienware primary), thinking disabled |
| Local chat | "Ollama as MCP client" | Explicit agent harness: MCP client SDK + Ollama tool calling |
| MCP server | 3 tools, JSON strings, relative paths, SSE | Discovery tools, enum parameters, structured returns, absolute paths, stdio |
| Quality | Manual inspection | Golden fixtures, physics invariants, and a per-model eval set |
| Grid | 20 drivers, hard-coded pairs | Teams and pairings derived from session data (11 teams in 2026) |

---

## 1. Principles

1. **Deterministic calculation layer.** The LLM never does arithmetic, telemetry slicing or curve fitting. It only rephrases numbers it was given.
2. **Like-for-like comparisons.** Every metric is computed per `run_type`. A qualifying-simulation lap is never compared with a long-run lap.
3. **Uncertainty travels with the number.** Every metric stores a lap count and a spread. The debrief only mentions differences larger than the spread.
4. **Model-agnostic access via MCP.** The same read-only tools serve IDE assistants, desktop clients and the local harness.
5. **Two execution modes.**
   - *Reactive:* ad-hoc questions through any MCP client ("Why did HAM lose time into T4?").
   - *Proactive:* a post-session debrief pipeline: deterministic facts → one LLM call per team → validation → storage.
6. **Reproducibility.** Dependencies are pinned in `uv.lock`, a few sessions are frozen as golden fixtures, and every stored debrief records the pipeline version, model, Ollama version and a hash of its inputs.

---

## 2. Architecture

```text
 [FastF1 API, cached locally]
            │
            ▼
 ┌───────────────────────────────┐
 │ Ingestion                     │  laps, telemetry, weather, circuit info
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ Lap classifier (run_type)     │  push / long_run / out_in / cooldown / invalid
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ Physics engine (NumPy, SciPy) │  corner anchoring, corner metrics,
 │                               │  segment deltas, tyre deg, energy signature
 └───────────────┬───────────────┘
                 ▼
 ┌───────────────────────────────┐
 │ Parquet store (per session)   │  atomic writes, no database locks
 │ + DuckDB views (read-only)    │
 └───────┬───────────────┬───────┘
         │               │
         ▼               ▼
 ┌────────────────┐   ┌─────────────────────────┐
 │ Debrief        │   │ MCP server (stdio)      │
 │ pipeline       │   │ read-only f1_* tools    │
 │ 1 LLM call per │   └────────────┬────────────┘
 │ team, JSON out │                │
 └───────┬────────┘      ┌─────────┴──────────────────┐
         │               ▼                            ▼
         │      IDE / desktop clients        Local agent harness
         │      (VS Code + Copilot,          (MCP client SDK + Ollama:
         │       Cursor, Claude Desktop)      qwen3.5:4b / granite4.2:8b)
         ▼
 session_highlights (Parquet) + Markdown reports
```

The debrief pipeline calls Ollama directly rather than going through MCP. It already holds the facts in-process, and MCP exists for clients that need to discover and fetch data. Both paths read the same Parquet store.

---

## 3. Hardware profile and model strategy

| Component | Surface Laptop 3 |
|---|---|
| CPU | Intel Core i5-1035G7 (4 cores / 8 threads, 15 W) |
| GPU | Intel Iris Plus G7 (shared memory) |
| RAM | 16 GB LPDDR4x |
| Role | Development, testing, CPU inference with small models |

**Model roles on the Surface**

| Model | Ollama tag | Size (Q4_K_M) | Role on Surface |
|---|---|---|---|
| Qwen3.5-4B | `qwen3.5:4b` | ~3.4 GB | Primary: debrief synthesis, harness development, tool-calling tests |
| Granite 4.2 8B | `granite4.2:8b` | ~5.3 GB | Secondary: eval comparisons and overnight batches; becomes primary on the Alienware |
| IDE / cloud models | via MCP | — | Heavy ad-hoc reasoning, within your plan's usage limits |

**Memory budget (approximate, 16 GB total)**

| Consumer | Typical use |
|---|---|
| Windows + VS Code + browser | 5–7 GB |
| FastF1 session load with telemetry | 1–3 GB |
| `qwen3.5:4b` loaded, 8k context | ~4 GB |
| `granite4.2:8b` loaded, 8k context | ~6.5 GB |

Run one model at a time, and don't run ingestion while Granite is loaded. Ingest first, then synthesise.

**Throughput (rough CPU estimates; measure your own)**

| Model | Generation | Prompt processing |
|---|---|---|
| `qwen3.5:4b` | ~6–10 tokens/s | ~40–80 tokens/s |
| `granite4.2:8b` | ~3–5 tokens/s | ~15–35 tokens/s |

Measure with `ollama run qwen3.5:4b --verbose`, which prints prompt and generation rates after each reply. Record the numbers in the eval results (§12) so you have a baseline for the Alienware.

*Optional:* llama.cpp's Vulkan build can use the Iris Plus iGPU. Gains on this iGPU are usually modest and memory is shared, so treat it as an experiment rather than part of the plan.

---

## 4. Ollama setup and disabling thinking

### 4.1 Install and pull models

```powershell
winget install Ollama.Ollama
ollama pull qwen3.5:4b
ollama pull granite4.2:8b
ollama list
```

Use the Ollama library tags above rather than third-party GGUF uploads. Some community Qwen3.5 GGUFs ship the vision projector as a separate file that Ollama can't load.

### 4.2 Server settings (Windows environment variables)

```powershell
setx OLLAMA_FLASH_ATTENTION 1       # required for a quantized KV cache
setx OLLAMA_KV_CACHE_TYPE q8_0      # roughly halves KV-cache memory vs f16
setx OLLAMA_CONTEXT_LENGTH 8192     # default context if a request doesn't set num_ctx
setx OLLAMA_MAX_LOADED_MODELS 1     # never hold two models in RAM at once
setx OLLAMA_NUM_PARALLEL 1          # parallel slots multiply KV-cache memory
setx OLLAMA_KEEP_ALIVE 10m          # unload the model after 10 idle minutes
```

Ollama only reads these at startup. Quit Ollama from the system tray and start it again after changing them.

### 4.3 Why thinking must be off

Both models are hybrid reasoning models. Ollama enables thinking **by default** in the CLI and API for models that support it. With thinking on, a small model can spend hundreds or thousands of tokens reasoning before it writes the JSON you asked for. On a CPU that means minutes per call, and it eats into an 8k context window.

Qwen's own chat template defaults its small models (0.8B–9B) to non-thinking, and Granite 4.2 defaults to thinking. Don't rely on either default. Always disable thinking explicitly and verify it (§4.5).

`--hidethinking` is **not** the same as disabling thinking. It only hides the trace; the model still generates it, so you still pay for it in time.

### 4.4 How to disable thinking

| Where you call the model | How to disable thinking |
|---|---|
| Interactive CLI session | `ollama run qwen3.5:4b`, then type `/set nothink` (re-enable with `/set think`) |
| One-shot CLI | `ollama run granite4.2:8b --think=false "your prompt"` |
| Native REST API (`/api/chat`, `/api/generate`) | Top-level `"think": false` in the request body (not inside `options`) |
| Python `ollama` library | `chat(..., think=False)` |
| OpenAI-compatible endpoint (`/v1/chat/completions`) | `"reasoning_effort": "none"` in the request body |
| llama-server (Alienware option) | `--chat-template-kwargs '{"enable_thinking":false}'` (see companion doc) |

**PowerShell (native API)**

```powershell
$body = @{
  model    = "qwen3.5:4b"
  messages = @(@{ role = "user"; content = "In one sentence: NOR was 0.21 s faster than PIA in sector 2." })
  think    = $false
  stream   = $false
  options  = @{ num_ctx = 8192 }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:11434/api/chat -Method Post `
  -Body $body -ContentType "application/json"
```

**Python (`ollama` library), which is what the project code uses**

```python
from ollama import chat

resp = chat(
    model="granite4.2:8b",
    messages=[{"role": "user", "content": "Reply with the word OK."}],
    think=False,                     # top-level argument, not inside options
    options={"num_ctx": 8192},
)
print(resp.message.content)
assert not resp.message.thinking     # empty when thinking is really off
```

**OpenAI-compatible clients**

Use this for tools that only speak the OpenAI API. Passing the value through `extra_body` avoids SDK-side validation of the effort value.

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
resp = client.chat.completions.create(
    model="qwen3.5:4b",
    messages=[{"role": "user", "content": "Reply with the word OK."}],
    extra_body={"reasoning_effort": "none"},
)
```

**Granite's low-effort mode.** Granite 4.2 also has a short-reasoning mode, selected with `reasoning_effort="low"` in its chat template. Ollama documents `think` levels (`"low"`, `"medium"`, `"high"`) for GPT-OSS. Whether your Ollama release maps them onto Granite's template is something to test, not assume. llama-server lets you set the template parameter directly (companion doc). The default for this project is thinking **off** everywhere.

**One rule for the codebase.** Thinking is a per-request setting. Every model call goes through one wrapper (`f1_ai/llm/ollama_client.py`, §10.1) that always sends `think=False`, so no call site can forget it.

### 4.5 Verify thinking is really off

`scripts/check_models.py`:

```python
"""Fails loudly if a model still produces a thinking trace, and prints speed."""
import sys
from ollama import chat

MODELS = ["qwen3.5:4b", "granite4.2:8b"]
PROMPT = [{"role": "user", "content": "List three F1 tyre compounds, comma separated."}]

failed = False
for model in MODELS:
    r = chat(model=model, messages=PROMPT, think=False, options={"num_ctx": 4096})
    thinking = r.message.thinking or ""
    tps = r.eval_count / (r.eval_duration / 1e9) if r.eval_duration else 0.0
    print(f"{model:16s} thinking_chars={len(thinking):5d} tokens={r.eval_count:4d} "
          f"speed={tps:5.1f} tok/s  reply={r.message.content.strip()[:60]!r}")
    failed |= bool(thinking) or "<think>" in r.message.content
sys.exit(1 if failed else 0)
```

Run it after every Ollama upgrade. Thinking behaviour has changed between releases before.

### 4.6 Sampling and context per model

| Setting | `qwen3.5:4b` (non-thinking) | `granite4.2:8b` (non-thinking) |
|---|---|---|
| `num_ctx` | 8192 | 8192 |
| `temperature` | 0.7 | 1.0 |
| `top_p` | 0.8 | 0.95 |
| `top_k` | 20 | default |
| `presence_penalty` | 1.5 | default |
| Max output for a debrief | ~1,000 tokens | ~1,000 tokens (IBM suggests ≤2,048 for non-thinking) |

- **Qwen.** Ollama ships Qwen3.5 with its thinking-mode defaults (temperature 1.0, top_p 0.95). The values above are the lower settings Qwen recommends for non-thinking use. Confirm them on the current model card.
- **Granite.** IBM recommends temperature 1.0 and top_p 0.95 for all Granite 4.2 tasks.
- **Low temperatures.** Going very low can cause repetition with these models. Let the eval set (§12) decide.
- **Context.** Always set `num_ctx` explicitly. Granite's native context is 128K, and users have seen its memory footprint balloon when a client asks for a very large context.

Optional Modelfiles pin these settings under a project-specific name. Thinking is still controlled per request, so keep passing `think=False`.

```text
# Modelfile.granite
FROM granite4.2:8b
PARAMETER num_ctx 8192
PARAMETER temperature 1.0
PARAMETER top_p 0.95
```

```powershell
ollama create f1-granite -f Modelfile.granite
```

### 4.7 Known issues to test against your Ollama version

These were reported against specific Ollama releases and may already be fixed. Each has a test (§12) and a mitigation in the code.

| Issue | Mitigation in this project |
|---|---|
| Qwen3.5: the `format` (JSON schema) argument is ignored when `think=false` (reported on Ollama 0.17.6) | The debrief pipeline strips code fences, validates with Pydantic and retries with error feedback. On the Alienware, llama-server's `json_schema` is an alternative. |
| Qwen3.5: a tool call is sometimes printed as text instead of executed (reported with the 9B) | The harness detects `<tool_call>` text and asks the model to call the tool properly. |
| Granite: memory balloons with a very large default context | Set `num_ctx` explicitly on every request. |

---

## 5. Repository layout

```text
f1-ai-engineer/
├── pyproject.toml / uv.lock
├── .env.example                    # F1_DATA_DIR, model names, fuel model, feature flags
├── .vscode/mcp.json                # VS Code MCP registration (§9.2)
├── Modelfile.granite / Modelfile.qwen   (optional, §4.6)
├── scripts/
│   ├── check_models.py             # thinking-off + speed check (§4.5)
│   └── watch_sessions.py           # post-session poller (§11.5)
├── src/f1_ai/
│   ├── config.py
│   ├── ingest/
│   │   ├── fastf1_loader.py        # session load, laps table, metadata
│   │   └── lap_classifier.py       # run_type labels
│   ├── physics/
│   │   ├── anchors.py              # per-lap corner anchoring by X/Y
│   │   ├── corners.py              # brake / apex / throttle metrics
│   │   ├── segments.py             # per-segment times and teammate deltas
│   │   ├── tyre.py                 # fuel-corrected degradation
│   │   └── energy.py               # 2026 straight-line energy signature
│   ├── store/
│   │   ├── parquet_store.py        # atomic per-session writes
│   │   └── duck.py                 # in-memory DuckDB views over Parquet
│   ├── llm/ollama_client.py        # the only place models are called
│   ├── debrief/
│   │   ├── facts.py                # fact-sheet builder
│   │   ├── schema.py               # Pydantic output models
│   │   ├── grounding.py            # number/key checks
│   │   └── pipeline.py             # batch runner + fallback + reports
│   ├── harness/agent.py            # MCP client + Ollama tool loop
│   ├── evals/run.py                # eval runner
│   └── mcp_server.py
├── data/                           # git-ignored
│   ├── fastf1_cache/
│   ├── parquet/<table>/session_id=<id>/part-0.parquet
│   └── reports/<session_id>.md
├── tests/
│   ├── fixtures/                   # frozen derived Parquet for 2–3 sessions
│   ├── test_physics.py
│   ├── test_mcp_tools.py
│   ├── test_grounding.py
│   └── test_models.py              # skipped if Ollama isn't running
└── evals/questions.yaml
```

---

## 6. Environment setup

```powershell
winget install astral-sh.uv
uv init --package f1-ai-engineer
cd f1-ai-engineer
uv add fastf1 duckdb pyarrow pandas numpy scipy pydantic "mcp[cli]" ollama httpx pyyaml
uv add --dev pytest
uv sync
```

The MCP Inspector (§9.3) also needs Node.js: `winget install OpenJS.NodeJS.LTS`.

### 6.1 Session identifiers

Use `"{year}_{round:02d}_{session}"`, for example `2026_16_FP2`. Sessions are `FP1`, `FP2`, `FP3`, `SQ`, `S`, `Q` and `R`. Event and circuit names live in `session_metadata` rather than in the ID, so sprint weekends and renamed events don't break anything.

### 6.2 `config.py`

```python
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
        opts = {"num_ctx": self.num_ctx, "temperature": self.temperature,
                "top_p": self.top_p, "num_predict": self.num_predict}
        if self.top_k is not None:
            opts["top_k"] = self.top_k
        if self.presence_penalty is not None:
            opts["presence_penalty"] = self.presence_penalty
        return opts


MODELS = {
    "qwen3.5:4b": ModelProfile("qwen3.5:4b", num_ctx=8192, temperature=0.7, top_p=0.8,
                               top_k=20, presence_penalty=1.5),
    "granite4.2:8b": ModelProfile("granite4.2:8b", num_ctx=8192, temperature=1.0, top_p=0.95),
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
```

### 6.3 FastF1 cache

Enable the cache once, at import time of the loader. It keeps repeat loads fast and keeps you under FastF1's API rate limits.

```python
import fastf1
from f1_ai.config import CACHE_DIR

CACHE_DIR.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))
```

---

## 7. Storage: Parquet files + DuckDB views

### 7.1 Why not a single DuckDB file

A DuckDB file can be opened by one read-write process **or** by several read-only processes, never both. The MCP server runs whenever your IDE is open, so a post-session writer would hit a lock error. Windows enforces this strictly.

Instead:

- **Writing.** Each pipeline stage writes one Parquet file per table per session.
- **Reading.** Every reader (MCP server, debrief pipeline, tests) opens an in-memory DuckDB connection with views over those files.
- **Result.** Nothing ever holds a lock on the data. Parquet is also portable: copying `data/parquet` to the Alienware is the entire data migration.

### 7.2 Writer (`store/parquet_store.py`)

```python
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
    tmp_dir.mkdir(parents=True)
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
```

The staging folder sits outside each table's folder, so the view globs below never pick up half-written files.

### 7.3 Reader (`store/duck.py`)

```python
"""In-memory DuckDB connection with one view per table. Never locks the data."""
import duckdb

from f1_ai.config import PARQUET_DIR

TABLES = ["session_metadata", "laps", "tyre_stints", "corner_metrics",
          "segment_deltas", "energy_signature", "session_highlights"]


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()                       # in-memory database
    for table in TABLES:
        folder = PARQUET_DIR / table
        if not any(folder.glob("*/*.parquet")):
            continue
        glob = (folder / "*" / "*.parquet").as_posix()
        con.execute(
            f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{glob}', "
            "hive_partitioning = true, hive_types_autocast = false, union_by_name = true)"
        )
    return con
```

- `hive_types_autocast = false` keeps `session_id` as text.
- `union_by_name = true` lets you add columns later without rewriting old sessions.

### 7.4 Logical schema

Every table is partitioned by `session_id`. Units are part of the column names.

```text
session_metadata
  session_id, year, round, event_name, location, session_type, session_date,
  fastf1_version, pipeline_version, ingested_at

laps                                   -- one row per driver-lap (the base for everything)
  session_id, driver, team, lap_number, stint, compound, tyre_life, fresh_tyre,
  lap_time_s, s1_s, s2_s, s3_s, speed_trap_kmh,
  track_status, is_accurate, deleted, pit_out, pit_in,
  run_id, run_type,                    -- run_type: push | long_run | out_in | cooldown | invalid | other
  pct_of_best, track_temp_c, air_temp_c, rainfall

tyre_stints                            -- one row per long run
  session_id, run_id, driver, team, compound, tyre_life_start,
  n_laps_total, n_laps_used, base_pace_s, deg_s_per_lap, deg_ci_low, deg_ci_high,
  residual_std_s, fuel_kg_per_lap, fuel_s_per_kg, method

corner_metrics                         -- aggregated per driver × corner × run_type
  session_id, driver, team, corner, corner_order, run_type, n_laps,
  brake_before_corner_m, brake_before_corner_iqr_m,
  min_speed_kmh, min_speed_iqr_kmh, min_speed_rel_m,
  full_throttle_after_corner_m, full_throttle_iqr_m,
  brake_to_full_throttle_m, peak_decel_g_est, dwell_ratio, corner_style

segment_deltas                         -- teammate time difference per track segment
  session_id, team, driver_a, driver_b, run_type, segment, segment_order,
  delta_s,                             -- driver_a minus driver_b (positive = driver_a slower)
  ci_low_s, ci_high_s, n_a, n_b, significant

energy_signature                       -- per driver × straight × run_type
  session_id, driver, team, straight, run_type, n_laps,
  v_start_kmh, v_peak_kmh, v_end_kmh, peak_at_frac, late_loss_kmh, clipping_flag

session_highlights                     -- debrief output, one row per driver
  session_id, team, driver, headline, primary_time_loss, primary_time_gain,
  team_summary, setup_hypotheses (JSON), facts_used (JSON),
  grounded, model, ollama_version, think, facts_hash, pipeline_version, created_at
```

---

## 8. Deterministic modules

### 8.0 Telemetry limits to design around

- **Sample rate.** Public car data arrives at roughly 3.7 Hz. At 300 km/h that's one sample every ~22 m, so a single lap's brake marker is uncertain by about ±10 m. Aggregate over comparable laps and report the spread.
- **Brake channel.** `Brake` is on/off, with no pressure. Trail-braking pressure can't be observed directly. Deceleration is *estimated* by differentiating smoothed speed.
- **Distance drift.** `Distance` is integrated from speed, so it drifts between drivers and laps. Corners are therefore anchored on each lap by X/Y position (§8.3).
- **2026 channel meanings.** Check what the legacy `DRS` channel encodes under the 2026 active-aero rules (Straight Mode / Corner Mode) before using it. v2 doesn't depend on it.
- **Data availability.** Public data typically appears about 30 minutes after a session ends. The poller retries rather than assuming it's there (§11.5).

### 8.1 Ingestion (`ingest/fastf1_loader.py`)

```python
import fastf1
import pandas as pd


def session_id_for(year: int, round_number: int, kind: str) -> str:
    return f"{year}_{round_number:02d}_{kind.upper()}"


def load_session(year: int, event: int | str, kind: str):
    s = fastf1.get_session(year, event, kind)
    s.load(laps=True, telemetry=True, weather=True, messages=True)
    return s


def laps_table(s, sid: str) -> pd.DataFrame:
    laps = s.laps
    weather = laps.get_weather_data().reset_index(drop=True)   # one row per lap, same order
    df = pd.DataFrame({
        "session_id": sid,
        "driver": laps["Driver"].to_numpy(),
        "team": laps["Team"].to_numpy(),
        "lap_number": laps["LapNumber"].astype("Int64").to_numpy(),
        "stint": laps["Stint"].astype("Int64").to_numpy(),
        "compound": laps["Compound"].to_numpy(),
        "tyre_life": laps["TyreLife"].to_numpy(),
        "fresh_tyre": laps["FreshTyre"].to_numpy(),
        "lap_time_s": laps["LapTime"].dt.total_seconds().to_numpy(),
        "speed_trap_kmh": laps["SpeedST"].to_numpy(),
        "track_status": laps["TrackStatus"].astype(str).to_numpy(),
        "is_accurate": laps["IsAccurate"].fillna(False).astype(bool).to_numpy(),
        "deleted": laps["Deleted"].fillna(False).astype(bool).to_numpy(),
        "pit_out": laps["PitOutTime"].notna().to_numpy(),
        "pit_in": laps["PitInTime"].notna().to_numpy(),
        "track_temp_c": weather["TrackTemp"].to_numpy(),
        "air_temp_c": weather["AirTemp"].to_numpy(),
        "rainfall": weather["Rainfall"].to_numpy(),
    })
    for i in (1, 2, 3):
        df[f"s{i}_s"] = laps[f"Sector{i}Time"].dt.total_seconds().to_numpy()
    return df
```

Teams and teammate pairs come from `df.groupby("team")["driver"].unique()`. Never hard-code the grid; 2026 has 11 teams, and line-ups change.

### 8.2 Lap classifier (`ingest/lap_classifier.py`)

```python
import numpy as np
import pandas as pd

from f1_ai import config as C


def classify_laps(laps: pd.DataFrame) -> pd.DataFrame:
    df = laps.sort_values(["driver", "lap_number"]).copy()

    green = ~df["track_status"].fillna("").str.contains("[2-7]")    # any yellow/SC/VSC/red code
    valid = df["lap_time_s"].notna() & df["is_accurate"] & ~df["deleted"] & green
    df["run_type"] = np.where(df["pit_in"] | df["pit_out"], "out_in",
                              np.where(valid, "other", "invalid"))

    # A run is the set of consecutive laps between two pit exits.
    run_no = df["pit_out"].astype(int).groupby(df["driver"]).cumsum()
    df["run_id"] = df["driver"] + "_" + run_no.astype(str)

    best = df.loc[valid, ["driver", "lap_time_s"]].groupby("driver")["lap_time_s"].min()
    df["pct_of_best"] = df["lap_time_s"] / df["driver"].map(best)

    # Long runs: at least N laps within a narrow band of the run's median
    for _, run in df[df["run_type"] == "other"].groupby("run_id"):
        median = run["lap_time_s"].median()
        in_band = (run["lap_time_s"] - median).abs() <= C.LONG_RUN_BAND * median
        if in_band.sum() >= C.LONG_RUN_MIN_LAPS:
            df.loc[run.index[in_band], "run_type"] = "long_run"

    rest = df["run_type"] == "other"
    df.loc[rest & (df["pct_of_best"] <= C.PUSH_THRESHOLD), "run_type"] = "push"
    df.loc[rest & (df["pct_of_best"] >= C.COOLDOWN_THRESHOLD), "run_type"] = "cooldown"
    return df
```

Validate the thresholds on the fixture sessions by plotting each driver's lap times coloured by `run_type`. Five minutes of eyeballing here saves hours of misleading comparisons later.

### 8.3 Per-lap corner anchoring (`physics/anchors.py`)

FastF1's `session.get_circuit_info().corners` gives each corner's number, letter, X/Y position and distance along a reference lap. Anchor each corner on each lap by finding the point on *that lap's* trace closest to the corner's X/Y.

```python
import numpy as np
import pandas as pd


def corner_anchors(tel: pd.DataFrame, corners: pd.DataFrame, ref_lap_len_m: float,
                   window_m: float = 300.0) -> dict[str, float]:
    """Distance (on this lap's own scale) where the car passes each corner marker."""
    xy = tel[["X", "Y"]].to_numpy(float)
    dist = tel["Distance"].to_numpy(float)
    scale = dist[-1] / ref_lap_len_m
    anchors: dict[str, float] = {}
    for c in corners.itertuples():
        expected = c.Distance * scale
        idx = np.flatnonzero(np.abs(dist - expected) < window_m)   # avoids crossover legs (e.g. Suzuka)
        if idx.size == 0:
            continue
        d2 = (xy[idx, 0] - c.X) ** 2 + (xy[idx, 1] - c.Y) ** 2
        letter = c.Letter if isinstance(c.Letter, str) else ""
        anchors[f"T{c.Number}{letter}"] = float(dist[idx[np.argmin(d2)]])
    return anchors
```

- **Telemetry source.** Use `lap.get_telemetry()`, which merges car and position data and adds `Distance`. Only fetch it for `push` and `long_run` laps, because it's the slowest step.
- **Reference length.** Use the median lap distance of the session's push laps for `ref_lap_len_m`.

### 8.4 Corner metrics (`physics/corners.py`)

```python
import numpy as np
import pandas as pd
from scipy.signal import savgol_filter

from f1_ai import config as C


def corner_metrics(tel: pd.DataFrame, anchor_m: float, prev_anchor_m: float,
                   exit_window_m: float = 200.0) -> dict | None:
    d = tel["Distance"].to_numpy(float)
    v = tel["Speed"].to_numpy(float)                       # km/h
    thr = tel["Throttle"].to_numpy(float)
    brk = tel["Brake"].to_numpy(bool)
    t = tel["Time"].dt.total_seconds().to_numpy()

    approach = np.flatnonzero((d >= max(prev_anchor_m, anchor_m - 600)) & (d <= anchor_m))
    braking = approach[brk[approach]]
    if braking.size == 0:
        return None                                        # flat-out or lift-only corner
    breaks = np.flatnonzero(np.diff(braking) > 1)
    onset = braking[breaks[-1] + 1] if breaks.size else braking[0]   # last braking block

    zone = np.flatnonzero((d >= d[onset]) & (d <= anchor_m + exit_window_m))
    vmin_i = zone[np.argmin(v[zone])]

    full_i = None
    for i in range(vmin_i, len(d)):
        if thr[i] >= C.FULL_THROTTLE:
            j = min(np.searchsorted(t, t[i] + C.FULL_THROTTLE_HOLD_S), len(t) - 1)
            if (thr[i:j + 1] >= C.FULL_THROTTLE).all():
                full_i = i
                break

    vs = savgol_filter(v / 3.6, window_length=7, polyorder=2)      # m/s, smoothed
    decel = -np.gradient(vs, t)[onset:vmin_i + 1]
    near_min = zone[v[zone] <= v[vmin_i] + 5.0]
    span = (d[full_i] - d[onset]) if full_i is not None else np.nan

    return {
        "brake_before_corner_m": anchor_m - d[onset],
        "min_speed_kmh": v[vmin_i],
        "min_speed_rel_m": d[vmin_i] - anchor_m,
        "full_throttle_after_corner_m": (d[full_i] - anchor_m) if full_i is not None else np.nan,
        "brake_to_full_throttle_m": span,
        "peak_decel_g_est": float(decel.max() / 9.81) if decel.size else np.nan,
        "dwell_ratio": (d[near_min].max() - d[near_min].min()) / span if span and span > 0 else np.nan,
    }
```

**Aggregation.** Group by driver × corner × `run_type`, and store the median, the interquartile range (IQR) and `n_laps`.

**Corner style is a heuristic label.** It's derived from `dwell_ratio`, the share of the corner spent within 5 km/h of minimum speed. A low ratio means "V-style" (hard stop, early rotation); a high ratio means "U-style" (carried apex speed). Tune the cut-offs on fixtures, and never let the debrief state a style without the underlying numbers.

### 8.5 Segment times and teammate deltas (`physics/segments.py`)

This is the "where and how much" layer. The debrief ranks time loss from here and uses corner metrics only as the explanation.

```python
import numpy as np
import pandas as pd


def segment_times(tel: pd.DataFrame, anchors: dict[str, float]) -> pd.Series:
    """Seconds spent between consecutive corner anchors on one lap."""
    names = sorted(anchors, key=anchors.get)
    d = tel["Distance"].to_numpy(float)
    t = tel["Time"].dt.total_seconds().to_numpy()
    marks = [0.0] + [anchors[n] for n in names] + [d[-1]]
    labels = [f"start-{names[0]}"] + [f"{a}-{b}" for a, b in zip(names, names[1:])] + [f"{names[-1]}-finish"]
    return pd.Series(np.diff(np.interp(marks, d, t)), index=labels)


def teammate_deltas(seg_a: pd.DataFrame, seg_b: pd.DataFrame, n_boot: int = 2000,
                    seed: int = 0) -> pd.DataFrame:
    """seg_a / seg_b: rows = comparable laps, columns = segments. delta = A - B."""
    rng = np.random.default_rng(seed)
    rows = []
    for order, seg in enumerate(seg_a.columns.intersection(seg_b.columns)):
        a, b = seg_a[seg].dropna().to_numpy(), seg_b[seg].dropna().to_numpy()
        if len(a) < 2 or len(b) < 2:
            continue
        boot = (np.median(rng.choice(a, (n_boot, len(a))), axis=1)
                - np.median(rng.choice(b, (n_boot, len(b))), axis=1))
        lo, hi = np.percentile(boot, [5, 95])
        rows.append({"segment": seg, "segment_order": order,
                     "delta_s": float(np.median(a) - np.median(b)),
                     "ci_low_s": float(lo), "ci_high_s": float(hi),
                     "n_a": len(a), "n_b": len(b), "significant": bool(lo > 0 or hi < 0)})
    return pd.DataFrame(rows)
```

With only 2–4 push laps per driver in a practice session, many segments won't be significant. That's the correct outcome, not a bug.

### 8.6 Tyre degradation (`physics/tyre.py`)

```python
import numpy as np
import pandas as pd
from scipy.stats import theilslopes

from f1_ai import config as C


def fit_degradation(run: pd.DataFrame, fuel_kg_per_lap: float = C.FUEL_KG_PER_LAP,
                    fuel_s_per_kg: float = C.FUEL_S_PER_KG) -> dict | None:
    """One long run -> fuel-corrected degradation in seconds per lap of tyre age."""
    run = run.sort_values("lap_number")
    laps_into_run = np.arange(len(run))
    keep = laps_into_run >= C.WARMUP_LAPS
    if keep.sum() < C.LONG_RUN_MIN_LAPS:
        return None
    # Add back the time the car gained from burning fuel, so only tyre effects remain.
    corrected = run["lap_time_s"].to_numpy()[keep] + laps_into_run[keep] * fuel_kg_per_lap * fuel_s_per_kg
    age = run["tyre_life"].to_numpy(float)[keep]          # TyreLife, not stint lap count
    slope, intercept, lo, hi = theilslopes(corrected, age, alpha=0.90)
    resid = corrected - (intercept + slope * age)
    return {
        "compound": run["compound"].iloc[0], "tyre_life_start": float(run["tyre_life"].iloc[0]),
        "n_laps_total": len(run), "n_laps_used": int(keep.sum()),
        "base_pace_s": float(intercept + slope * age[0]),   # pace at the first used lap
        "deg_s_per_lap": float(slope), "deg_ci_low": float(lo), "deg_ci_high": float(hi),
        "residual_std_s": float(resid.std(ddof=1)),
        "fuel_kg_per_lap": fuel_kg_per_lap, "fuel_s_per_kg": fuel_s_per_kg, "method": "theil-sen",
    }
```

Two points to keep in mind:

- **The fuel constant sets the slope.** Within a run, tyre age and laps-into-run rise together, so the fitted slope equals the raw slope plus `fuel_kg_per_lap × fuel_s_per_kg`. The fuel assumption fully determines the degradation figure. That's why both constants are stored with every row and shown by the MCP tool.
- **Fuel load is unknown in practice sessions.** Absolute `base_pace_s` comparisons between teams are confounded by fuel and engine modes. Degradation slopes and same-team comparisons are more trustworthy.

### 8.7 2026 straight-line energy signature (`physics/energy.py`)

Under the 2026 rules, straight-line speed depends heavily on how electrical energy is deployed and when it runs out, not only on drag. Measure the *shape* of the speed trace while the driver is at full throttle:

```python
import numpy as np
import pandas as pd

from f1_ai import config as C


def straight_signature(tel: pd.DataFrame, start_m: float, end_m: float) -> dict | None:
    seg = tel[(tel["Distance"] >= start_m) & (tel["Distance"] <= end_m)]
    full = seg[seg["Throttle"] >= C.FULL_THROTTLE]
    if len(full) < 5:
        return None
    v, d = full["Speed"].to_numpy(float), full["Distance"].to_numpy(float)
    i_peak = int(np.argmax(v))
    return {
        "v_start_kmh": float(v[0]), "v_peak_kmh": float(v[i_peak]), "v_end_kmh": float(v[-1]),
        "peak_at_frac": float((d[i_peak] - d[0]) / max(d[-1] - d[0], 1.0)),
        "late_loss_kmh": float(v[i_peak] - v[-1]),   # speed lost while still flat out
    }
```

- **Finding straights.** Take each full-throttle stretch longer than ~400 m on a reference lap and name it after the corner it follows ("after T3").
- **Clipping flag.** Set `clipping_flag` when the median `late_loss_kmh` exceeds a threshold (start at 4 km/h) and the peak arrives well before the braking point (`peak_at_frac < 0.85`).
- **Drag comparison.** Compare `v_peak_kmh` only between laps that show no clipping. That separates drag differences from energy differences.

---

## 9. MCP server

### 9.1 `mcp_server.py`

Design rules:

- **Read-only.** Every tool only reads.
- **Prefixed names.** All tools start with `f1_`.
- **Discovery first.** Discovery tools let a model find valid IDs instead of guessing them.
- **Constrained inputs.** Enumerated values are `Literal` types, so clients see them as enums.
- **Structured returns.** Tools return Python objects, not pre-serialised JSON.
- **Actionable errors.** Error messages tell the model what to call next.

```python
"""F1 race engineer MCP server: read-only tools over the Parquet store."""
from __future__ import annotations

import logging
import os
import re
import sys
from typing import Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from f1_ai.store.duck import TABLES, connect

logging.basicConfig(stream=sys.stderr, level=logging.INFO)   # stdout belongs to the protocol
mcp = FastMCP("f1_mcp")
RO = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)

RunType = Literal["push", "long_run"]
Compound = Literal["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]


def _rows(sql: str, params: list | None = None) -> list[dict]:
    with connect() as con:
        cur = con.execute(sql, params or [])
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def _require_session(session_id: str) -> None:
    if not _rows("SELECT 1 FROM session_metadata WHERE session_id = ?", [session_id]):
        raise ValueError(f"Unknown session_id '{session_id}'. Call f1_list_sessions for valid ids.")


def _nonempty(rows: list[dict], hint: str) -> list[dict]:
    if not rows:
        raise ValueError(f"No matching rows. {hint}")
    return rows


@mcp.tool(annotations=RO)
def f1_list_sessions(year: int | None = None) -> list[dict]:
    """List ingested sessions. Call this first to get valid session_id values
    (format '<year>_<round>_<session>', e.g. '2026_16_FP2')."""
    sql = "SELECT session_id, year, round, event_name, session_type, session_date FROM session_metadata"
    if year is not None:
        return _rows(sql + " WHERE year = ? ORDER BY session_date", [year])
    return _rows(sql + " ORDER BY session_date")


@mcp.tool(annotations=RO)
def f1_list_drivers(session_id: str) -> list[dict]:
    """Drivers (3-letter codes) and teams in a session, with lap counts per run_type."""
    _require_session(session_id)
    return _rows("SELECT team, driver, run_type, count(*) AS laps FROM laps "
                 "WHERE session_id = ? GROUP BY ALL ORDER BY team, driver, run_type", [session_id])


@mcp.tool(annotations=RO)
def f1_list_corners(session_id: str) -> list[str]:
    """Corner labels available for a session, in track order (e.g. 'T1', 'T4', 'T9A')."""
    _require_session(session_id)
    rows = _rows("SELECT DISTINCT corner, corner_order FROM corner_metrics "
                 "WHERE session_id = ? ORDER BY corner_order", [session_id])
    return [r["corner"] for r in rows]


@mcp.tool(annotations=RO)
def f1_get_session_highlights(session_id: str, driver: str | None = None) -> list[dict]:
    """Stored post-session debrief for a session, optionally one driver (3-letter code, e.g. 'NOR').
    'grounded' is false when the text came from the deterministic fallback."""
    _require_session(session_id)
    sql = ("SELECT team, driver, headline, primary_time_loss, primary_time_gain, team_summary, "
           "setup_hypotheses, grounded, model FROM session_highlights WHERE session_id = ?")
    params: list = [session_id]
    if driver:
        sql += " AND driver = ?"
        params.append(driver.upper())
    return _nonempty(_rows(sql, params), "Run the debrief pipeline for this session first.")


@mcp.tool(annotations=RO)
def f1_compare_teammates_corner(session_id: str, team: str, corner: str,
                                run_type: RunType = "push") -> list[dict]:
    """Braking point, minimum speed and throttle pick-up for both drivers of a team at one corner.
    corner: a label from f1_list_corners. Distances are metres relative to the corner marker
    (brake_before_corner_m = how far before the marker braking starts). Values are medians over
    n_laps comparable laps, with IQR spreads; differences smaller than the spread are noise."""
    _require_session(session_id)
    rows = _rows("""
        SELECT driver, team, corner, run_type, n_laps,
               brake_before_corner_m, brake_before_corner_iqr_m,
               min_speed_kmh, min_speed_iqr_kmh, full_throttle_after_corner_m, full_throttle_iqr_m,
               brake_to_full_throttle_m, peak_decel_g_est, corner_style
        FROM corner_metrics
        WHERE session_id = ? AND team ILIKE ? AND corner = ? AND run_type = ?
        ORDER BY driver""", [session_id, f"%{team}%", corner.upper(), run_type])
    return _nonempty(rows, "Check the team with f1_list_drivers and the corner with f1_list_corners, "
                           "or try run_type='long_run'.")


@mcp.tool(annotations=RO)
def f1_get_segment_deltas(session_id: str, team: str, run_type: RunType = "push",
                          only_significant: bool = True) -> list[dict]:
    """Where time is gained or lost between teammates, per segment between corner markers.
    delta_s = driver_a minus driver_b in seconds (positive = driver_a slower), with a 90% interval.
    Sorted by size. Use this to find WHERE time goes; use f1_compare_teammates_corner for WHY."""
    _require_session(session_id)
    sql = ("SELECT driver_a, driver_b, segment, delta_s, ci_low_s, ci_high_s, n_a, n_b, significant "
           "FROM segment_deltas WHERE session_id = ? AND team ILIKE ? AND run_type = ?")
    if only_significant:
        sql += " AND significant"
    rows = _rows(sql + " ORDER BY abs(delta_s) DESC", [session_id, f"%{team}%", run_type])
    return _nonempty(rows, "Try only_significant=false or run_type='long_run'.")


@mcp.tool(annotations=RO)
def f1_query_tyre_degradation(session_id: str, compound: Compound | None = None,
                              driver: str | None = None) -> list[dict]:
    """Fuel-corrected degradation per long run: deg_s_per_lap (seconds lost per lap of tyre age,
    90% interval), base_pace_s, n_laps_used, residual_std_s. The fuel model used is included;
    the slope depends directly on it. Base pace across teams is confounded by unknown fuel loads."""
    _require_session(session_id)
    sql = ("SELECT driver, team, compound, tyre_life_start, n_laps_used, base_pace_s, deg_s_per_lap, "
           "deg_ci_low, deg_ci_high, residual_std_s, fuel_kg_per_lap, fuel_s_per_kg "
           "FROM tyre_stints WHERE session_id = ?")
    params: list = [session_id]
    if compound:
        sql += " AND compound = ?"
        params.append(compound)
    if driver:
        sql += " AND driver = ?"
        params.append(driver.upper())
    return _nonempty(_rows(sql + " ORDER BY compound, deg_s_per_lap", params),
                     "No long runs matched; check f1_list_drivers for long_run lap counts.")


@mcp.tool(annotations=RO)
def f1_get_energy_signature(session_id: str, team: str) -> list[dict]:
    """2026 straight-line speed shape per straight. late_loss_kmh = speed lost while still at full
    throttle before braking; high values (clipping_flag) point to energy running out, not drag."""
    _require_session(session_id)
    rows = _rows("SELECT driver, straight, run_type, n_laps, v_peak_kmh, v_end_kmh, peak_at_frac, "
                 "late_loss_kmh, clipping_flag FROM energy_signature "
                 "WHERE session_id = ? AND team ILIKE ? ORDER BY straight, driver",
                 [session_id, f"%{team}%"])
    return _nonempty(rows, "Check the team name with f1_list_drivers.")


@mcp.resource("f1://schema")
def f1_schema() -> str:
    """Column names and types of every view, for clients that write SQL."""
    with connect() as con:
        parts = []
        for t in TABLES:
            try:
                cols = con.execute(f"DESCRIBE {t}").fetchall()
            except Exception:
                continue
            parts.append(f"{t}: " + ", ".join(f"{c[0]} {c[1]}" for c in cols))
        return "\n".join(parts)


if os.environ.get("F1_MCP_ENABLE_SQL") == "1":          # opt-in; best with strong cloud models

    @mcp.tool(annotations=RO)
    def f1_run_sql(query: str, limit: int = 200) -> list[dict]:
        """Read-only DuckDB SQL over the views listed in resource f1://schema.
        One SELECT or WITH statement; results are capped at `limit` rows (max 1000)."""
        q = query.strip().rstrip(";")
        if ";" in q or not re.match(r"(?is)^\s*(select|with)\b", q):
            raise ValueError("Only a single SELECT or WITH statement is allowed.")
        return _rows(f"SELECT * FROM ({q}) LIMIT {max(1, min(int(limit), 1000))}")


def main() -> None:
    mcp.run()   # stdio. Use mcp.run(transport="streamable-http") only if you need network access.


if __name__ == "__main__":
    main()
```

### 9.2 Client registration (absolute paths everywhere)

Clients start the server from their own working directory. Relative paths and `cwd` settings are not reliable, so use absolute paths and pass `F1_DATA_DIR` explicitly.

**VS Code / GitHub Copilot: `.vscode/mcp.json`.** Note the key is `servers`.

```json
{
  "servers": {
    "f1": {
      "type": "stdio",
      "command": "${workspaceFolder}/.venv/Scripts/python.exe",
      "args": ["-m", "f1_ai.mcp_server"],
      "env": { "F1_DATA_DIR": "${workspaceFolder}/data" }
    }
  }
}
```

**Cursor: `.cursor/mcp.json`**

```json
{
  "mcpServers": {
    "f1": {
      "command": "C:/projects/f1-ai-engineer/.venv/Scripts/python.exe",
      "args": ["-m", "f1_ai.mcp_server"],
      "env": { "F1_DATA_DIR": "C:/projects/f1-ai-engineer/data" }
    }
  }
}
```

**Claude Desktop: `%APPDATA%\Claude\claude_desktop_config.json`.** Use the same `mcpServers` block as Cursor. Restart Claude Desktop after editing.

### 9.3 Test without any LLM first

```powershell
uv run mcp dev src/f1_ai/mcp_server.py
```

This opens the MCP Inspector in a browser. Call every tool by hand, including wrong inputs, to check that the error messages are helpful. Only then connect a model. This separates "the tool is wrong" from "the model used it wrong".

---

## 10. Local agent harness (MCP client + Ollama)

Ollama is an inference server, not an MCP client. The harness is the MCP host: it lists the server's tools, hands them to Ollama as function definitions, executes the calls the model makes, and feeds the results back.

### 10.1 The single model wrapper (`llm/ollama_client.py`)

```python
"""The only module that calls models. Thinking is always off."""
import re

import httpx
from ollama import AsyncClient, Client

from f1_ai.config import MODELS

_sync = Client()          # honours OLLAMA_HOST; default http://localhost:11434
_async = AsyncClient()
_FENCE = re.compile(r"^`{3}(?:json)?\s*|\s*`{3}$")   # strips Markdown code fences


class ThinkingLeak(RuntimeError):
    """Raised when a model returns a thinking trace despite think=False."""


def ollama_version() -> str:
    try:
        return httpx.get("http://localhost:11434/api/version", timeout=3).json()["version"]
    except Exception:
        return "unknown"


def _check(msg) -> None:
    if msg.thinking or "<think>" in (msg.content or ""):
        raise ThinkingLeak("Model produced a thinking trace; check think=False and Ollama version.")


def chat_json(model: str, messages: list[dict], schema: dict) -> tuple[str, dict]:
    """Structured-output call for the debrief pipeline. Returns (clean_json_text, metadata)."""
    r = _sync.chat(model=model, messages=messages, format=schema, think=False,
                   options=MODELS[model].options(), stream=False)
    _check(r.message)
    text = _FENCE.sub("", r.message.content.strip())     # some versions ignore `format` with think off
    return text, {"prompt_tokens": r.prompt_eval_count, "output_tokens": r.eval_count,
                  "seconds": (r.total_duration or 0) / 1e9}


async def chat_tools(model: str, messages: list, tools: list[dict]):
    """Tool-calling call for the harness. Returns the assistant message."""
    r = await _async.chat(model=model, messages=messages, tools=tools, think=False,
                          options=MODELS[model].options())
    _check(r.message)
    return r.message
```

### 10.2 The harness (`harness/agent.py`)

```python
"""Ask questions about F1 sessions using a local model and the f1 MCP server."""
import asyncio
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from f1_ai.config import CHAT_MODEL
from f1_ai.llm.ollama_client import chat_tools

SYSTEM = (
    "You are an F1 race engineer assistant. Answer ONLY from tool results. "
    "Start with f1_list_sessions if you don't know the session_id, and f1_list_drivers or "
    "f1_list_corners before guessing names. Quote numbers exactly as the tools return them, with units. "
    "If the tools don't contain the answer, say so."
)
MAX_TOOL_CHARS = 6000          # protect a small context window


def to_ollama_tool(tool) -> dict:
    return {"type": "function",
            "function": {"name": tool.name, "description": tool.description or "",
                         "parameters": tool.inputSchema}}


async def ask(question: str, model: str = CHAT_MODEL, max_steps: int = 6) -> str:
    server = StdioServerParameters(command=sys.executable, args=["-m", "f1_ai.mcp_server"],
                                   env=dict(os.environ))
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = [to_ollama_tool(t) for t in (await session.list_tools()).tools]
            messages: list = [{"role": "system", "content": SYSTEM},
                              {"role": "user", "content": question}]
            for _ in range(max_steps):
                msg = await chat_tools(model, messages, tools)
                messages.append(msg)
                if not msg.tool_calls:
                    if "<tool_call>" in (msg.content or ""):          # known small-model failure
                        messages.append({"role": "user", "content":
                                         "You printed a tool call as text. Call the tool properly instead."})
                        continue
                    return msg.content
                for call in msg.tool_calls:
                    result = await session.call_tool(call.function.name, dict(call.function.arguments))
                    text = "\n".join(c.text for c in result.content if getattr(c, "type", "") == "text")
                    if result.isError:
                        text = f"TOOL ERROR: {text}"
                    messages.append({"role": "tool", "content": text[:MAX_TOOL_CHARS],
                                     "tool_name": call.function.name})
            return "Stopped after too many tool steps; try a more specific question."


if __name__ == "__main__":
    print(asyncio.run(ask(" ".join(sys.argv[1:]))))
```

Usage:

```powershell
uv run python -m f1_ai.harness.agent "In 2026_16_FP2, where did the slower McLaren lose time on push laps?"
```

**Expectations for a 4B model.** On the Surface, `qwen3.5:4b` handles one or two tool calls per question well. Multi-hop questions are better asked through an IDE client with a stronger model. The eval set (§12) will show where that boundary sits for each model.

---

## 11. Post-session debrief pipeline

This replaces v1's "Deep Agent". It is deterministic end to end, except for one LLM call per team that turns verified facts into prose. Small models are reliable at that job and unreliable at deciding what to query.

```text
Parquet store ──► fact sheet per team ──► LLM (think=False, JSON schema) ──► validate
                                                     ▲                          │
                                                     └──── retry with errors ◄──┤ fail
                                                                                │ pass / 3rd fail
                                         session_highlights + Markdown ◄────────┘ (fallback text)
```

### 11.1 Fact sheet (`debrief/facts.py`)

Each fact is small, keyed and unit-labelled. Only significant or above-noise facts are included. The sheet is capped so the prompt stays around 2–3k tokens on an 8k context.

```python
def build_facts(con, session_id: str, team: str, max_facts: int = 40) -> list[dict]:
    facts: list[dict] = []
    for seg, a, b, delta, n_a, n_b in con.execute("""
            SELECT segment, driver_a, driver_b, delta_s, n_a, n_b FROM segment_deltas
            WHERE session_id = ? AND team = ? AND run_type = 'push' AND significant
            ORDER BY abs(delta_s) DESC LIMIT 6""", [session_id, team]).fetchall():
        faster, slower = (b, a) if delta > 0 else (a, b)
        facts.append({"key": f"seg.{seg}", "value": round(abs(delta), 3), "unit": "s",
                      "faster": faster, "slower": slower, "laps": [n_a, n_b]})
    # Corner facts: only where |median_A - median_B| > max(IQR_A, IQR_B)
    #   key "corner.T4.brake_before_corner_m", value, unit "m", per-driver values, n_laps
    # Tyre facts: deg_s_per_lap per driver/compound with CI and the fuel model used
    #   key "deg.NOR.MEDIUM", value 0.072, unit "s/lap", ci [lo, hi], n_laps_used
    # Energy facts: clipping flags and late_loss_kmh per straight
    #   key "energy.after_T3.PIA.late_loss_kmh", value, unit "km/h"
    # Context: track temperature range, number of push laps / long runs per driver
    return facts[:max_facts]
```

### 11.2 Output schema (`debrief/schema.py`)

```python
from pydantic import BaseModel, Field


class DriverHighlight(BaseModel):
    driver: str = Field(description="3-letter code")
    headline: str = Field(max_length=200, description="One sentence")
    primary_time_loss: str = Field(description="Where and how much, citing fact values")
    primary_time_gain: str
    facts_used: list[str] = Field(description="Fact keys this text relies on")


class TeamDebrief(BaseModel):
    team: str
    team_summary: str = Field(max_length=400)
    drivers: list[DriverHighlight] = Field(min_length=1, max_length=2)
    setup_hypotheses: list[str] = Field(default_factory=list, max_length=3,
                                        description="Each starts with 'Hypothesis:'")
```

### 11.3 Grounding check (`debrief/grounding.py`)

Every number in the generated text must appear in the fact sheet, allowing for rounding. Every cited fact key must exist.

```python
import json
import re

from f1_ai.debrief.schema import TeamDebrief

NUM = re.compile(r"\d+(?:\.\d+)?")


def allowed_numbers(facts: list[dict]) -> set[str]:
    allowed = set(NUM.findall(json.dumps(facts)))          # includes corner numbers, lap counts
    for f in facts:
        v = f.get("value")
        if isinstance(v, (int, float)):
            allowed |= {f"{abs(v):.{nd}f}" for nd in range(4)}    # 0.084 -> "0", "0.1", "0.08", "0.084"
    return allowed


def grounding_problems(deb: TeamDebrief, facts: list[dict]) -> list[str]:
    keys, allowed, problems = {f["key"] for f in facts}, allowed_numbers(facts), []
    texts = [deb.team_summary, *deb.setup_hypotheses]
    texts += [f"{h.headline} {h.primary_time_loss} {h.primary_time_gain}" for h in deb.drivers]
    for text in texts:
        problems += [f"Number {n} is not in the facts (in: '{text[:80]}')"
                     for n in NUM.findall(text) if n not in allowed]
    for h in deb.drivers:
        problems += [f"Unknown fact key '{k}'" for k in h.facts_used if k not in keys]
    problems += ["Setup ideas must start with 'Hypothesis:'"
                 for s in deb.setup_hypotheses if not s.startswith("Hypothesis:")]
    return problems
```

### 11.4 Synthesis with retries and fallback (`debrief/pipeline.py`)

```python
import json

from pydantic import ValidationError

from f1_ai.debrief.grounding import grounding_problems
from f1_ai.debrief.schema import DriverHighlight, TeamDebrief
from f1_ai.llm.ollama_client import chat_json

SYSTEM = """You are an F1 performance engineer writing a short post-session debrief.
Use ONLY the facts provided. Every number you write must appear in the facts, with its unit.
Never calculate new numbers. Each driver gets a headline, a primary time loss and a primary time gain.
Setup ideas are optional, must start with "Hypothesis:", and must follow from the facts.
Reply with JSON that matches the schema."""


def fallback_debrief(team: str, facts: list[dict]) -> TeamDebrief:
    """Deterministic text so the pipeline never blocks on a bad model output."""
    seg = [f for f in facts if f["key"].startswith("seg.")]
    drivers = sorted({d for f in seg for d in (f["faster"], f["slower"])})
    highlights = []
    for drv in drivers or ["N/A"]:
        loss = next((f for f in seg if f["slower"] == drv), None)
        gain = next((f for f in seg if f["faster"] == drv), None)
        highlights.append(DriverHighlight(
            driver=drv,
            headline=f"{drv}: largest teammate gap in {(loss or gain or {'key': 'seg.n/a'})['key'][4:]}.",
            primary_time_loss=f"{loss['value']} s in {loss['key'][4:]}" if loss else "None significant.",
            primary_time_gain=f"{gain['value']} s in {gain['key'][4:]}" if gain else "None significant.",
            facts_used=[f["key"] for f in (loss, gain) if f]))
    return TeamDebrief(team=team, team_summary="Automatic summary (model output failed validation).",
                       drivers=highlights[:2])


def debrief_team(session_id: str, team: str, facts: list[dict], model: str) -> tuple[TeamDebrief, bool, dict]:
    messages = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"Session {session_id}, team {team}.\n"
                                            f"FACTS:\n{json.dumps(facts, separators=(',', ':'))}"}]
    schema, meta = TeamDebrief.model_json_schema(), {}
    for _ in range(3):
        raw, meta = chat_json(model, messages, schema)
        try:
            deb = TeamDebrief.model_validate_json(raw)
            problems = grounding_problems(deb, facts)
        except ValidationError as e:
            problems = [f"JSON does not match the schema: {e.errors()[:3]}"]
        if not problems:
            return deb, True, meta
        messages += [{"role": "assistant", "content": raw},
                     {"role": "user", "content": "Fix these problems and reply with corrected JSON only:\n- "
                                                 + "\n- ".join(problems[:8])}]
    return fallback_debrief(team, facts), False, meta
```

The batch runner iterates teams from `laps`, builds facts, calls `debrief_team`, and writes one row per driver to `session_highlights`. Each row records `grounded`, `model`, `ollama_version()`, `think=False`, a SHA-256 of the fact sheet and `PIPELINE_VERSION`. It also writes `data/reports/<session_id>.md`.

```powershell
uv run python -m f1_ai.debrief.pipeline 2026_16_FP2 --model qwen3.5:4b
```

**Expected runtime on the Surface (estimate).** 11 teams × (~2.5k prompt tokens + ~500 output tokens) comes to about 1–2 minutes per team with `qwen3.5:4b`, so roughly 15–25 minutes per session. Granite takes about twice as long. Fine for a batch job; measure and record it.

### 11.5 Trigger: poll for data, don't assume it

`scripts/watch_sessions.py` runs every 15 minutes via Windows Task Scheduler:

1. Read `fastf1.get_event_schedule(year)` to find sessions whose estimated end (start + typical duration) is more than 30 minutes ago and that aren't yet in `session_metadata`.
2. Try to load each one. If the data isn't complete yet, log it and try again next cycle, up to a retry limit.
3. On success, run ingest → classify → physics → debrief, in that order, one session at a time.

```powershell
schtasks /Create /SC MINUTE /MO 15 /TN "F1 session watcher" `
  /TR "C:\projects\f1-ai-engineer\.venv\Scripts\python.exe C:\projects\f1-ai-engineer\scripts\watch_sessions.py"
```

---

## 12. Testing and evaluation

### 12.1 Fixtures

Freeze 2–3 cached sessions as fixtures: one clean dry FP2, one with a red flag or yellows, and one sprint-weekend session. Commit their *derived* Parquet outputs (small) under `tests/fixtures/`. The raw FastF1 cache stays out of git.

### 12.2 Tests

| Test | What it guards |
|---|---|
| Segment times sum to the lap time (±0.05 s) | Anchoring and interpolation |
| Brake markers positive and below 400 m; min speed below entry speed | Corner extraction sanity |
| Degradation slopes within a plausible range; CI contains the estimate | Tyre fitting and fuel correction |
| Golden comparison of fixture outputs (tolerance-based) | Silent changes from refactors or library upgrades |
| Classifier: no out/in laps labelled `push`; long runs ≥ 5 laps | Like-for-like guarantee |
| MCP tools callable directly; bad IDs return helpful errors | Server behaviour without an LLM |
| Grounding rejects an invented number and an unknown key | Hallucination guard |
| Thinking disabled for both models (skipped if Ollama is down) | §4.3 |
| JSON validates with `think=False` for both models | Known Qwen3.5 issue (§4.7) |

`tests/test_models.py`:

```python
import httpx
import pytest
from ollama import chat

from f1_ai.debrief.schema import TeamDebrief


def _ollama_up() -> bool:
    try:
        return httpx.get("http://localhost:11434/api/version", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(not _ollama_up(), reason="Ollama not running")
MODELS = ["qwen3.5:4b", "granite4.2:8b"]


@pytest.mark.parametrize("model", MODELS)
def test_thinking_disabled(model):
    r = chat(model=model, messages=[{"role": "user", "content": "Reply with the word OK."}],
             think=False, options={"num_ctx": 2048})
    assert not r.message.thinking
    assert "OK" in r.message.content.upper()


@pytest.mark.parametrize("model", MODELS)
def test_structured_output_without_thinking(model):
    prompt = ("Team McLaren. Facts: seg.T3-T4 value 0.084 s, faster PIA, slower NOR. "
              "Write a debrief as JSON.")
    r = chat(model=model, messages=[{"role": "user", "content": prompt}], think=False,
             format=TeamDebrief.model_json_schema(), options={"num_ctx": 4096})
    TeamDebrief.model_validate_json(r.message.content.strip().strip("`").removeprefix("json"))
```

### 12.3 Eval set

The eval set is what makes the Alienware migration measurable.

`evals/questions.yaml` holds 20–30 questions with known answers taken from the fixtures:

```yaml
- id: seg-01
  session_id: 2026_xx_FP2
  question: "On push laps, in which segment did the slower McLaren driver lose the most time?"
  answer: "T3-T4"
  check: contains
- id: deg-01
  session_id: 2026_xx_FP2
  question: "Which driver had the lowest fuel-corrected degradation on MEDIUM long runs?"
  answer: "XXX"
  check: contains
```

`uv run python -m f1_ai.evals.run --model qwen3.5:4b` runs every question through the harness. It appends one row per run to `evals/results.csv` with these columns:

- model
- Ollama version
- `think=false`
- accuracy
- tool-call error rate
- median seconds per question
- debrief grounding pass rate

Run it for `qwen3.5:4b` and `granite4.2:8b` on the Surface to set the baseline.

---

## 13. Milestones (Surface)

```text
M1  Foundation
  ├── uv project, config, FastF1 cache, session IDs
  ├── Ingestion → laps table + session_metadata (Parquet store + DuckDB views)
  ├── Lap classifier, visually validated on fixture sessions
  └── Exit: fixtures frozen; classifier plots look right for every driver

M2  Physics engine
  ├── Corner anchoring, corner metrics, segment times + teammate deltas
  ├── Tyre degradation (Theil–Sen, configurable fuel model)
  ├── 2026 energy signature
  └── Exit: all physics tests and golden comparisons pass

M3  MCP server + IDE hookup
  ├── f1_* tools, schema resource, optional SQL tool
  ├── Inspector testing (no LLM), then VS Code / Cursor / Claude Desktop
  └── Exit: a cloud model answers 5 hand-written questions correctly via MCP

M4  Local models on the Surface
  ├── Ollama settings (§4.2), qwen3.5:4b + granite4.2:8b pulled
  ├── Thinking disabled and verified (check_models.py, test_models.py)
  ├── Harness with tool-call recovery
  └── Exit: thinking tests green; harness answers single-hop questions

M5  Debrief pipeline
  ├── Fact sheets, schema, grounding, retries, deterministic fallback
  ├── session_highlights + Markdown reports; poller + Task Scheduler
  └── Exit: a full session debriefs end to end; grounding pass rate recorded

M6  Evals + handoff
  ├── 20–30 question eval set; baseline results for both models
  ├── Freeze PIPELINE_VERSION; document measured speeds
  └── Exit: results.csv baseline exists → proceed to the Alienware deltas document
```

---

## 14. Risks and open questions

| Risk | Mitigation |
|---|---|
| 2026 data quirks (channel meanings, data delays, FastF1 changes) | Fixtures + golden tests; poller retries; pin FastF1 in `uv.lock` |
| Ollama behaviour changes between releases (thinking, `format`, tool parsing) | `check_models.py` after every upgrade; Ollama version stored with every debrief |
| Small-model quality ceiling | Narrow job (rephrase facts), grounding check, deterministic fallback, eval-driven model choice |
| Fuel model assumptions drive degradation numbers | Stored per row, surfaced by the MCP tool, calibrated per circuit |
| Too few comparable laps in practice | Significance flags; the debrief stays silent rather than guessing |
| Usage limits on IDE/cloud models | Local harness for routine questions; cloud for multi-hop analysis |

---

## References

- Ollama thinking controls: https://docs.ollama.com/capabilities/thinking
- Ollama Granite 4.2 tags: https://ollama.com/library/granite4.2
- IBM Granite 4.2 documentation (thinking modes, sampling): https://www.ibm.com/granite/docs/models/granite4-2
- Ollama issue, Qwen3.5 `format` ignored with thinking disabled: https://github.com/ollama/ollama/issues/14645
- Ollama issue, Qwen3.5 tool call printed as text: https://github.com/ollama/ollama/issues/14745
- FastF1 documentation: https://docs.fastf1.dev
- MCP Python SDK: https://github.com/modelcontextprotocol/python-sdk
