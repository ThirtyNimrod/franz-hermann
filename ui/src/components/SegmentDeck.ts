import type { SegmentDelta } from "../types";

export interface SegmentDeckCallbacks {
  onToggleSignificantOnly: (onlySignificant: boolean) => void;
}

export function renderSegmentDeck(
  container: HTMLElement,
  deltas: SegmentDelta[],
  onlySignificant: boolean,
  callbacks: SegmentDeckCallbacks
): void {
  const driverA = deltas[0]?.driver_a || "DRIVER A";
  const driverB = deltas[0]?.driver_b || "DRIVER B";

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <span>[ SEGMENT DELTAS WATERFALL ]</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="card-meta">COMPARISON: ${driverA} vs ${driverB}</span>
          <button id="toggle-sig-btn" class="corner-btn ${onlySignificant ? "active" : ""}">
            ${onlySignificant ? "[ SIGNIFICANT ONLY ]" : "[ ALL SEGMENTS ]"}
          </button>
        </div>
      </div>

      ${
        deltas.length === 0
          ? `
        <div style="padding: 24px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
          [ NO MEASURED SEGMENT DELTAS AVAILABLE ]
        </div>
      `
          : `
        <table class="data-table">
          <thead>
            <tr>
              <th>TRACK SEGMENT</th>
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
    </div>
  `;

  const toggleBtn = container.querySelector("#toggle-sig-btn");
  toggleBtn?.addEventListener("click", () => {
    callbacks.onToggleSignificantOnly(!onlySignificant);
  });
}
