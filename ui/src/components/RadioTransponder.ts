import type { ChatMessage } from "../types";
import { getContextualChips } from "./EngineerIntercom";

export interface RadioTransponderCallbacks {
  onSendMessage: (text: string) => void;
  onChipClick: (text: string) => void;
  onAnchorClick: (corner?: string, segment?: string, tab?: string) => void;
  onDrawerToggle: (isOpen: boolean) => void;
}

/**
 * Tokenizes LLM text into interactive deep-link anchor chips:
 * - Turns T1..T14 into <button class="chip-anchor" data-corner="T1" data-tab="segments">T1 ↗</button>
 * - Turns start-T1, T3-T4 into <button class="chip-anchor" data-segment="..." data-tab="segments">... ↗</button>
 * - Turns clipping/MGU-K into <button class="chip-anchor" data-tab="energy">... ↗</button>
 * - Turns tyre deg/degradation into <button class="chip-anchor" data-tab="tyre">... ↗</button>
 */
export function tokenizeF1Citations(text: string): string {
  if (!text) return "";

  // 1. Match segments like "start-T1", "T3-T4", "T10-T11"
  let result = text.replace(
    /\b(start-T\d+|T\d+-T\d+)\b/g,
    `<button class="chip-anchor" data-segment="$1" data-tab="segments" title="Jump to $1 delta">$1 ↗</button>`
  );

  // 2. Match corners T1..T14
  result = result.replace(
    /\b(T[1-9]|T1[0-4])\b(?![-\w])/g,
    `<button class="chip-anchor" data-corner="$1" data-tab="segments" title="Inspect $1 telemetry">$1 ↗</button>`
  );

  // 3. Match 2026 energy clipping keywords
  result = result.replace(
    /\b(clipping|MGU-K|350\s*kW|derate)\b/gi,
    `<button class="chip-anchor" data-tab="energy" title="View 2026 Energy Straight-Line Telemetry">$1 ↗</button>`
  );

  // 4. Match tyre degradation keywords
  result = result.replace(
    /\b(tyre deg|tyre degradation|Medium compound|Hard compound)\b/gi,
    `<button class="chip-anchor" data-tab="tyre" title="View Tyre Degradation Model">$1 ↗</button>`
  );

  return result;
}

export function renderRadioTransponder(
  container: HTMLElement,
  messages: ChatMessage[],
  isTransmitting: boolean,
  isDrawerOpen: boolean,
  currentTeam: string,
  drivers: string[],
  selectedCorner: string,
  callbacks: RadioTransponderCallbacks
): void {
  // Derive latest assistant message for rolling ticker
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const tickerText = isTransmitting
    ? "ANALYZING DETERMINISTIC TELEMETRY & LOCAL LLM SYNTHESIS..."
    : lastAssistantMsg
    ? lastAssistantMsg.content.slice(0, 140) + (lastAssistantMsg.content.length > 140 ? "..." : "")
    : `STANDBY // MELBOURNE GP // ACTIVE CONSTRUCTOR: ${currentTeam.toUpperCase()}`;

  const chips = getContextualChips(currentTeam, drivers, selectedCorner);

  container.innerHTML = `
    <!-- 1. Pinned Bottom Radio Transponder Bar (44px) -->
    <div class="transponder-bar" id="transponder-bar">
      <div class="transponder-ticker" id="transponder-ticker" title="Click to expand full Comms Sheet">
        <span class="ticker-badge">
          <span class="ticker-pulse"></span>
          <span>${isTransmitting ? "TX LIVE" : "RADIO ACTIVE"}</span>
        </span>
        <span class="ticker-text" id="ticker-text-content">
          ${tickerText}
        </span>
        <button class="ticker-expand-btn" id="drawer-toggle-btn">
          ${isDrawerOpen ? "[ ▼ COLLAPSE ]" : "[ ▲ EXPAND COMMS ]"}
        </button>
      </div>

      <!-- Quick Text Input Pill -->
      <div class="transponder-quick-input">
        <input 
          type="text" 
          id="quick-chat-input" 
          class="quick-input" 
          placeholder="Quick race engineer question..."
          ${isTransmitting ? "disabled" : ""}
        />
        <button 
          id="quick-send-btn" 
          class="quick-btn"
          ${isTransmitting ? "disabled" : ""}
        >
          [ SEND ]
        </button>
      </div>
    </div>

    <!-- 2. Translucent Backdrop Overlay -->
    <div class="comms-backdrop ${isDrawerOpen ? "open" : ""}" id="comms-backdrop"></div>

    <!-- 3. Slide-Up Comms Sheet / Drawer (65vh Overlay) -->
    <aside class="comms-drawer ${isDrawerOpen ? "open" : ""}" id="comms-drawer">
      <div class="drawer-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="ticker-pulse"></span>
          <span style="font-weight: 700; color: var(--text-display);">F1 AI RACE ENGINEER // COMMS CHANNEL</span>
          <span style="color: var(--text-disabled);">(${currentTeam} [${drivers.join(" / ")}])</span>
        </div>
        <button class="ticker-expand-btn" id="drawer-close-btn">
          [ ▼ COLLAPSE ]
        </button>
      </div>

      <!-- Scrollable Message Stream -->
      <div class="drawer-stream" id="drawer-stream">
        ${
          messages.length === 0
            ? `
          <div style="padding: 24px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled); font-size: 11px;">
            [ PIT WALL INTERCOM READY · DIRECT DUCKDB PARQUET GROUNDING ACTIVE ]
          </div>
        `
            : messages
                .map((m) => {
                  const isUser = m.role === "user";
                  return `
                <div class="chat-bubble ${isUser ? "user" : "assistant"}">
                  <div class="bubble-header">
                    <span>${isUser ? "RACE STRATEGIST" : "AI RACE ENGINEER"}</span>
                    <span>${m.timestamp}</span>
                  </div>
                  <div class="bubble-content" style="line-height: 1.45;">
                    ${isUser ? m.content : tokenizeF1Citations(m.content)}
                  </div>
                  ${
                    !isUser
                      ? `
                    <div style="margin-top: 6px; font-family: var(--font-mono); font-size: 9px; color: ${
                      m.grounded ? "var(--success)" : "var(--warning)"
                    }; display: flex; align-items: center; gap: 4px;">
                      <span>${m.grounded ? "● [VERIFIED FACT: DUCKDB]" : "▲ [DETERMINISTIC FALLBACK]"}</span>
                      ${m.model ? `<span style="color: var(--text-disabled);">· ${m.model}</span>` : ""}
                    </div>
                  `
                      : ""
                  }
                </div>
              `;
                })
                .join("")
        }
        ${
          isTransmitting
            ? `
          <div class="chat-bubble assistant" style="border-left: 2px solid var(--accent);">
            <div class="bubble-header">
              <span style="color: var(--accent);">PROCESSING TELEMETRY...</span>
            </div>
            <div class="bubble-content" style="font-family: var(--font-mono); color: var(--text-secondary); font-size: 11px;">
              Cross-referencing DuckDB micro-sectors, 10-block braking thresholds, and 2026 MGU-K state...
            </div>
          </div>
        `
            : ""
        }
      </div>

      <!-- Dynamic Suggestion Chips & Prompt Input -->
      <div class="drawer-footer">
        <!-- Team-Aware Contextual Chips -->
        <div class="quick-chips">
          ${chips
            .map(
              (c) => `
            <button class="chip-btn" data-chip="${c}">${c}</button>
          `
            )
            .join("")}
        </div>

        <!-- Full Input Bar -->
        <div class="input-bar">
          <input
            type="text"
            id="drawer-chat-input"
            class="chat-input"
            placeholder="Ask race engineer about corner speeds, tyre degradation, or 2026 energy clipping..."
            ${isTransmitting ? "disabled" : ""}
          />
          <button
            id="drawer-send-btn"
            class="btn-send"
            ${isTransmitting ? "disabled" : ""}
          >
            [ TRANSMIT ]
          </button>
        </div>
      </div>
    </aside>
  `;

  // Auto-scroll stream to bottom if open
  const streamEl = container.querySelector("#drawer-stream") as HTMLElement;
  if (streamEl) {
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  // Bind Drawer Toggle handlers
  const tickerEl = container.querySelector("#transponder-ticker");
  tickerEl?.addEventListener("click", (e) => {
    // If not clicking quick input
    if ((e.target as HTMLElement).tagName !== "INPUT" && (e.target as HTMLElement).tagName !== "BUTTON") {
      callbacks.onDrawerToggle(!isDrawerOpen);
    }
  });

  const toggleBtn = container.querySelector("#drawer-toggle-btn");
  toggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onDrawerToggle(!isDrawerOpen);
  });

  const closeBtn = container.querySelector("#drawer-close-btn");
  closeBtn?.addEventListener("click", () => {
    callbacks.onDrawerToggle(false);
  });

  const backdropEl = container.querySelector("#comms-backdrop");
  backdropEl?.addEventListener("click", () => {
    callbacks.onDrawerToggle(false);
  });

  // Bind Quick Input handlers
  const quickInput = container.querySelector("#quick-chat-input") as HTMLInputElement;
  const quickBtn = container.querySelector("#quick-send-btn") as HTMLButtonElement;
  const handleQuickSend = () => {
    const val = quickInput?.value.trim();
    if (val) {
      callbacks.onSendMessage(val);
      quickInput.value = "";
    }
  };
  quickBtn?.addEventListener("click", handleQuickSend);
  quickInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleQuickSend();
  });

  // Bind Drawer Input handlers
  const drawerInput = container.querySelector("#drawer-chat-input") as HTMLInputElement;
  const drawerBtn = container.querySelector("#drawer-send-btn") as HTMLButtonElement;
  const handleDrawerSend = () => {
    const val = drawerInput?.value.trim();
    if (val) {
      callbacks.onSendMessage(val);
      drawerInput.value = "";
    }
  };
  drawerBtn?.addEventListener("click", handleDrawerSend);
  drawerInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleDrawerSend();
  });

  // Bind Contextual Chips
  container.querySelectorAll("[data-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chip = btn.getAttribute("data-chip");
      if (chip) callbacks.onChipClick(chip);
    });
  });

  // Bind Deep-Linking Chip Anchors
  container.querySelectorAll(".chip-anchor").forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      e.stopPropagation();
      const el = anchor as HTMLElement;
      const corner = el.getAttribute("data-corner") || undefined;
      const segment = el.getAttribute("data-segment") || undefined;
      const tab = el.getAttribute("data-tab") || undefined;
      callbacks.onAnchorClick(corner, segment, tab);
    });
  });
}
