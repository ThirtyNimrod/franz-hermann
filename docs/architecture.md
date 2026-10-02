# Formula 1 AI Race Engineer — Technical Architecture

This document provides a comprehensive technical breakdown of the architecture, deterministic physics engine, lock-free storage model, grounding validation pipeline, and Nothing Design System user interface.

---

## 1. Architectural Principles

1. **Deterministic Calculation Layer**: The Large Language Model (LLM) never performs arithmetic, telemetry slicing, or curve fitting. All physics calculations (braking distances, apex minimum speeds, Savitzky-Golay deceleration filtering, Theil-Sen regression slopes, bootstrap confidence intervals) are computed deterministically using NumPy and SciPy.
2. **Like-for-Like Comparisons**: Laps are classified into discrete operational regimes (`push`, `long_run`, `out_in`, `cooldown`, `invalid`). A qualifying simulation push lap is never compared against a heavy fuel long-run stint.
3. **Uncertainty Travels with the Number**: Every metric carries a sample count (`n_laps`) and statistical spread (Interquartile Range IQR or 90% bootstrap Confidence Interval). Differences smaller than the spread are classified as statistical noise.
4. **Lock-Free Partitioned Storage**: Telemetry is written as Hive-partitioned Parquet files using atomic staging folder swaps, queried through in-memory DuckDB views with zero locking.
5. **Model-Agnostic Dual Access**: Read-only tools are exposed simultaneously via standard stdio FastMCP (for IDE assistants like Copilot and Claude Desktop) and high-speed REST API (for web interfaces).
6. **Strict Grounding Assertions**: LLM debrief text is verified against a mathematical truth-table. If the model introduces any ungrounded number, it is rejected and safely replaced with a deterministic fallback.

---

## 2. End-to-End System Architecture

```mermaid
flowchart TD
    subgraph Ingestion["1. Ingestion & Classification"]
        F1[FastF1 API / Local Disk Cache] --> Loader[fastf1_loader.py]
        Loader --> Classifier[lap_classifier.py]
        Classifier -->|Run Types: push, long_run, cooldown| Filter[Filtered Run Laps]
    end

    subgraph Physics["2. Deterministic Physics Engine"]
        Filter --> Anchors[anchors.py: Corner Anchoring by X/Y Window]
        Anchors --> Corners[corners.py: Brake Onset, Apex Speed, Throttle Pickup, Style]
        Anchors --> Segments[segments.py: Inter-Corner Segments & Bootstrap 90% CI]
        Filter --> Tyre[tyre.py: Theil-Sen Fuel-Corrected Degradation]
        Filter --> Energy[energy.py: 2026 Straight-Line Clipping Signature]
    end

    subgraph Storage["3. Lock-Free Storage Subsystem"]
        Corners --> Writer[parquet_store.py: Atomic Staging Swap]
        Segments --> Writer
        Tyre --> Writer
        Energy --> Writer
        Writer --> Parquet[("Partitioned Parquet Files\ndata/parquet/<table>/session_id=<id>/")]
        Parquet --> Duck[duck.py: DuckDB In-Memory Views]
    end

    subgraph Services["4. Services & Assistants"]
        Duck --> MCP[mcp_server.py: FastMCP Stdio Server]
        Duck --> API[api.py: FastAPI REST Server]
        Duck --> Debrief[debrief/pipeline.py: Grounded Synthesis]
        Debrief --> Ollama[Local Ollama: qwen3.5:4b (think=False)]
    end

    subgraph Clients["5. User Interfaces"]
        MCP --> IDE[VS Code / Copilot / Claude Desktop]
        API --> UI["Nothing Design System UI\n(Vite + Vanilla TS/CSS)"]
        API <--> Agent[harness/agent.py: AI Intercom Terminal]
    end
```

---

## 3. Deterministic Physics Engine Details

### 3.1 Corner Anchoring (`src/f1_ai/physics/anchors.py`)
To prevent track crossover geometry errors (e.g. Suzuka's figure-8 crossover or tight hairpin loops), corner markers are anchored per-lap by finding the closest coordinate $(X, Y)$ within a narrow distance window ($300\text{ m}$) along the reference track trajectory.

### 3.2 Corner Telemetry Extraction (`src/f1_ai/physics/corners.py`)
For every anchored corner and driver lap:
- **Braking Onset**: Point before the corner marker where brake pressure triggers and deceleration begins ($m\text{ before apex}$).
- **Minimum Apex Speed**: Lowest telemetry velocity ($\text{km/h}$) recorded inside the apex window, along with its relative position ($m$).
- **Full Throttle Pickup**: Distance ($m\text{ after apex}$) where throttle reaches $\ge 98\%$ and is sustained for $\ge 0.5\text{ s}$.
- **Deceleration Peak**: Savitzky-Golay smoothed deceleration estimation ($\text{G}$).
- **Dwell Ratio**: Percentage of corner distance spent within $5\text{ km/h}$ of minimum apex speed.
- **Corner Style Classification**:
  - `U-Style`: High minimum apex speed and prolonged rolling dwell ratio (momentum driving).
  - `V-Style`: Aggressive late braking, deep rotation, and early full throttle pickup (point-and-squirt driving).

### 3.3 Segment Times & Bootstrap Deltas (`src/f1_ai/physics/segments.py`)
- Segment boundaries are defined between sequential corner anchors (`start-T1`, `T1-T2`, etc.).
- Teammate differences are computed via **bootstrap resampling** ($2{,}000$ iterations) to generate non-parametric $90\%$ confidence intervals:
  $$\Delta = \bar{T}_{\text{driver A}} - \bar{T}_{\text{driver B}}$$
- A segment gap is flagged as `significant=True` if and only if the $90\%$ confidence interval does not cross zero.

### 3.4 Tyre Degradation Model (`src/f1_ai/physics/tyre.py`)
- Filters consecutive long-run laps ($\ge 5$ laps within $\pm 3\%$ median pace), discarding the initial warmup lap.
- Applies per-lap fuel weight correction:
  $$T_{\text{corrected}} = T_{\text{lap}} - (\text{LapIndex} \times \text{fuel\_kg\_per\_lap} \times \text{fuel\_s\_per\_kg})$$
- Fits a robust **Theil-Sen linear regression** on `TyreLife` to extract:
  - `deg_s_per_lap`: Seconds lost per lap of tyre age.
  - `base_pace_s`: Baseline stint pace.
  - Residual standard deviation and confidence interval bounds.

### 3.5 2026 Straight-Line Energy Clipping (`src/f1_ai/physics/energy.py`)
Under 2026 technical regulations, high electric motor deployment ($350\text{ kW}$) causes battery depletion on long straights:
- Identifies full-throttle straights ($>400\text{ m}$).
- Computes $V_{\text{peak}}$, $V_{\text{end}}$ (speed immediately prior to braking), and `late_loss_kmh` ($V_{\text{peak}} - V_{\text{end}}$ while remaining at $100\%$ throttle).
- Flags `clipping_flag=True` when late speed loss exceeds threshold, differentiating electrical energy derate from aerodynamic drag.

---

## 4. Storage Architecture: Partitioned Parquet & DuckDB

```text
data/parquet/
├── corner_metrics/
│   ├── session_id=2024_99_FP2/part-0.parquet
│   └── session_id=2026_01_FP2/part-0.parquet
├── energy_signature/
├── laps/
├── segment_deltas/
├── session_highlights/
├── session_metadata/
└── tyre_stints/
```

- **Atomic Staging Writes**: Writers first output to `data/parquet/_staging/<table>/session_id=<id>/part-0.parquet`, flush buffers, close handles, and atomically rename to the target path. Windows file lock contention is handled with exponential backoff retries.
- **Zero-Lock DuckDB Views**: Readers call `duckdb.connect()` in-memory and register views using DuckDB's globbing:
  ```sql
  CREATE VIEW corner_metrics AS 
  SELECT * FROM read_parquet('data/parquet/corner_metrics/*/*.parquet', hive_partitioning = true)
  ```
  This eliminates database write locks, enabling simultaneous reading from the MCP server, FastAPI server, and debrief pipeline.

---

## 5. Grounding & Anti-Hallucination Pipeline

The debrief synthesizer ([`src/f1_ai/debrief/pipeline.py`](file:///d:/coding/f1/franz-hermann/src/f1_ai/debrief/pipeline.py)) enforces rigorous accuracy:
1. **Fact-Sheet Assembly**: Extracts deterministic metrics into a structured JSON fact sheet.
2. **Single LLM Invocation**: Sends the fact sheet to the local model (`qwen3.5:4b` or `granite4.2:8b`) with strict Pydantic JSON schema constraints.
3. **Grounding Validator**:
   - Parses all numbers in the generated summary.
   - Asserts every number exists in the fact sheet (or is a valid derived calculation).
   - Rejects ungrounded claims or hallucinated teammate gaps.
4. **3-Attempt Retry & Deterministic Fallback**: If the model fails validation after 3 attempts, the pipeline falls back to an algorithmic template:
   `"Automatic summary (deterministic fallback applied). Largest teammate gap in <segment>."`

---

## 6. Nothing Design System UI Architecture

The frontend follows the **Nothing Design System** principles:

### 6.1 Typography Stack
- **`Doto`**: Variable dot-matrix typeface used for hero apex speeds (`168 KM/H`) and branding badges.
- **`Space Grotesk`**: Swiss grotesque typeface for headings, strategic debrief text, and general UI.
- **`Space Mono`**: Monospace typeface with `0.08em` letter spacing for telemetry metrics, data tables, and ALL CAPS labels.

### 6.2 Dual-Mode Palette
- **Light Mode First** (`[data-theme="light"]`): Technical printed race manual with `#F5F5F5` background, `#FFFFFF` elevated surfaces, `#000000` display numerals, and `#1A1A1A` body text.
- **Dark Mode** (`[data-theme="dark"]`): OLED black `#000000` background with `#111111` surfaces and glowing white data readouts.
- **Single Signal Accent**: `#D71921` (Signal Red) used exclusively for battery clipping alarms, statistically significant time losses, and live communication states.

### 6.3 Mechanical Components
- **Segmented Progress Bars**: Discrete rectangular blocks with 2px gaps (`.seg-bar`), providing instrument-like telemetry readouts without continuous gradients.
- **Dot-Grid Canvas Motif**: Subtle background grid generated via `radial-gradient` circles on 16px centers.
- **Zero-Shadow Policy**: Flat surfaces with crisp 1px wireframe border separation (`#CCCCCC` in Light mode, `#333333` in Dark mode).
