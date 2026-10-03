import type { EnergySignature, SegmentDelta, SessionHighlight, TyreStint } from "../types";

export type TelemetryTab = "segments" | "tyre" | "energy" | "replay" | "debrief";

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
  highlights: SessionHighlight[],
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
          <button class="nav-tab-btn ${activeTab === "debrief" ? "active" : ""}" data-tab="debrief">
            EXECUTIVE DEBRIEF
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
          replayState,
          highlights
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
  replay: ReplayState,
  highlights: SessionHighlight[]
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
              <th class="num">90% BOOTSTRAP CI</th>
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
                <tr id="row-segment-${d.segment}" class="${isSig ? "active-row" : ""}">
                  <td style="font-weight: 700; color: var(--text-display);">${d.segment}</td>
                  <td class="num" style="font-weight: 700; color: ${
                    isSig ? (d.delta_s > 0 ? "var(--accent)" : "var(--success)") : "var(--text-primary)"
                  };">
                    ${deltaStr}
                  </td>
                  <td class="num" style="color: var(--text-secondary); font-family: var(--font-mono); white-space: nowrap;">
                    ${ciStr}
                  </td>
                  <td class="num">
                    <span class="corner-style-badge" style="font-size: 9px; padding: 1px 6px; ${
                      isSig
                        ? "background: var(--text-display); color: var(--black); font-weight: 700;"
                        : "color: var(--text-disabled);"
                    }">
                      ${isSig ? "[ SIGNIFICANT ]" : "[ SPREAD / NOISE ]"}
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
    const compounds = Array.from(new Set(tyres.map((t) => t.compound)));

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 10px;">
        <span style="color: var(--text-secondary); text-transform: uppercase;">
          COMPOUND FILTER:
        </span>
        <div style="display: flex; gap: 4px;">
          <button class="corner-btn ${selectedCompound === "ALL" ? "active" : ""}" data-compound="ALL" style="font-size: 9px; padding: 2px 6px;">ALL</button>
          ${compounds
            .map(
              (c) => `
            <button class="corner-btn ${selectedCompound === c ? "active" : ""}" data-compound="${c}" style="font-size: 9px; padding: 2px 6px;">
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
              [ NO TYRE DEGRADATION RUNS FOR THIS FILTER ]
            </div>`
          : `
        <table class="data-table">
          <thead>
            <tr>
              <th>DRIVER</th>
              <th>COMPOUND</th>
              <th class="num">BASE PACE</th>
              <th class="num">DEG RATE (S/LAP)</th>
              <th class="num">90% CI</th>
              <th class="num">LAPS</th>
              <th class="num">FUEL CORRECTION</th>
            </tr>
          </thead>
          <tbody>
            ${tyres
              .map(
                (t) => `
              <tr id="row-tyre-${t.driver}-${t.compound}">
                <td style="font-weight: 700; color: var(--text-display);">${t.driver}</td>
                <td>
                  <span class="corner-style-badge" style="font-size: 9px; padding: 1px 4px;">${t.compound}</span>
                </td>
                <td class="num" style="color: var(--text-primary); font-weight: 700;">${t.base_pace_s?.toFixed(3)}s</td>
                <td class="num" style="color: var(--accent); font-weight: 700;">+${t.deg_s_per_lap?.toFixed(3)}</td>
                <td class="num" style="color: var(--text-secondary); white-space: nowrap;">
                  [+${t.deg_ci_low?.toFixed(3)}, +${t.deg_ci_high?.toFixed(3)}]
                </td>
                <td class="num">${t.n_laps_used}</td>
                <td class="num" style="color: var(--text-disabled); font-size: 10px;">
                  -${t.fuel_kg_per_lap?.toFixed(2)} kg/L (Δ${t.fuel_s_per_kg?.toFixed(3)}s)
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `
      }
    `;
  }

  if (tab === "energy") {
    return `
      ${
        energy.length === 0
          ? `<div style="padding: 32px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
              [ NO 2026 ENERGY SIGNATURES RECORDED ]
            </div>`
          : `
        <table class="data-table">
          <thead>
            <tr>
              <th>DRIVER</th>
              <th>STRAIGHT</th>
              <th class="num">V_PEAK (KM/H)</th>
              <th class="num">V_END (KM/H)</th>
              <th class="num">LATE SPEED LOSS</th>
              <th class="num">STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${energy
              .map((e) => {
                const isClip = e.clipping_flag;
                return `
                <tr id="row-energy-${e.straight}" class="${isClip ? "active-row" : ""}">
                  <td style="font-weight: 700; color: var(--text-display);">${e.driver}</td>
                  <td style="font-weight: 700;">${e.straight}</td>
                  <td class="num" style="font-weight: 700; color: var(--text-display);">${Math.round(e.v_peak_kmh)}</td>
                  <td class="num" style="color: var(--text-secondary);">${Math.round(e.v_end_kmh)}</td>
                  <td class="num" style="font-weight: 700; color: ${isClip ? "var(--accent)" : "var(--text-disabled)"};">
                    -${e.late_loss_kmh?.toFixed(1)} KM/H
                  </td>
                  <td class="num">
                    <span class="corner-style-badge" style="font-size: 9px; padding: 1px 6px; ${
                      isClip
                        ? "background: var(--accent); color: #FFF; border-color: var(--accent); font-weight: 700;"
                        : "color: var(--text-disabled);"
                    }">
                      ${isClip ? "[ CLIPPING ALERT ]" : "[ NOMINAL ]"}
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

  if (tab === "debrief") {
    const teamHighlights = highlights[0];
    return `
      <div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 6px;">
          <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--text-display);">
            EXECUTIVE PIT WALL SYNTHESIS (${teamHighlights?.team || "CURRENT CONSTRUCTOR"})
          </span>
          <span style="font-family: var(--font-mono); font-size: 10px; color: ${
            teamHighlights?.grounded ? "var(--success)" : "var(--warning)"
          }; font-weight: 700;">
            ${teamHighlights?.grounded ? "[ VERIFIED FACT: DUCKDB ]" : "[ DETERMINISTIC ESTIMATE ]"}
          </span>
        </div>

        ${
          !teamHighlights
            ? `
          <div style="padding: 24px; text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--text-disabled);">
            [ NO DEBRIEF SYNTHESIS AVAILABLE FOR THIS CONSTRUCTOR ]
          </div>
        `
            : `
          <!-- Strategic Summary -->
          <div style="background: var(--surface-raised); border-left: 3px solid var(--text-display); padding: 10px 14px; border-radius: 4px;">
            <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">
              CONSTRUCTOR PACING ASSESSMENT
            </div>
            <div style="font-size: 12px; color: var(--text-primary); margin-top: 4px; line-height: 1.45;">
              ${teamHighlights.team_summary}
            </div>
          </div>

          <!-- Driver Hypotheses Cards -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            ${highlights
              .map(
                (h) => `
              <div style="background-color: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
                  <span style="font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--text-display);">${h.driver}</span>
                  <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                    ${h.headline}
                  </span>
                </div>
                
                <div style="margin-top: 6px; font-family: var(--font-mono); font-size: 10px; display: flex; flex-direction: column; gap: 3px;">
                  <div>
                    <span style="color: var(--text-secondary);">PRIMARY GAIN:</span>
                    <span style="color: var(--success); font-weight: 700;">${h.primary_time_gain || "None recorded"}</span>
                  </div>
                  <div>
                    <span style="color: var(--text-secondary);">PRIMARY LOSS:</span>
                    <span style="color: var(--accent); font-weight: 700;">${h.primary_time_loss || "None recorded"}</span>
                  </div>
                </div>

                ${
                  h.setup_hypotheses
                    ? `
                  <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); font-size: 11px; color: var(--text-secondary); line-height: 1.4;">
                    <span style="font-weight: 700; color: var(--text-display); font-family: var(--font-mono); font-size: 10px;">SETUP HYPOTHESIS:</span>
                    ${h.setup_hypotheses}
                  </div>
                `
                    : ""
                }
              </div>
            `
              )
              .join("")}
          </div>
        `
        }
      </div>
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
            <tr id="row-replay-${r.drv}">
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
