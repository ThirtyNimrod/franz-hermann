import type { EnergySignature, TyreStint } from "../types";

export interface EnergyTyreCallbacks {
  onCompoundSelect: (compound: string) => void;
}

export function renderEnergyTyreDeck(
  container: HTMLElement,
  tyres: TyreStint[],
  selectedCompound: string,
  energy: EnergySignature[],
  callbacks: EnergyTyreCallbacks
): void {
  const compounds = ["ALL", "SOFT", "MEDIUM", "HARD"];

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
      
      <!-- Panel A: Tyre Degradation -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span>[ THEIL-SEN TYRE DEGRADATION ]</span>
          </div>
          <div style="display: flex; gap: 4px;">
            ${compounds
              .map(
                (c) => `
                <button class="corner-btn ${c === selectedCompound ? "active" : ""}" data-compound="${c}">
                  ${c}
                </button>
              `
              )
              .join("")}
          </div>
        </div>

        ${
          tyres.length === 0
            ? `
          <div style="padding: 24px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
            [ NO LONG RUN TYRE STINTS RECORDED ]
          </div>
        `
            : `
          <table class="data-table">
            <thead>
              <tr>
                <th>DRIVER</th>
                <th>TYRE</th>
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
      </div>

      <!-- Panel B: 2026 Straight-Line Energy Deployment -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span>[ 2026 ENERGY DEPLOYMENT & CLIPPING ]</span>
          </div>
          <div class="card-meta">REG: 2026 POWER UNIT</div>
        </div>

        ${
          energy.length === 0
            ? `
          <div style="padding: 24px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
            [ NO HIGH SPEED STRAIGHT SIGNATURES FOR TEAM ]
          </div>
        `
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
      </div>

    </div>
  `;

  // Attach compound button events
  container.querySelectorAll("[data-compound]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = btn.getAttribute("data-compound");
      if (c) callbacks.onCompoundSelect(c);
    });
  });
}
