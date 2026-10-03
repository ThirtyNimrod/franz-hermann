# Formula 1 AI Race Engineer — UI/UX Implementation Plan (Option C)  This implementation plan establishes the architectural blueprint, design tokens, component specifications, and step-by-step development roadmap for the **Option C Pit Wall Console**.   Option C solves the ergonomic limitations of the Surface Laptop 3 (3:2 aspect ratio display, 150% Windows scaling, touch/tablet usage) by utilizing a **Full-Width Telemetry & Strategy Deck** coupled with a **Pinned Bottom Radio Transponder & Slide-Up Comms Sheet**, while retaining adaptive docking for widescreen monitors and the Alienware M15 R2.

---

##
1. Architectural Blueprint & Ergonomics

### 1.1 The Surface Laptop 3 Viewport Constraints  On a 13.5-inch Surface Laptop 3 running at native $2256 times 1504$ resolution with Windows default $150%$ display scaling:
* **Effective CSS Canvas:** $1504 times 1002text{px}$.
* **Effective Usable Height:** After browser chrome, address bar, and OS taskbar, available vertical space is approximately **$880text{px} - 910text{px}$**.
* **Virtual Keyboard Impact:** Tapping a standard input field in tablet mode raises the Windows on-screen touch keyboard, consuming roughly **$350text{px} - 400text{px}$** of vertical height.

### 1.2 Layout Geometry: Option C vs. Dual-Pane Docking


`

``text ==================================================================================================== VIEWPORT PROFILE 1: SURFACE LAPTOP 3 / TABLET / 3:2 SCREENS (Default Option C) ---------------------------------------------------------------------------------------------------- ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐ │ HEADER (38px): ● PIT WALL // MELBOURNE | 2026_01_R | McLAREN [PIA/NOR] | LONG RUN | 14:32:05 UTC│ ├──────────────────────────────────────────────────────────────────────────────────────────────────┤ │
1. CORNER STEPPER & DRIVER CASSETTES (~130px)                                                    │ │    [T1] [T2] [● T3] [T4] [T5] [T6] [T7] [T8] [T9] [T10] [T11] [T12] [T13] [T14]                │ │    ┌─────────────────────────────────────────┐ ┌────────────────────────────────────────┐       │ │    │ PIA  [V-STYLE]                          │ │ NOR  [V-STYLE]                         │       │ │    │ APEX: 165 KM/H (IQR ±2.4)               │ │ APEX: 161 KM/H (IQR ±3.1)              │       │ │    │ BRK: 78.9m [■■■■■■]  THR: 72.4m  4.62G  │ │ BRK: 94.4m [■■■■■■■■]  THR: 76.8m 4.48G│       │ │    └─────────────────────────────────────────┘ └────────────────────────────────────────┘       │ ├──────────────────────────────────────────────────────────────────────────────────────────────────┤ │
2. FULL-WIDTH STRATEGY & TELEMETRY DECK (Flex-1: ~680px available)                               │ │    Tabs: [SEGMENTS]  [TYRE DEG]  [2026 ENERGY]  [RACE REPLAY]  [EXECUTIVE DEBRIEF]               │ │                                                                                                  │ │    TRACK SEGMENT    DELTA (PIA - NOR)    90% CONFIDENCE INTERVAL    TELEMETRY STATUS             │ │    start-T1         +0.142 S             [+0.082s, +0.202s]         [SIGNIFICANT] (loss)         │ │    T1-T2            -0.051 S             [-0.092s, -0.010s]         [SIGNIFICANT] (gain)         │ │    T3-T4            +0.084 S             [+0.031s, +0.137s]         [SIGNIFICANT] (loss)         │ │    T6-T7            -0.021 S             [-0.065s, +0.023s]         [SPREAD / NOISE]             │ ├──────────────────────────────────────────────────────────────────────────────────────────────────┤ │
3. PINNED BOTTOM RADIO TRANSPONDER BAR (44px)                                                    │ │    [● COMM ACTIVE]  Engineer: PIA carries +4 km/h apex roll into T3... [▲ EXPAND] [Input] [SEND]│ └──────────────────────────────────────────────────────────────────────────────────────────────────┘    ▲ Tapping the ticker or chevron expands the 65vh slide-up Comms Drawer over the lower deck.  ==================================================================================================== VIEWPORT PROFILE 2: WIDESCREEN / EXTERNAL MONITOR / ALIENWARE (Automatic Adaptive Split) Conditions: min-width >= 1500px AND min-aspect-ratio >= 16/10 ---------------------------------------------------------------------------------------------------- ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐ │ APP HEADER (38px)                                                                                │ ├────────────────────────────────────────────────────────┬─────────────────────────────────────────┤ │ LEFT DECK: TELEMETRY & STRATEGY (60%)                  │ RIGHT DECK: PERMANENT INTERCOM (40%)    │ │ - Corner Stepper & Driver Cassettes                    │ - Executive Debrief Accordion           │ │ - Full-Width Tables (Segments / Tyre / Energy / Replay)│ - Continuous Message Stream             │ │                                                        │ - Pinned Prompt Input                   │ └────────────────────────────────────────────────────────┴─────────────────────────────────────────┘


`

`
`

---

##
2. Design System Tokens: Nothing OS × Pit Wall Hardware  All visual stylings follow the **Nothing Design System**: monoline geometric typography, Swiss grid alignment, dot-matrix telemetry indicators, and


`

#D71921
`

Signal Red reserved strictly for telemetry alerts.


`

``css :root, [data-theme="light"] {   /* Canvas & Technical Surfaces */   --canvas-bg: #F4F4F2;   --surface-base: #FFFFFF;   --surface-raised: #EBEBE8;   --surface-overlay: rgba(255, 255, 255, 0.94);      /* Precision Borders (No Drop Shadows) */   --border-subtle: #E2E2DF;   --border-strong: #C8C8C4;   --border-focus: #000000;      /* Monochrome Type System */   --text-display: #000000;   --text-primary: #1A1A1A;   --text-secondary: #666666;   --text-muted: #999999;      /* Telemetry Accent & Alerts */   --signal-red: #D71921;   --signal-red-subtle: rgba(215, 25, 33, 0.12);   --signal-green: #2E7D32;   --signal-green-subtle: rgba(46, 125, 50, 0.12);   --signal-amber: #B78103;      /* Typography Families */   --font-display: "Doto", "Space Mono", monospace;   --font-mono: "Space Mono", ui-monospace, monospace;   --font-body: "Space Grotesk", system-ui, sans-serif;      /* Micro Geometries */   --radius-cassette: 6px;   --radius-technical: 3px;   --radius-pill: 999px;   --trans-speed: 140ms cubic-bezier(0.2, 0.0, 0.2, 1); }  [data-theme="dark"] {   --canvas-bg: #000000;   --surface-base: #0E0E0E;   --surface-raised: #181818;   --surface-overlay: rgba(14, 14, 14, 0.96);   --border-subtle: #222222;   --border-strong: #333333;   --border-focus: #FFFFFF;   --text-display: #FFFFFF;   --text-primary: #ECECEC;   --text-secondary: #888888;   --text-muted: #555555;   --signal-red-subtle: rgba(215, 25, 33, 0.22);   --signal-green-subtle: rgba(46, 125, 50, 0.22); }


`

`
`

---

##
3. Component Architecture & Detailed Specifications

### 3.1 Pinned App Header (`HeaderBar.ts`)
* **Height:** Fixed at $38text{px}$ (reclaiming $14text{px}$ over legacy $52text{px}$).
* **Elements:**
1. *Telemetry Pulse:* Small pulsating dot (`6px`) +


`

PIT WALL // MELBOURNE`.
2. *Session Selector:* Minimal pill dropdown (`2026_01_R`,


`

2026_01_FP2`).
3. *Constructor Switcher:* Dynamic team pill dropdown (deriving pairings like


`

McLaren [PIA/NOR]
`

or


`

Ferrari [LEC/HAM]`).
4. *Run Type Switcher:*


`

PUSH
`

vs


`

LONG RUN`.
5. *UTC Clock:* Monospace track time (`HH:MM:SS UTC`).
6. *Theme Toggle:*


`

[ DARK ]
`

/


`

[ LIGHT ]`.

### 3.2 Corner Stepper Strip (`CornerStepper.ts`)
* **Height:** $34text{px}$.
* **Track Ordering:** Strict numerical sorting ($T1, T2, dots, T14$).
* **Touch Optimization:** Minimum touch target of $44text{px}$ width per corner button.
* **Keyboard Hotkeys:**


`

ArrowLeft
`

and


`

ArrowRight
`

switch active corners instantly.

### 3.3 Horizontal Driver Telemetry Cassettes (`DriverCassettes.ts`) Instead of vertically stretched cards that force text downwards, driver data is formatted as two **horizontal hardware strips** side-by-side:


`

``text ┌────────────────────────────────────────────────────────────────────────────────────────┐ │ PIA   [V-STYLE]                                                                        │ │ ┌─────────────────────────┐  Brake:    78.9 m before  [■■■■■■░░░░]                     │ │ │ 165 KM/H                │  Throttle: 72.4 m after                                    │ │ │ IQR: ±2.4 (52 LAPS)     │  Decel:    4.62 G est.      Dwell Ratio: 0.18              │ │ └─────────────────────────┘                                                            │ └────────────────────────────────────────────────────────────────────────────────────────┘


`

`
`

* **Left Sub-Panel:** Large minimum apex speed formatted in


`

Doto
`

variable dot-matrix ($30text{px}$ font size) with IQR spread below.
* **Right Sub-Panel:**    * 10-block discrete mechanical braking indicator ($8text{px}$ high, $2text{px}$ block gaps).   * Throttle re-application distance and estimated peak deceleration G.   *

`dwell
_ratio
`

rating showing car rotation efficiency.

### 3.4 Full-Width Telemetry & Strategy Analyzer (`TelemetryAnalyzer.ts`) Occupies the entire screen width with horizontal space to prevent truncation:
* **Segment Deltas Table:**   * Columns:


`

TRACK SEGMENT`,


`

DELTA (A - B)`,


`

90% BOOTSTRAP CI`,


`

RUN TYPE`,


`

SIGNIFICANCE`.   * The full confidence interval (e.g.


`

[+0.082s, +0.202s]`) renders without truncation or line breaks.
* **Tyre Degradation Table:**   * Columns:


`

DRIVER`,


`

COMPOUND`,


`

DEG RATE (s/lap)`,


`

90% CI`,


`

BASE PACE (s)`,


`

STINT LAPS`,


`

FUEL MODEL`.
* **2026 Energy & Straight-Line Table:**   * Tracks full-throttle stretches $>400text{m}$.   * Displays $V_{text{peak}}$, $V_{text{end}}$,


`

Late Loss (km/h)`, and the


`

#D71921
`


`

[CLIPPING ALERT]
`

indicator.
* **Race Replay Scrubber:**   * Scrub timeline ($1$ to $58$ laps) with live leaderboard intervals, pit counters, and tyre age.

### 3.5 Pinned Bottom Radio Transponder & Comms Drawer (`RadioTransponder.ts`)

#### State 1: Pinned Transponder Bar (Collapsed)
* **Height:** Pinned at $44text{px}$ along the bottom viewport edge.
* **Visual Presentation:**


`

``text   [● RADIO ACTIVE]  Engineer: PIA carries +4 km/h apex roll into T3...  [▲ EXPAND] [ Ask... ] [SEND]


`

`
`

* **Ticker:** Automatically displays the most recent incoming transmission from the deep debrief pipeline or spotter agent.
* **Fast Input:** Quick text input pill on the right for typing immediate questions without opening the full drawer.

#### State 2: Slide-Up Comms Sheet (Expanded)
* **Trigger:** Click the transponder ticker, tap


`

[▲ EXPAND]`, or press shortcut


`

Ctrl + /`.
* **Behavior:** Smoothly slides up from the bottom, occupying **$65text{vh}$** of the screen with a subtle translucent blur (`backdrop-filter: blur(16px)`).
* **Keyboard Tolerance:** When the Surface on-screen touch keyboard appears, the sheet remains anchored above the keyboard, preserving message visibility.
* **Contents:**
1. *Historical Comms Stream:* Full conversation with auto-scroll and timestamps.
2. *Grounded Verification Badges:* Direct citations verified against DuckDB fact sheets.
3. *Dynamic Team Suggestion Chips:* Team-tailored query buttons.
4. *Close Button:* Tap


`

[▼ COLLAPSE]
`

or tap outside to tuck the drawer away.

---

##
4. Bidirectional UI Deep-Linking Architecture  A major flaw in the original design was the isolation between chat messages and telemetry tables. The new implementation enforces **bidirectional event bus synchronization**:


`

``text ┌─────────────────────────────────┐                 ┌─────────────────────────────────┐ │     AI INTERCOM / DEBRIEF       │                 │     TELEMETRY & STRATEGY DECK   │ │                                 │                 │                                 │ │ "...NOR lost 0.142s braking     │                 │ Active Corner: [T3]             │ │  earlier into <a data-t3>T3</a> │ ── (Event Bus) ─► Active Tab:    [SEGMENTS]       │ │  compared to PIA..."            │                 │ Highlight Row: [T3-T4 Delta]    │ └─────────────────────────────────┘                 └─────────────────────────────────┘


`

`
`

1. **Text Tokenizer:** When the local model or MCP backend emits structured debrief text, regex parsers transform corner tokens (`T1`–`T14`) and segment keys (`seg.T3-T4`) into interactive anchor elements:


`

``html    <button class="chip-anchor" data-corner="T3" data-tab="segments">T3 ↗</button>


`

`
`

2. **Auto-Navigation:** Clicking any citation automatically:    * Sets

`state
.selectedCorner = "T3"`.    * Switches to the appropriate tab (`SEGMENTS`).    * Highlights the corresponding row in the data table.    * Auto-scrolls the table to the target element.

---

##
5. Implementation Milestones


`

``text Milestone UI-1: Layout Skeleton & Responsive Grid   ├── Build CSS Grid architecture for Option C   ├── Implement min-width/aspect-ratio media queries for widescreen auto-docking   └── Test viewport fitting on Surface Laptop 3 (1002px height) with zero whole-page scroll  Milestone UI-2: Driver Hardware Cassettes & Stepper   ├── Implement naturally ordered Corner Stepper with arrow-key listeners   ├── Build horizontal driver telemetry strips with Doto font and 10-block braking LEDs   └── Add dwell ratio and corner style classification badges (U-style vs V-style)  Milestone UI-3: Full-Width Analytical Data Tables   ├── Build sticky-header tables for Segments, Tyre Degradation, and 2026 Energy   ├── Implement full 90% confidence interval formatting without truncation   └── Implement Race Replay timeline scrubber with play/pause animations  Milestone UI-4: Pinned Radio Transponder & Slide-Up Comms Sheet   ├── Build 44px fixed bottom bar with rolling text ticker and quick input   ├── Implement CSS transform slide-up drawer (65vh) with backdrop blur   └── Verify touch interactions and on-screen keyboard compatibility on Surface 3:2  Milestone UI-5: Bidirectional Deep-Linking & Event Wiring   ├── Create global UI State Event Bus   ├── Tokenize debrief strings into clickable corner/segment links   └── Wire dynamic team suggestion chips to auto-fill input fields  Milestone UI-6: Integration with Local Ingestion & MCP Server   ├── Connect UI fetch clients to local Python FastAPI/Parquet server   ├── Stream grounded highlights directly from DuckDB

`session
_highlights
`

table   └── Validate offline execution on Alienware M15 R2 CUDA backend


`

`
`

---

##
6. Standalone Option C Prototype (`demo_option_c.html`)  This prototype implements the complete Option C specification with Nothing OS design tokens, horizontal driver cassettes, full-width tables, and the slide-up comms drawer:


`

``html <!DOCTYPE html> <html lang="en" data-theme="light"> <head>   <meta charset="UTF-8" />   <meta name="viewport" content="width=device-width, initial-scale=1.0" />   <title>F1 AI Race Engineer — Option C Console</title>   <link rel="preconnect" href="https://fonts.googleapis.com" />   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />   <link href="https://fonts.googleapis.com/css2?family=Doto:wght@500;700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />    <style>     :root, [data-theme="light"] {       --bg: #F4F4F2;       --surface: #FFFFFF;       --surface-raised: #EBEBE8;       --border: #E0E0DC;       --border-strong: #C4C4BF;       --text-display: #000000;       --text-primary: #1A1A1A;       --text-secondary: #666666;       --text-disabled: #999999;       --accent: #D71921;       --accent-subtle: rgba(215, 25, 33, 0.12);       --success: #2E7D32;       --font-display: "Doto", "Space Mono", monospace;       --font-body: "Space Grotesk", sans-serif;       --font-mono: "Space Mono", monospace;       --radius-tech: 4px;       --radius-pill: 999px;       --trans: 140ms cubic-bezier(0.2, 0.0, 0.2, 1);     }      [data-theme="dark"] {       --bg: #000000;       --surface: #0E0E0E;       --surface-raised: #181818;       --border: #222222;       --border-strong: #333333;       --text-display: #FFFFFF;       --text-primary: #ECECEC;       --text-secondary: #888888;       --text-disabled: #555555;       --accent-subtle: rgba(215, 25, 33, 0.22);     }      * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }     body {       background-color: var(--bg);       color: var(--text-primary);       font-family: var(--font-body);       font-size: 13px;       height: 100vh;       overflow: hidden;       display: flex;       flex-direction: column;     }      /* Pinned Compact Header (38px) */     .app-header {       height: 38px;       background-color: var(--surface);       border-bottom: 1px solid var(--border-strong);       display: flex;       align-items: center;       justify-content: space-between;       padding: 0 14px;       flex-shrink: 0;       font-family: var(--font-mono);       font-size: 11px;     }     .brand-cluster { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-display); }     .pulse-dot { width: 6px; height: 6px; background-color: var(--accent); border-radius: 50%; display: inline-block; }     .header-ctrls { display: flex; align-items: center; gap: 8px; }     .ctrl-pill {       background: var(--surface-raised);       border: 1px solid var(--border);       color: var(--text-primary);       font-family: var(--font-mono);       font-size: 10px;       padding: 3px 8px;       border-radius: var(--radius-tech);       outline: none;       cursor: pointer;     }     .btn-pill {       background: transparent;       border: 1px solid var(--border-strong);       color: var(--text-secondary);       font-family: var(--font-mono);       font-size: 10px;       padding: 3px 10px;       border-radius: var(--radius-pill);       cursor: pointer;       transition: var(--trans);     }     .btn-pill:hover { color: var(--text-display); border-color: var(--text-display); }      /* Main Console Area */     .workspace {       flex: 1;       min-height: 0;       padding: 8px 12px;       display: flex;       flex-direction: column;       gap: 8px;       max-width: 1920px;       width: 100%;       margin: 0 auto;       overflow: hidden;     }      /* Stepper + Cassettes Container */     .telemetry-deck {       background-color: var(--surface);       border: 1px solid var(--border-strong);       border-radius: 6px;       padding: 8px 10px;       display: flex;       flex-direction: column;       gap: 8px;       flex-shrink: 0;     }     .corner-stepper { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 2px; }     .corner-step-btn {       background: transparent;       border: 1px solid var(--border);       color: var(--text-secondary);       font-family: var(--font-mono);       font-size: 11px;       padding: 4px 12px;       border-radius: var(--radius-tech);       cursor: pointer;       white-space: nowrap;       transition: var(--trans);     }     .corner-step-btn.active {       background-color: var(--text-display);       color: var(--bg);       border-color: var(--text-display);       font-weight: 700;     }      /* Horizontal Driver Cassettes */     .driver-cassette-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }     .driver-cassette {       background-color: var(--surface-raised);       border: 1px solid var(--border);       border-radius: 4px;       padding: 8px 12px;       display: grid;       grid-template-columns: 120px 1fr;       gap: 12px;       align-items: center;     }     .cassette-hero { display: flex; flex-direction: column; justify-content: center; border-right: 1px solid var(--border); padding-right: 8px; }     .driver-id-row { display: flex; align-items: baseline; justify-content: space-between; }     .driver-code { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--text-display); }     .driver-style-badge { font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; border: 1px solid var(--border-strong); padding: 1px 4px; border-radius: var(--radius-pill); }     .apex-speed-val { font-family: var(--font-display); font-size: 30px; font-weight: 800; line-height: 1; color: var(--text-display); margin-top: 2px; }     .apex-speed-meta { font-family: var(--font-mono); font-size: 9px; color: var(--text-disabled); margin-top: 2px; }      .cassette-stats { display: flex; flex-direction: column; gap: 4px; }     .brake-indicator-row { display: flex; align-items: center; justify-content: space-between; font-family: var(--font-mono); font-size: 10px; }     .seg-led-bar { display: flex; gap: 2px; height: 6px; width: 100%; margin-top: 2px; }     .led-block { flex: 1; background-color: var(--border); border-radius: 1px; }     .led-block.on { background-color: var(--text-display); }     .stats-micro-row { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); margin-top: 2px; }     .stats-micro-val { color: var(--text-display); font-weight: 700; }      /* Full-Width Analyzer Deck */     .analyzer-deck {       background-color: var(--surface);       border: 1px solid var(--border-strong);       border-radius: 6px;       flex: 1;       min-height: 0;       display: flex;       flex-direction: column;       overflow: hidden;     }     .analyzer-header {       display: flex;       align-items: center;       justify-content: space-between;       border-bottom: 1px solid var(--border);       padding: 6px 12px;       flex-shrink: 0;     }     .analyzer-tabs { display: flex; gap: 4px; }     .tab-btn {       background: transparent;       border: 1px solid transparent;       color: var(--text-secondary);       font-family: var(--font-mono);       font-size: 10px;       letter-spacing: 0.06em;       text-transform: uppercase;       padding: 4px 10px;       border-radius: var(--radius-pill);       cursor: pointer;       transition: var(--trans);     }     .tab-btn.active {       background-color: var(--surface-raised);       border-color: var(--border-strong);       color: var(--text-display);       font-weight: 700;     }     .table-container { flex: 1; min-height: 0; overflow-y: auto; }     .f1-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 11px; }     .f1-table th {       position: sticky; top: 0; background: var(--surface);       border-bottom: 1px solid var(--border-strong);       color: var(--text-secondary); font-size: 10px; text-transform: uppercase; text-align: left; padding: 6px 10px; z-index: 1;     }     .f1-table td { padding: 6px 10px; border-bottom: 1px solid var(--border); }     .f1-table tr:hover { background-color: var(--surface-raised); }     .f1-table th.num, .f1-table td.num { text-align: right; }      /* Pinned Bottom Transponder Bar (44px) */     .transponder-bar {       height: 44px;       background-color: var(--surface);       border-top: 1px solid var(--border-strong);       display: flex;       align-items: center;       justify-content: space-between;       padding: 0 12px;       flex-shrink: 0;       z-index: 10;     }     .transponder-ticker {       display: flex;       align-items: center;       gap: 10px;       flex: 1;       min-width: 0;       cursor: pointer;     }     .ticker-badge {       font-family: var(--font-mono);       font-size: 10px;       letter-spacing: 0.08em;       text-transform: uppercase;       color: var(--success);       border: 1px solid var(--success);       padding: 2px 6px;       border-radius: var(--radius-tech);       white-space: nowrap;     }     .ticker-text {       font-size: 12px;       white-space: nowrap;       overflow: hidden;       text-overflow: ellipsis;       color: var(--text-primary);     }     .ticker-expand-icon { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }      .transponder-quick-input { display: flex; gap: 6px; align-items: center; }     .quick-input {       width: 240px;       background: var(--surface-raised);       border: 1px solid var(--border-strong);       color: var(--text-display);       font-family: var(--font-mono);       font-size: 11px;       padding: 5px 12px;       border-radius: var(--radius-pill);       outline: none;     }     .quick-input:focus { border-color: var(--text-display); }      /* Slide-Up Comms Drawer */     .comms-drawer {       position: fixed;       bottom: 44px;       left: 0;       right: 0;       height: 65vh;       background-color: var(--surface);       border-top: 1px solid var(--border-strong);       display: flex;       flex-direction: column;       box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);       transform: translateY(100%);       transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);       z-index: 9;     }     .comms-drawer.open { transform: translateY(0); }     .drawer-header {       display: flex;       align-items: center;       justify-content: space-between;       padding: 8px 14px;       border-bottom: 1px solid var(--border);       font-family: var(--font-mono);       font-size: 11px;     }     .drawer-stream { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }     .msg-bubble { padding: 8px 12px; border-radius: 6px; font-size: 12px; max-width: 80%; line-height: 1.45; }     .msg-bubble.user { align-self: flex-end; background: var(--surface-raised); border: 1px solid var(--border); font-family: var(--font-mono); }     .msg-bubble.engineer { align-self: flex-start; background: var(--surface); border: 1px solid var(--border-strong); }     .chip-anchor {       background: var(--accent-subtle);       border: 1px solid var(--accent);       color: var(--accent);       font-family: var(--font-mono);       font-size: 10px;       padding: 1px 4px;       border-radius: 2px;       cursor: pointer;     }      /* Widescreen Docking (Dual-Pane Auto-Switch) */     @media (min-width: 1500px) and (min-aspect-ratio: 16/10) {       .workspace {         display: grid;         grid-template-columns: 1.25fr 0.75fr;       }       .transponder-bar { display: none; }       .comms-drawer {         position: static;         height: auto;         transform: none;         border-top: none;         border-left: 1px solid var(--border-strong);         box-shadow: none;       }     }   </style> </head> <body>    <!-- Pinned Compact Header -->   <header class="app-header">     <div class="brand-cluster">       <span class="pulse-dot"></span>       <span>F1 AI RACE ENGINEER // PIT WALL</span>     </div>      <div class="header-ctrls">       <select id="session-select" class="ctrl-pill">         <option value="2026_01_R">2026_01_R (Melbourne GP)</option>         <option value="2026_01_FP2">2026_01_FP2 (Race Sim)</option>       </select>       <select id="team-select" class="ctrl-pill">         <option value="McLaren">McLaren [PIA / NOR]</option>         <option value="Ferrari">Ferrari [LEC / HAM]</option>       </select>       <select id="run-select" class="ctrl-pill">         <option value="long_run">LONG RUN (RACE SIM)</option>         <option value="push">PUSH (QUALIFYING)</option>       </select>       <button id="theme-btn" class="btn-pill">[ DARK ]</button>     </div>   </header>    <!-- Main Console -->   <main class="workspace">     <!-- Left/Primary Workspace Column -->     <div style="display:flex; flex-direction:column; gap:8px; height:100%; min-height:0;">              <!-- Stepper & Driver Cassettes -->       <section class="telemetry-deck">         <div class="corner-stepper" id="corner-stepper"></div>          <div class="driver-cassette-grid">           <!-- Driver A -->           <div class="driver-cassette">             <div class="cassette-hero">               <div class="driver-id-row">                 <span class="driver-code" id="d1-code">PIA</span>                 <span class="driver-style-badge">V-STYLE</span>               </div>               <div class="apex-speed-val" id="d1-apex">165</div>               <div class="apex-speed-meta">KM/H · IQR ±2.4</div>             </div>             <div class="cassette-stats">               <div class="brake-indicator-row">                 <span>BRAKE ONSET</span>                 <span style="font-weight:700;" id="d1-brake">78.9 M BEFORE</span>               </div>               <div class="seg-led-bar">                 <div class="led-block on"></div><div class="led-block on"></div><div class="led-block on"></div>                 <div class="led-block on"></div><div class="led-block on"></div><div class="led-block on"></div>                 <div class="led-block"></div><div class="led-block"></div><div class="led-block"></div><div class="led-block"></div>               </div>               <div class="stats-micro-row">                 <span>FULL THROTTLE: <span class="stats-micro-val" id="d1-thr">72.4 M</span></span>                 <span>DECEL: <span class="stats-micro-val">4.62 G</span></span>                 <span>DWELL: <span class="stats-micro-val">0.18</span></span>               </div>             </div>           </div>            <!-- Driver B -->           <div class="driver-cassette">             <div class="cassette-hero">               <div class="driver-id-row">                 <span class="driver-code" id="d2-code">NOR</span>                 <span class="driver-style-badge">V-STYLE</span>               </div>               <div class="apex-speed-val" id="d2-apex">161</div>               <div class="apex-speed-meta">KM/H · IQR ±3.1</div>             </div>             <div class="cassette-stats">               <div class="brake-indicator-row">                 <span>BRAKE ONSET</span>                 <span style="font-weight:700;" id="d2-brake">94.4 M BEFORE</span>               </div>               <div class="seg-led-bar">                 <div class="led-block on"></div><div class="led-block on"></div><div class="led-block on"></div>                 <div class="led-block on"></div><div class="led-block on"></div><div class="led-block on"></div>                 <div class="led-block on"></div><div class="led-block on"></div><div class="led-block"></div><div class="led-block"></div>               </div>               <div class="stats-micro-row">                 <span>FULL THROTTLE: <span class="stats-micro-val" id="d2-thr">76.8 M</span></span>                 <span>DECEL: <span class="stats-micro-val">4.48 G</span></span>                 <span>DWELL: <span class="stats-micro-val">0.24</span></span>               </div>             </div>           </div>         </div>       </section>        <!-- Full-Width Strategy & Telemetry Analyzer -->       <section class="analyzer-deck">         <div class="analyzer-header">           <div class="analyzer-tabs">             <button class="tab-btn active" data-tab="segments">SEGMENTS</button>             <button class="tab-btn" data-tab="tyre">TYRE DEG</button>             <button class="tab-btn" data-tab="energy">2026 ENERGY</button>             <button class="tab-btn" data-tab="debrief">EXECUTIVE DEBRIEF</button>           </div>           <div style="font-family:var(--font-mono); font-size:10px; color:var(--text-disabled);" id="analyzer-meta">             SAMPLE: 52 TIMED LAPS           </div>         </div>          <div class="table-container" id="analyzer-table-wrap">           <!-- Dynamically populated tables -->         </div>       </section>     </div>      <!-- Slide-Up Comms Drawer (or Right Column on Widescreen) -->     <aside class="comms-drawer" id="comms-drawer">       <div class
