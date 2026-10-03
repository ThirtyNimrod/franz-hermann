# Formula 1 AI Race Engineer — UI/UX Design Blueprint & Gemini Planning Guide

This document is an in-depth design specification, architectural blueprint, and Gemini Web co-planning guide for the **Formula 1 AI Race Engineer Pit Wall Console**. It details design tokens, layout hierarchy, component specifications, data contracts, and actionable prompts to feed directly into Gemini Web for future iterations.

---

## 1. Design Philosophy: Nothing OS × Pit Wall Telemetry

The interface merges the **Nothing Design System** (Swiss typography, Teenage Engineering hardware minimalism, monochrome canvas, type-driven hierarchy) with professional Formula 1 race engineering command consoles:

- **100vh Viewport-Fitted Canvas**: On desktop displays ($\ge 1200\text{px}$), the entire pit wall dashboard is bounded to `height: calc(100vh - 52px); overflow: hidden;`. There are zero whole-page vertical scrollbars. Every instrument, table, and the AI prompt input bar are visible simultaneously.
- **Three-Layer Rule**:
  1. *Primary (Hero)*: The single focal metric per component (e.g. Apex Minimum Speed in `Doto` variable dot-matrix at $32\text{px}$+).
  2. *Secondary (Supporting)*: Monospace telemetry bars, data tables, and structured debrief cards.
  3. *Tertiary (Metadata)*: ALL CAPS labels in `Space Mono` at $10\text{px}$ with `0.08em` letter-spacing.
- **Monochrome with Single Signal Red (`#D71921`)**: Color is strictly an event, never a decorative default. Signal Red is reserved for battery clipping alerts, statistically significant time losses, and live transmission states.
- **First-Class Dual Modes**:
  - *Light Mode (Default)*: Technical printed race manual on warm off-white (`#F5F5F5` canvas, `#FFFFFF` elevated cards, `#000000` display numerals).
  - *Dark Mode (Toggleable)*: OLED dark pit wall (`#000000` OLED black, `#111111` surfaces, glowing white data).

---

## 2. Desktop Workspace Architecture (100vh Dual-Deck)

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ APP HEADER (52px): ● F1 AI RACE ENGINEER [V2.0] | TRACK UTC: 14:32:05 | SESSION | CONSTRUCTOR | RUN | [LIGHT/DARK] │
├───────────────────────────────────────────────────┬────────────────────────────────────────────────────┤
│ LEFT DECK: TELEMETRY & STRATEGY (1.15fr)          │ RIGHT DECK: DEBRIEF & AI INTERCOM (0.85fr)         │
│                                                   │                                                    │
│ ┌───────────────────────────────────────────────┐ │ ┌────────────────────────────────────────────────┐ │
│ │ CORNER TELEMETRY INSTRUMENT (~360px)          │ │ │ POST-SESSION ENGINEER DEBRIEF (~250px)         │ │
│ │ Stepper: T1  T2  T3 ... T14 (Sorted & Unique) │ │ │ Team Strategic Summary                         │ │
│ │ ┌─────────────────────┐ ┌───────────────────┐ │ │ │ Driver Gains / Losses / Hypotheses             │ │
│ │ │ Driver A (NOR)      │ │ Driver B (PIA)    │ │ │ │ [GROUNDED: VERIFIED] Status Badge              │ │
│ │ │ Apex: 161 KM/H      │ │ Apex: 165 KM/H    │ │ │ └────────────────────────────────────────────────┘ │
│ │ │ Braking: 94.4m [■■] │ │ Braking: 78.9m[■] │ │ │                                                    │
│ │ │ Throttle / Decel G  │ │ Throttle / Decel G│ │ │ ┌────────────────────────────────────────────────┐ │
│ │ └─────────────────────┘ └───────────────────┘ │ │ │ AI RACE ENGINEER INTERCOM (Flex-1)             │ │
│ └───────────────────────────────────────────────┘ │ │ │ Message History Stream (Auto-Scroll)           │ │
│                                                   │ │ │   [PIT WALL]: Compare T1 apex speeds           │ │
│ ┌───────────────────────────────────────────────┐ │ │ │   [ENGINEER]: Grounded analysis...             │ │
│ │ TELEMETRY & STRATEGY ANALYZER (Flex-1)        │ │ │                                                │ │
│ │ Tabs: [SEGMENTS] [TYRE DEG] [ENERGY] [REPLAY] │ │ │ Dynamic Contextual Suggestion Chips:           │ │
│ │ ┌───────────────────────────────────────────┐ │ │ │   [Leclerc vs Hamilton] [Ferrari T3 Setup]     │ │
│ │ │ Active Tab Content (Internal Scrollable)  │ │ │ │ Pinned Input Bar: [ Transmit... ] [ SEND ]     │ │
│ │ └───────────────────────────────────────────┘ │ │ └────────────────────────────────────────────────┘ │
│ └───────────────────────────────────────────────┘ │                                                    │
└───────────────────────────────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 3. Component Deep Dive

### 3.1 Corner Telemetry Instrument (`CornerDeck.ts`)
- **Natural Numerical Track Ordering**: Track corners are sorted naturally (`T1, T2, ..., T14`) rather than lexically (`T1, T10, T11...`), with duplicate suppression.
- **Apex Minimum Speed**: Rendered in `Doto` variable dot-matrix at $32\text{px}$ accompanied by its Interquartile Range (IQR) spread (`±3.0 KM/H`).
- **Segmented Braking Bar**: Discrete 10-block mechanical indicator with $2\text{px}$ gaps representing distance before the corner marker ($m$).
- **Corner Driving Style**: Automated classification badge into `U-STYLE` (high apex roll speed) vs `V-STYLE` (hard braking and square rotation).

### 3.2 Telemetry & Strategy Analyzer (`TelemetryAnalyzer.ts`)
Houses 4 switchable operational panels via Nothing-style segmented pill controls:
1. **`SEGMENTS`**: Ranked waterfall list of inter-corner teammate deltas ($\Delta t = \bar{T}_A - \bar{T}_B$) with non-parametric $90\%$ bootstrap confidence intervals.
2. **`TYRE DEG`**: Compound-filtered Theil-Sen robust linear regression matrix showing degradation rate ($\text{s/lap}$), baseline pace, and stint lap counts.
3. **`2026 ENERGY`**: Straight-line speed profile on full-throttle straights ($>400\text{m}$), tracking peak speed ($V_{\text{peak}}$), speed before braking ($V_{\text{end}}$), and `#D71921` Signal Red battery derate clipping flags.
4. **`RACE REPLAY`**: Interactive lap scrubber ($1$ to $58$), playback toggle (`PLAY` / `PAUSE`), speed multiplier ($1\times, 2\times, 5\times$), and real-time evolving race leaderboard with intervals, tyre age, and pit counters.

### 3.3 Dynamic Team-Aware AI Intercom (`EngineerIntercom.ts`)
Quick suggestion chips update dynamically based on the constructor team currently selected:
- **Ferrari**: Prompts compare Leclerc vs Hamilton, T3 setup balance, and Hard tyre degradation.
- **McLaren**: Prompts compare Piastri vs Norris braking points and sector 1 deltas.
- **Mercedes**: Prompts analyze Russell vs Antonelli debut telemetry and straight-line speed derates.
- **Williams / Audi / Cadillac**: Prompts highlight straight-line clipping, debut stints, and teammate deltas.

---

## 4. Prompting Gemini Web for UI/UX Iteration

You can upload the standalone [**`docs/demo.html`**](file:///d:/coding/f1/franz-hermann/docs/demo.html) directly to **Gemini Web** (or paste screenshots of the console) along with the prompts below to iterate on new race engineering features:

### Prompt 1: Designing an Interactive Track Map with Speed Heatmap
```markdown
I have attached the standalone HTML prototype of our Formula 1 AI Race Engineer console (built using the Nothing Design System: Swiss typography, Space Grotesk, Space Mono, Doto font, monochrome palette with #D71921 signal red).

I want to add a vector SVG Circuit Map of Albert Park Melbourne in the Left Deck.
Requirements:
1. Render the track outline with clickable corner pins (T1 through T14) that sync with our Corner Telemetry Instrument.
2. Color-code the track segments based on speed delta between teammates (green = driver A faster, red = driver B faster, white = neutral within 90% confidence interval).
3. Ensure it conforms to Nothing Design System rules: 1px monoline stroke, flat surfaces, zero drop-shadows, and support for both Light Mode (#F5F5F5) and OLED Dark Mode (#000000).

Please generate the updated HTML and CSS component code for this widget.
```

### Prompt 2: Adding Multi-Lap Telemetry Trace Overlays
```markdown
I have attached our Nothing Design System pit wall telemetry UI (demo.html).

I want to add an overlay telemetry graph component comparing Speed, Throttle %, and Brake pressure between our two drivers across a selected corner:
1. X-axis: Distance from -150m (braking zone) through apex (0m) to +150m (exit).
2. Y-axis: Speed (km/h) and Throttle/Brake (0-100%).
3. Styling: Monoline stroke (1.5px), solid white for Driver A, dashed #999999 for Driver B, subtle dot-matrix background grid, Space Mono axis labels, no gradients or drop shadows.

Please write the JavaScript Canvas or inline SVG implementation that fits inside our 100vh desktop console layout.
```

### Prompt 3: Pit Stop Strategy & Undercut Predictor
```markdown
Using the attached demo.html as the base design system, plan an "Undercut & Pit Strategy Calculator" widget for our Race Replay deck:
1. Inputs: Target pit lap, pit lane transit time (21.5s), tyre compound delta (Soft vs Medium vs Hard).
2. Outputs: Track re-entry traffic window, estimated net time delta, undercut success probability (%).
3. Format: High-density Nothing Design System stat rows and segmented progress bars matching our existing CSS tokens.
```
