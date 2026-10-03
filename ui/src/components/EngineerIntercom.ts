import type { ChatMessage } from "../types";

export interface IntercomCallbacks {
  onSendMessage: (text: string) => void;
  onChipClick: (text: string) => void;
}

export function getContextualChips(team: string, drivers: string[], corner: string): string[] {
  const d1 = drivers[0] || "DRIVER A";
  const d2 = drivers[1] || "DRIVER B";
  const c = corner || "T1";
  const teamLower = team.toLowerCase();

  if (teamLower.includes("ferrari")) {
    return [
      `Compare ${c} apex speeds: Leclerc vs Hamilton`,
      `Analyze Hamilton vs Leclerc opening sector deltas`,
      `Summarize Ferrari setup hypotheses for ${c}`,
      `Ferrari tyre degradation on Medium compound`,
    ];
  }
  if (teamLower.includes("mclaren")) {
    return [
      `Compare ${c} braking: Piastri vs Norris`,
      `Analyze McLaren sector deltas into ${c}`,
      `Compare apex speed dwell ratio for Norris in ${c}`,
      `McLaren Medium vs Hard tyre degradation slope`,
    ];
  }
  if (teamLower.includes("mercedes")) {
    return [
      `Compare Russell and Antonelli into ${c}`,
      `What is Antonelli's tyre degradation on Hards?`,
      `Analyze Mercedes teammate deltas in ${c}`,
      `Mercedes straight-line speed derate signature`,
    ];
  }
  if (teamLower.includes("red bull")) {
    return [
      `Compare Verstappen and Lawson apex speeds in ${c}`,
      `Red Bull long-run tyre degradation pace`,
      `Analyze Verstappen braking distance in ${c}`,
      `Red Bull straight-line energy deployment`,
    ];
  }
  if (teamLower.includes("williams")) {
    return [
      `Did Williams suffer energy clipping on straights?`,
      `Compare Albon vs Sainz in ${c} apex speed`,
      `Williams tyre degradation on Hard compound`,
      `Analyze Albon vs Sainz segment deltas`,
    ];
  }
  if (teamLower.includes("audi")) {
    return [
      `Audi debut telemetry: Hulkenberg vs Bortoleto`,
      `Compare ${c} braking points between Audi drivers`,
      `Audi energy clipping on straights`,
      `Audi baseline stint pace and tyre degradation`,
    ];
  }
  if (teamLower.includes("cadillac")) {
    return [
      `Compare Bottas and Perez apex speeds in ${c}`,
      `Cadillac baseline pace on Medium tyres`,
      `Cadillac straight-line energy clipping flag`,
      `Bottas vs Perez braking onset distance in ${c}`,
    ];
  }

  // Generic constructor fallback with real driver names
  return [
    `Compare ${c} apex speeds: ${d1} vs ${d2}`,
    `Analyze ${team} teammate segment deltas`,
    `What is ${d1}'s tyre degradation slope?`,
    `Did ${team} suffer straight-line energy clipping?`,
  ];
}

export function renderEngineerIntercom(
  container: HTMLElement,
  messages: ChatMessage[],
  isTransmitting: boolean,
  currentTeam: string,
  drivers: string[],
  currentCorner: string,
  callbacks: IntercomCallbacks
): void {
  const chips = getContextualChips(currentTeam, drivers, currentCorner);

  container.innerHTML = `
    <div class="card intercom-container">
      <div class="card-header">
        <div class="card-title">
          <span>[ AI RACE ENGINEER INTERCOM — ${currentTeam.toUpperCase()} ]</span>
        </div>
        <div class="card-meta">
          <span class="status-tag ${isTransmitting ? "loading" : ""}">
            ${isTransmitting ? "[ TRANSMITTING TO PIT WALL... ]" : "[ RADIO CHANNEL OPEN ]"}
          </span>
        </div>
      </div>

      <!-- Messages Stream -->
      <div class="messages-stream" id="intercom-stream">
        ${
          messages.length === 0
            ? `
          <div style="padding: 32px 16px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
            <div>[ PIT WALL AI RACE ENGINEER STANDBY — ${currentTeam.toUpperCase()} ]</div>
            <div style="font-size: 11px; margin-top: 6px; color: var(--text-secondary);">
              Transmitting telemetry inquiries for ${drivers.join(" & ") || "team drivers"}. Select a prompt below or type your technical query.
            </div>
          </div>
        `
            : messages
                .map((m) => {
                  const isUser = m.role === "user";
                  return `
                <div class="message-item ${isUser ? "user" : "assistant"}">
                  <div class="message-meta">
                    <span>${isUser ? `[ PIT WALL / ${currentTeam} ]` : "[ RACE ENGINEER ]"}</span>
                    <span>${m.timestamp}</span>
                    ${
                      !isUser && m.grounded !== undefined
                        ? `<span class="badge-grounded">${m.grounded ? "[GROUNDED]" : "[UNGROUNDED]"}</span>`
                        : ""
                    }
                  </div>
                  <div class="message-text">
                    ${m.content.replace(/\n/g, "<br/>")}
                  </div>
                </div>
              `;
                })
                .join("")
        }
      </div>

      <!-- Quick Suggestion Chips (Context-Aware) -->
      <div class="quick-chips">
        ${chips
          .map(
            (c) => `
            <button class="chip-btn" data-chip="${c}">
              ${c}
            </button>
          `
          )
          .join("")}
      </div>

      <!-- Input Bar -->
      <div class="input-bar">
        <input
          type="text"
          id="chat-input"
          class="chat-input"
          placeholder="Transmit technical inquiry to ${currentTeam} race engineer..."
          ${isTransmitting ? "disabled" : ""}
        />
        <button id="send-btn" class="btn-send" ${isTransmitting ? "disabled" : ""}>
          ${isTransmitting ? "..." : "[ SEND ]"}
        </button>
      </div>
    </div>
  `;

  // Auto-scroll stream to bottom
  const streamEl = container.querySelector("#intercom-stream");
  if (streamEl) {
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  // Attach send button handler
  const inputEl = container.querySelector("#chat-input") as HTMLInputElement;
  const sendBtn = container.querySelector("#send-btn") as HTMLButtonElement;

  const triggerSend = () => {
    const val = inputEl?.value?.trim();
    if (val && !isTransmitting) {
      callbacks.onSendMessage(val);
      inputEl.value = "";
    }
  };

  sendBtn?.addEventListener("click", triggerSend);
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSend();
  });

  // Attach chips
  container.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chipText = btn.getAttribute("data-chip");
      if (chipText && !isTransmitting) {
        callbacks.onChipClick(chipText);
      }
    });
  });
}
