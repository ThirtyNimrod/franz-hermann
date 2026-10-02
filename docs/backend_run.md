# Formula 1 AI Race Engineer — Backend & Services Execution Guide

This guide details how to run every service, pipeline, and client interface in the Formula 1 AI Race Engineer ecosystem.

---

## 1. Running the FastAPI Backend Server

The FastAPI backend exposes the DuckDB in-memory views over the Parquet store and connects to the local Ollama agent harness for interactive inquiries.

### Launch Server

From the project root:

```powershell
& .venv\Scripts\python.exe scripts/run_server.py
```

The server initializes with auto-reload at `http://127.0.0.1:8000`.

### Interactive API Documentation

- **Swagger UI**: Visit [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs) to explore and execute endpoints directly in your browser.
- **ReDoc**: Visit [`http://127.0.0.1:8000/redoc`](http://127.0.0.1:8000/redoc) for standard OpenAPI documentation.

### Core API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check verifying DuckDB view connectivity. |
| `GET` | `/api/sessions` | List all ingested sessions (`session_id`, `event_name`, etc.). |
| `GET` | `/api/sessions/{session_id}/drivers` | Teams, drivers, and lap counts by run-type. |
| `GET` | `/api/sessions/{session_id}/corners` | Ordered corner markers (`T1`, `T2`, ... `T14`). |
| `GET` | `/api/sessions/{session_id}/corners/compare` | Braking onset, apex speed, throttle pickup, decel G, and corner style. |
| `GET` | `/api/sessions/{session_id}/segments` | Segment deltas with 90% confidence intervals and significance flags. |
| `GET` | `/api/sessions/{session_id}/tyre` | Theil-Sen fuel-corrected tyre degradation slopes (`deg_s_per_lap`). |
| `GET` | `/api/sessions/{session_id}/energy` | 2026 straight-line speed shape and electrical energy clipping flags. |
| `GET` | `/api/sessions/{session_id}/highlights` | Grounded post-session debrief summary and setup hypotheses. |
| `POST` | `/api/chat` | Natural language question answering via the local agent harness. |

---

## 2. Running the Vite Web Console (Nothing UI)

The web console provides the dual-deck pit wall interface built with the Nothing Design System.

### Launch Development Server

In a new terminal window:

```powershell
cd ui
npm run dev
```

Open your browser to:
```text
http://localhost:5173/
```

- **API Proxy**: Requests to `/api/*` are automatically forwarded to `http://127.0.0.1:8000`.
- **Hot Module Replacement (HMR)**: Changes to CSS tokens, components, and controllers update instantly in the browser.

### Production Build & Preview

```powershell
cd ui
npm run build
npm run preview
```

---

## 3. Running the FastMCP Server (IDE & Assistant Integration)

The MCP server provides read-only `f1_*` tools over standard I/O (stdio).

### Direct Launch via CLI

```powershell
& .venv\Scripts\python.exe -m f1_ai.mcp_server
```

### VS Code & GitHub Copilot Integration

The server is pre-configured in [`.vscode/mcp.json`](file:///d:/coding/f1/franz-hermann/.vscode/mcp.json):

```json
{
  "servers": {
    "f1-ai": {
      "command": "${workspaceFolder}/.venv/Scripts/python.exe",
      "args": ["-m", "f1_ai.mcp_server"],
      "env": {
        "F1_DATA_DIR": "${workspaceFolder}/data"
      }
    }
  }
}
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "f1-race-engineer": {
      "command": "D:\\coding\\f1\\franz-hermann\\.venv\\Scripts\\python.exe",
      "args": ["-m", "f1_ai.mcp_server"],
      "env": {
        "F1_DATA_DIR": "D:\\coding\\f1\\franz-hermann\\data"
      }
    }
  }
}
```

### Available MCP Tools

- `f1_list_sessions(year)`: Discovery of available sessions.
- `f1_list_drivers(session_id)`: Active teams, drivers, and lap distributions.
- `f1_list_corners(session_id)`: Ordered corner markers.
- `f1_compare_teammates_corner(...)`: Teammate braking and apex telemetry.
- `f1_get_segment_deltas(...)`: Inter-corner time deltas with 90% CI.
- `f1_query_tyre_degradation(...)`: Long-run degradation slopes.
- `f1_get_energy_signature(...)`: 2026 straight-line electrical clipping.
- `f1_get_session_highlights(...)`: Stored grounded debrief highlights.
- Resource `f1://schema`: Schema descriptors for every DuckDB view.

---

## 4. Running the Post-Session Debrief Pipeline

The debrief pipeline takes deterministic session facts, executes a single structured LLM call per constructor team, validates numbers against truth-tables, and writes outputs:

```powershell
& .venv\Scripts\python.exe -m f1_ai.debrief.pipeline 2026_01_FP2 qwen3.5:4b
```

Outputs:
1. Records are atomically written to the `session_highlights` Parquet table:
   `data/parquet/session_highlights/session_id=2026_01_FP2/part-0.parquet`.
2. A human-readable Markdown report is saved at:
   `data/reports/2026_01_FP2.md`.

---

## 5. Ad-Hoc CLI Agent Queries

You can ask natural language race engineering questions directly from the command line:

```powershell
& .venv\Scripts\python.exe -m f1_ai.harness.agent "In 2026_01_FP2, compare Russell and Antonelli into T1"
```

The agent connects to the local FastMCP server via stdio, autonomously calls `f1_compare_teammates_corner`, and formats a grounded response using the local model.

---

## 6. FastF1 Ingestion & Session Watcher

To poll for new sessions from FastF1 and ingest them into the partitioned Parquet store:

```powershell
& .venv\Scripts\python.exe scripts/watch_sessions.py
```

The watcher downloads timing and telemetry, performs lap classification (`push`, `long_run`, `out_in`, `cooldown`), anchors corners, computes segment deltas, fits degradation slopes, and saves all tables atomically into `data/parquet/`.
