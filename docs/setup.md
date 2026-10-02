# Formula 1 AI Race Engineer — System Setup Guide

This guide walks you through setting up the complete Formula 1 AI Race Engineer development and runtime environment, including the Python backend, local Ollama models, and the Nothing Design System web frontend.

---

## 1. System Prerequisites

Ensure you have the following installed on your machine:
- **Operating System**: Windows 10/11, macOS, or Linux.
- **Python**: Version `3.11` to `3.13` (tested on Python 3.13.14).
- **Node.js**: Version `20.x` or later (tested on v24.18.0) with `npm` (v11+).
- **Ollama**: Version `0.35.x` or later for local CPU/GPU model inference.
- **Git**: Standard version control.

---

## 2. Python Environment & Backend Installation

The project uses standard setuptools packaging installed in editable mode into a dedicated virtual environment.

### 2.1 Create & Activate Virtual Environment

In the workspace root (`d:\coding\f1\franz-hermann`):

```powershell
# Create the virtual environment
python -m venv .venv

# Activate on Windows PowerShell
& .venv\Scripts\Activate.ps1

# (On Linux / macOS: source .venv/bin/activate)
```

### 2.2 Install Dependencies

Install the `f1-ai` package and all runtime dependencies in editable mode:

```powershell
& .venv\Scripts\pip.exe install -e .
```

This installs:
- `fastf1`: Formula 1 timing, telemetry, weather, and circuit data loader.
- `duckdb`: In-memory columnar SQL database engine for zero-lock views.
- `pyarrow`: Partitioned columnar Parquet reader/writer.
- `pandas`, `numpy`, `scipy`: Numerical processing, filtering, and Savitzky-Golay decel smoothing.
- `pydantic`: Schema validation for fact-sheets and debrief highlights.
- `fastapi`, `uvicorn`, `starlette`: REST API and web application server.
- `mcp[cli]<2`: Model Context Protocol server and client SDK.
- `ollama`: Official Python client for local inference.
- `httpx`, `pyyaml`: Network and configuration utilities.
- `pytest`: Invariant, grounding, and regression testing suite.

---

## 3. Ollama Configuration & Local Models

The architecture relies on CPU-friendly local models strictly configured with non-thinking sampling parameters (`think=False`).

### 3.1 Pull Local Models

Download the primary and comparison models from the official Ollama library:

```powershell
ollama pull qwen3.5:4b
ollama pull granite4.2:8b
```

### 3.2 Recommended Windows Environment Variables

To minimize memory usage and optimize CPU inference speed, configure these environment variables:

```powershell
# Enable flash attention for quantized KV cache
setx OLLAMA_FLASH_ATTENTION 1

# Quantize KV cache to q8_0 (halves memory usage vs f16)
setx OLLAMA_KV_CACHE_TYPE q8_0

# Context window size
setx OLLAMA_CONTEXT_LENGTH 8192

# Ensure only one model stays in RAM at any time
setx OLLAMA_MAX_LOADED_MODELS 1

# Single parallel slot
setx OLLAMA_NUM_PARALLEL 1

# Unload after 10 minutes of inactivity
setx OLLAMA_KEEP_ALIVE 10m
```

### 3.3 Verify Model Operation

Run the diagnostic script to verify model responsiveness and confirm zero thinking-token leakage:

```powershell
& .venv\Scripts\python.exe scripts/check_models.py
```

Expected output:
```text
Model: qwen3.5:4b, Speed: ~4.6 tok/s, Thinking chars: 0
Model: granite4.2:8b, Speed: ~3.3 tok/s, Thinking chars: 0
```

---

## 4. Frontend Setup (Nothing Design System UI)

The web frontend is located in the [`ui/`](file:///d:/coding/f1/franz-hermann/ui) directory and uses Vite with Vanilla TypeScript and pure Vanilla CSS.

### 4.1 Install Node Dependencies

```powershell
cd ui
npm install
```

### 4.2 Typography Requirements (Google Fonts)

The application strictly implements the Nothing Design System font stack loaded in [`ui/index.html`](file:///d:/coding/f1/franz-hermann/ui/index.html):
- **`Doto`** (400–700): Variable dot-matrix typeface for hero telemetry numbers and branding accents.
- **`Space Grotesk`** (300, 400, 500, 700): Primary grotesque body and heading font.
- **`Space Mono`** (400, 700): Monospace font for telemetry readouts, data tables, and ALL CAPS labels.

---

## 5. Configuration & Environment Variables

Copy the template environment file:

```powershell
cp .env.example .env
```

Available variables in [`.env`](file:///d:/coding/f1/franz-hermann/.env):

| Variable | Default | Purpose |
|---|---|---|
| `F1_ROOT` | Workspace root | Absolute path to the repository root directory. |
| `F1_DATA_DIR` | `data/` | Root data directory for Parquet tables, cache, and reports. |
| `F1_DEBRIEF_MODEL` | `qwen3.5:4b` | Ollama model used for post-session debrief synthesis. |
| `F1_CHAT_MODEL` | `qwen3.5:4b` | Ollama model used for live interactive chat inquiries. |
| `F1_FUEL_KG_PER_LAP` | `1.2` | Fuel consumption per lap for Theil-Sen degradation correction. |
| `F1_FUEL_S_PER_KG` | `0.03` | Lap time sensitivity to fuel mass (seconds per kg). |
| `F1_MCP_ENABLE_SQL` | `0` | Set to `1` to enable direct `f1_run_sql` tool over DuckDB views. |

---

## 6. Verification

Run the fast health verification:

```powershell
# Verify backend API unit tests
& .venv\Scripts\python.exe -m pytest tests/test_api.py -v

# Verify frontend builds cleanly
cd ui; npm run build
```
