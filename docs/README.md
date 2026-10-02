# Formula 1 AI Race Engineer — Documentation Hub

Welcome to the technical documentation for the **Formula 1 AI Race Engineer (Phase 1 & Phase 2)**. This project implements a deterministic telemetry and physics calculation engine, a lock-free Hive-partitioned Parquet data store, a post-session local LLM debrief pipeline, a FastMCP server for IDE integration, a FastAPI backend, and an industrial Nothing Design System telemetry console.

---

## 📚 Documentation Index

| Guide | Description |
|---|---|
| [**System Setup Guide**](file:///d:/coding/f1/franz-hermann/docs/setup.md) | Prerequisites, Python virtual environment, dependencies, Ollama model setup, and environment variables. |
| [**Backend & Services Execution**](file:///d:/coding/f1/franz-hermann/docs/backend_run.md) | Running the FastAPI API, Vite Nothing UI, FastMCP server, FastF1 session watcher, post-session debrief pipeline, and CLI agent queries. |
| [**Testing & Benchmark Verification**](file:///d:/coding/f1/franz-hermann/docs/testing.md) | Test execution guide for physics invariants, grounding validation, MCP tools, 2026 GP Melbourne fixtures, API tests, and evaluation benchmarks. |
| [**Technical Architecture & Design**](file:///d:/coding/f1/franz-hermann/docs/architecture.md) | Comprehensive system architecture: deterministic physics calculations, Hive-partitioned Parquet storage, DuckDB in-memory views, LLM grounding verification, and the Nothing Design System UI. |
| [**Phase 1 Surface Roadmap**](file:///d:/coding/f1/franz-hermann/docs/surface/roadmap.md) | The architectural blueprint, regulations updates, and hardware budget for the Surface Laptop 3 development environment. |

---

## 🏎️ Key System Features

- **Deterministic Calculation Layer**: Telemetry calculation (apex speeds, braking onset markers, throttle pickups, dwell ratios) and statistics (Theil-Sen fuel-corrected tyre degradation, bootstrap teammate segment deltas, 2026 straight-line energy clipping) computed strictly via NumPy and SciPy. The LLM never performs arithmetic.
- **Lock-Free Partitioned Storage**: Per-session Hive-partitioned Parquet storage with atomic staging swaps, queried concurrently through DuckDB views with zero locks.
- **Grounded Post-Session Debrief**: One structured JSON call per constructor team to local Ollama models (`qwen3.5:4b` or `granite4.2:8b`) with strict number and fact-key verification and deterministic fallback.
- **Dual Client Access**:
  - **FastMCP Stdio Server**: Read-only `f1_*` tools for Claude Desktop, VS Code, GitHub Copilot, and Cursor.
  - **FastAPI + Vite Console**: High-speed REST API coupled with an industrial Nothing Design System UI (Light/Dark mode, Google Fonts `Doto`, `Space Grotesk`, `Space Mono`, segmented progress bars).
- **2026 Technical Regulations Ready**: Energy deployment signatures and battery clipping detection for the 2026 power unit regulations, tested against Albert Park Melbourne Grand Prix data.
