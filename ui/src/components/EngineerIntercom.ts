import type { ChatMessage } from "../types";

export interface IntercomCallbacks {
  onSendMessage: (text: string) => void;
  onChipClick: (text: string) => void;
}

export function renderEngineerIntercom(
  container: HTMLElement,
  messages: ChatMessage[],
  isTransmitting: boolean,
  callbacks: IntercomCallbacks
): void {
  const chips = [
    "Compare T1 apex speeds between teammates",
    "What is Antonelli's tyre degradation on Hards?",
    "Did Williams experience energy clipping on straights?",
    "Ferrari setup hypotheses for T3",
  ];

  container.innerHTML = `
    <div class="card intercom-container">
      <div class="card-header">
        <div class="card-title">
          <span>[ AI RACE ENGINEER INTERCOM ]</span>
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
          <div style="padding: 48px 16px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
            <div>[ PIT WALL AI RACE ENGINEER STANDBY ]</div>
            <div style="font-size: var(--caption); margin-top: 8px;">
              Ask ad-hoc questions regarding braking points, tyre degradation, or teammate segment deltas.
            </div>
          </div>
        `
            : messages
                .map((m) => {
                  const isUser = m.role === "user";
                  return `
                <div class="message-item ${isUser ? "user" : "assistant"}">
                  <div class="message-meta">
                    <span>${isUser ? "[ PIT WALL ]" : "[ RACE ENGINEER ]"}</span>
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

      <!-- Quick Suggestion Chips -->
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
          placeholder="Transmit technical inquiry to AI Race Engineer..."
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
