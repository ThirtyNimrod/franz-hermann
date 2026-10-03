import type { SessionMetadata, TeamDriverInfo } from "../types";

export interface HeaderCallbacks {
  onSessionChange: (sessionId: string) => void;
  onTeamChange: (team: string) => void;
  onRunTypeChange: (runType: "push" | "long_run") => void;
}

let clockInterval: number | null = null;

export function renderHeader(
  container: HTMLElement,
  sessions: SessionMetadata[],
  currentSessionId: string,
  teams: TeamDriverInfo[],
  currentTeam: string,
  currentRunType: "push" | "long_run",
  callbacks: HeaderCallbacks
): void {
  const utcNow = new Date().toUTCString().slice(17, 25);

  container.innerHTML = `
    <header class="app-header">
      <div class="brand-section">
        <div class="brand-title">
          <span>●</span>
          <span>F1 AI RACE ENGINEER</span>
        </div>
        <span class="brand-badge">V2.0 / PIT WALL</span>
      </div>

      <div class="header-controls">
        <div class="track-clock">
          <span class="track-clock-live"></span>
          <span>TRACK UTC: <strong id="utc-clock">${utcNow}</strong></span>
        </div>

        <div class="select-wrapper">
          <label for="session-select">SESSION:</label>
          <select id="session-select" class="select-input">
            ${sessions
              .map(
                (s) => `
                <option value="${s.session_id}" ${s.session_id === currentSessionId ? "selected" : ""}>
                  ${s.session_id} (${s.event_name})
                </option>
              `
              )
              .join("")}
          </select>
        </div>

        <div class="select-wrapper">
          <label for="team-select">CONSTRUCTOR:</label>
          <select id="team-select" class="select-input">
            ${teams
              .map(
                (t) => `
                <option value="${t.team}" ${t.team === currentTeam ? "selected" : ""}>
                  ${t.team} [${t.drivers.join(" / ")}]
                </option>
              `
              )
              .join("")}
          </select>
        </div>

        <div class="select-wrapper">
          <label for="run-type-select">RUN:</label>
          <select id="run-type-select" class="select-input">
            <option value="push" ${currentRunType === "push" ? "selected" : ""}>PUSH (FASTEST)</option>
            <option value="long_run" ${currentRunType === "long_run" ? "selected" : ""}>LONG RUN (RACE SIM)</option>
          </select>
        </div>
      </div>
    </header>
  `;

  // Start clock timer if not already running
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = window.setInterval(() => {
    const clockEl = document.querySelector("#utc-clock");
    if (clockEl) {
      clockEl.textContent = new Date().toUTCString().slice(17, 25);
    }
  }, 1000);

  // Attach event handlers
  const sessionSelect = container.querySelector("#session-select") as HTMLSelectElement;
  sessionSelect?.addEventListener("change", (e) => {
    callbacks.onSessionChange((e.target as HTMLSelectElement).value);
  });

  const teamSelect = container.querySelector("#team-select") as HTMLSelectElement;
  teamSelect?.addEventListener("change", (e) => {
    callbacks.onTeamChange((e.target as HTMLSelectElement).value);
  });

  const runTypeSelect = container.querySelector("#run-type-select") as HTMLSelectElement;
  runTypeSelect?.addEventListener("change", (e) => {
    callbacks.onRunTypeChange((e.target as HTMLSelectElement).value as "push" | "long_run");
  });
}
