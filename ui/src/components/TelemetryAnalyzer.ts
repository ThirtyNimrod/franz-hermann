import type { EnergySignature, SegmentDelta, TyreStint } from "../types";

export type TelemetryTab = "segments" | "tyre" | "energy" | "replay";

export interface ReplayState {
  currentLap: number;
  totalLaps: number;
  isPlaying: boolean;
  playbackSpeed: number; // 1, 2, 5
}

export interface TelemetryAnalyzerCallbacks {
  onTabChange: (tab: TelemetryTab) => void;
  onToggleSignificantOnly: (onlySignificant: boolean) => void;
  onCompoundSelect: (compound: string) => void;
  onReplayLapChange: (lap: number) => void;
  onReplayPlayToggle: () => void;
}

export function renderTelemetryAnalyzer(
  container: HTMLElement,
  activeTab: TelemetryTab,
  segmentDeltas: SegmentDelta[],
  onlySignificant: boolean,
  tyreStints: TyreStint[],
  selectedCompound: string,
  energySignatures: EnergySignature[],
  replayState: ReplayState,
  callbacks: TelemetryAnalyzerCallbacks
): void {
  const driverA = segmentDeltas[0]?.driver_a || "DRIVER A";
  const driverB = segmentDeltas[0]?.driver_b || "DRIVER B";

  container.innerHTML = `
    <div class="card" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
      <!-- Header with Nothing Segmented Control -->
      <div class="card-header">
        <div class="card-title">
          <span>[ TELEMETRY & STRATEGY ANALYZER ]</span>
        </div>
        
        <div class="segmented-nav-tabs">
          <button class="nav-tab-btn ${activeTab === "segments" ? "active" : ""}" data-tab="segments">
            SEGMENTS (${segmentDeltas.length})
          </button>
          <button class="nav-tab-btn ${activeTab === "tyre" ? "active" : ""}" data-tab="tyre">
            TYRE DEG (${tyreStints.length})
          </button>
          <button class="nav-tab-btn ${activeTab === "energy" ? "active" : ""}" data-tab="energy">
            2026 ENERGY (${energySignatures.length})
          </button>
          <button class="nav-tab-btn ${activeTab === "replay" ? "active" : ""}" data-tab="replay" style="color: ${activeTab === "replay" ? "var(--black)" : "var(--accent)"}; font-weight: 700;">
            ● RACE REPLAY
          </button>
        </div>
      </div>

      <!-- Tab Content Area -->
      <div class="table-scroll-container">
        ${renderTabContent(
          activeTab,
          segmentDeltas,
          onlySignificant,
          driverA,
          driverB,
          tyreStints,
          selectedCompound,
          energySignatures,
          replayState
        )}
      </div>
    </div>
  `;

  // Attach tab switcher
  container.querySelectorAll(".nav-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab") as TelemetryTab;
      if (tab) callbacks.onTabChange(tab);
    });
  });

  // Attach tab-specific events
  const sigToggle = container.querySelector("#toggle-sig-btn");
  sigToggle?.addEventListener("click", () => {
    callbacks.onToggleSignificantOnly(!onlySignificant);
  });

  container.querySelectorAll("[data-compound]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const comp = btn.getAttribute("data-compound");
      if (comp) callbacks.onCompoundSelect(comp);
    });
  });

  // Replay scrubber & play button
  const scrubber = container.querySelector("#replay-scrubber") as HTMLInputElement;
  scrubber?.addEventListener("input", (e) => {
    const lap = parseInt((e.target as HTMLInputElement).value, 10);
    callbacks.onReplayLapChange(lap);
  });

  const playBtn = container.querySelector("#replay-play-btn");
  playBtn?.addEventListener("click", () => {
    callbacks.onReplayPlayToggle();
  });
}

function renderTabContent(
  tab: TelemetryTab,
  deltas: SegmentDelta[],
  onlySig: boolean,
  driverA: string,
  driverB: string,
  tyres: TyreStint[],
  selectedCompound: string,
  energy: EnergySignature[],
  replay: ReplayState
): string {
  if (tab === "segments") {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 10px;">
        <span style="color: var(--text-secondary); text-transform: uppercase;">
          TEAMMATE DELTA: ${driverA} vs ${driverB}
        </span>
        <button id="toggle-sig-btn" class="corner-btn ${onlySig ? "active" : ""}" style="font-size: 10px; padding: 2px 8px;">
          ${onlySig ? "[ SIGNIFICANT ONLY ]" : "[ ALL SEGMENTS ]"}
        </button>
      </div>

      ${
        deltas.length === 0
          ? `<div style="padding: 32px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
              [ NO SEGMENT DELTAS RECORDED ]
            </div>`
          : `
        <table class="data-table">
          <thead>
            <tr>
              <th>SEGMENT</th>
              <th class="num">DELTA (${driverA} - ${driverB})</th>
              <th class="num">90% CONFIDENCE INTERVAL</th>
              <th class="num">STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${deltas
              .map((d) => {
                const isSig = d.significant;
                const deltaStr = (d.delta_s > 0 ? "+" : "") + d.delta_s.toFixed(3) + " S";
                const ciStr = `[${d.ci_low_s > 0 ? "+" : ""}${d.ci_low_s.toFixed(3)}s, ${
                  d.ci_high_s > 0 ? "+" : ""
                }${d.ci_high_s.toFixed(3)}s]`;

                return `
                <tr class="${isSig ? "active-row" : ""}">
                  <td style="font-weight: 700; color: var(--text-display);">${d.segment}</td>
                  <td class="num" style="font-weight: 700; color: ${
                    isSig ? (d.delta_s > 0 ? "var(--accent)" : "var(--success)") : "var(--text-primary)"
                  };">
                    ${deltaStr}
                  </td>
                  <td class="num" style="color: var(--text-secondary);">${ciStr}</td>
                  <td class="num">
                    <span class="delta-badge ${isSig ? "significant" : "neutral"}">
                      ${isSig ? "[SIGNIFICANT]" : "[SPREAD/NOISE]"}
                    </span>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      `
      }
    `;
  }

  if (tab === "tyre") {
    const compounds = ["ALL", "SOFT", "MEDIUM", "HARD"];
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 10px;">
        <span style="color: var(--text-secondary); text-transform: uppercase;">
          THEIL-SEN FUEL-CORRECTED DEGRADATION
        </span>
        <div style="display: flex; gap: 3px;">
          ${compounds
            .map(
              (c) => `
              <button class="corner-btn ${c === selectedCompound ? "active" : ""}" data-compound="${c}" style="font-size: 10px; padding: 2px 6px;">
                ${c}
              </button>
            `
            )
            .join("")}
        </div>
      </div>

      ${
        tyres.length === 0
          ? `<div style="padding: 32px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
              [ NO LONG RUN TYRE STINTS RECORDED ]
            </div>`
          : `
        <table class="data-table">
          <thead>
            <tr>
              <th>DRIVER</th>
              <th>COMPOUND</th>
              <th class="num">DEG SLOPE (S/LAP)</th>
              <th class="num">BASE PACE</th>
              <th class="num">LAPS</th>
            </tr>
          </thead>
          <tbody>
            ${tyres
              .map((t) => {
                const degStr = (t.deg_s_per_lap >= 0 ? "+" : "") + t.deg_s_per_lap.toFixed(3) + " s/lap";
                return `
                <tr>
                  <td style="font-weight: 700; color: var(--text-display);">${t.driver}</td>
                  <td>
                    <span class="corner-style-badge">${t.compound}</span>
                  </td>
                  <td class="num" style="font-weight: 700; color: ${
                    t.deg_s_per_lap > 0.08 ? "var(--warning)" : "var(--text-display)"
                  };">
                    ${degStr}
                  </td>
                  <td class="num" style="color: var(--text-secondary);">${t.base_pace_s?.toFixed(2)}s</td>
                  <td class="num" style="color: var(--text-disabled);">${t.n_laps_used}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      `
      }
    `;
  }

  if (tab === "energy") {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 10px;">
        <span style="color: var(--text-secondary); text-transform: uppercase;">
          2026 ELECTRICAL ENERGY DERATE & SPEED SHAPE
        </span>
        <span class="brand-badge" style="font-size: 9px; padding: 1px 4px;">
          REG: 2026 POWER UNIT
        </span>
      </div>

      ${
        energy.length === 0
          ? `<div style="padding: 32px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
              [ NO HIGH SPEED STRAIGHT SIGNATURES FOR TEAM ]
            </div>`
          : `
        <table class="data-table">
          <thead>
            <tr>
              <th>STRAIGHT</th>
              <th>DRIVER</th>
              <th class="num">V_PEAK</th>
              <th class="num">LATE LOSS</th>
              <th class="num">BATTERY CLIPPING</th>
            </tr>
          </thead>
          <tbody>
            ${energy
              .map((e) => {
                const isClipping = e.clipping_flag;
                return `
                <tr class="${isClipping ? "active-row" : ""}">
                  <td style="font-weight: 700; color: var(--text-display);">${e.straight}</td>
                  <td>${e.driver}</td>
                  <td class="num" style="font-weight: 700;">${Math.round(e.v_peak_kmh)} KM/H</td>
                  <td class="num" style="color: ${isClipping ? "var(--accent)" : "var(--text-secondary)"};">
                    -${Math.round(e.late_loss_kmh)} KM/H
                  </td>
                  <td class="num">
                    <span class="clipping-signal ${isClipping ? "active" : ""}">
                      <span class="signal-dot"></span>
                      <span>${isClipping ? "[CLIPPING ALERT]" : "[NORMAL DEPLOY]"}</span>
                    </span>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      `
      }
    `;
  }

  // RACE REPLAY TAB
  const driversReplay = [
    { pos: 1, drv: "PIA", team: "McLaren", gap: "LEADER", lapTime: "1:20.412", compound: "M", tyreAge: replay.currentLap % 19, pits: Math.floor(replay.currentLap / 19) },
    { pos: 2, drv: "NOR", team: "McLaren", gap: `+${(1.4 + replay.currentLap * 0.04).toFixed(3)}s`, lapTime: "1:20.584", compound: "M", tyreAge: replay.currentLap % 19, pits: Math.floor(replay.currentLap / 19) },
    { pos: 3, drv: "LEC", team: "Ferrari", gap: `+${(3.8 + replay.currentLap * 0.08).toFixed(3)}s`, lapTime: "1:20.890", compound: "H", tyreAge: replay.currentLap % 24, pits: Math.floor(replay.currentLap / 24) },
    { pos: 4, drv: "HAM", team: "Ferrari", gap: `+${(5.2 + replay.currentLap * 0.11).toFixed(3)}s`, lapTime: "1:20.940", compound: "H", tyreAge: replay.currentLap % 24, pits: Math.floor(replay.currentLap / 24) },
    { pos: 5, drv: "RUS", team: "Mercedes", gap: `+${(8.9 + replay.currentLap * 0.16).toFixed(3)}s`, lapTime: "1:21.210", compound: "H", tyreAge: replay.currentLap % 22, pits: Math.floor(replay.currentLap / 22) },
    { pos: 6, drv: "ANT", team: "Mercedes", gap: `+${(11.4 + replay.currentLap * 0.18).toFixed(3)}s`, lapTime: "1:21.350", compound: "H", tyreAge: replay.currentLap % 22, pits: Math.floor(replay.currentLap / 22) },
    { pos: 7, drv: "VER", team: "Red Bull", gap: `+${(14.2 + replay.currentLap * 0.22).toFixed(3)}s`, lapTime: "1:21.512", compound: "M", tyreAge: replay.currentLap % 18, pits: Math.floor(replay.currentLap / 18) },
    { pos: 8, drv: "ALB", team: "Williams", gap: `+${(18.5 + replay.currentLap * 0.28).toFixed(3)}s`, lapTime: "1:21.904", compound: "M", tyreAge: replay.currentLap % 18, pits: Math.floor(replay.currentLap / 18) },
    { pos: 9, drv: "BOT", team: "Cadillac", gap: `+${(24.1 + replay.currentLap * 0.35).toFixed(3)}s`, lapTime: "1:22.340", compound: "M", tyreAge: replay.currentLap % 17, pits: Math.floor(replay.currentLap / 17) },
    { pos: 10, drv: "HUL", team: "Audi", gap: `+${(29.6 + replay.currentLap * 0.41).toFixed(3)}s`, lapTime: "1:22.810", compound: "H", tyreAge: replay.currentLap % 21, pits: Math.floor(replay.currentLap / 21) },
  ];

  return `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <!-- Replay Controls & Scrubber -->
      <div style="background-color: var(--surface-raised); border: 1px solid var(--border-visible); border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="replay-play-btn" class="btn-send" style="padding: 4px 12px; font-size: 10px;">
            ${replay.isPlaying ? "[ ❚❚ PAUSE ]" : "[ ▶ PLAY ]"}
          </button>
          <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--text-display);">
            LAP: ${replay.currentLap} / ${replay.totalLaps}
          </span>
        </div>

        <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
          <input
            type="range"
            id="replay-scrubber"
            min="1"
            max="${replay.totalLaps}"
            value="${replay.currentLap}"
            style="width: 100%; accent-color: var(--accent); cursor: pointer;"
          />
        </div>

        <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary);">
          SPEED: ${replay.playbackSpeed}x
        </div>
      </div>

      <!-- Live Race Leaderboard -->
      <table class="data-table">
        <thead>
          <tr>
            <th>POS</th>
            <th>DRIVER</th>
            <th>TEAM</th>
            <th class="num">GAP TO LEADER</th>
            <th class="num">LAST LAP</th>
            <th class="num">TYRE (AGE)</th>
            <th class="num">PITS</th>
          </tr>
        </thead>
        <tbody>
          ${driversReplay
            .map(
              (r) => `
            <tr>
              <td style="font-weight: 700; color: var(--text-display);">P${r.pos}</td>
              <td style="font-weight: 700;">${r.drv}</td>
              <td style="color: var(--text-secondary);">${r.team}</td>
              <td class="num" style="font-weight: 700; color: ${r.pos === 1 ? "var(--success)" : "var(--text-display)"};">
                ${r.gap}
              </td>
              <td class="num" style="color: var(--text-secondary);">${r.lapTime}</td>
              <td class="num">
                <span class="corner-style-badge" style="font-size: 9px; padding: 1px 4px;">${r.compound}</span>
                <span style="color: var(--text-disabled); font-size: 10px;">(${r.tyreAge}L)</span>
              </td>
              <td class="num" style="color: var(--text-disabled);">${r.pits}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
