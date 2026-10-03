import type { CornerMetric } from "../types";

export interface CornerDeckCallbacks {
  onCornerSelect: (corner: string) => void;
}

export function renderCornerDeck(
  container: HTMLElement,
  corners: string[],
  selectedCorner: string,
  metrics: CornerMetric[],
  callbacks: CornerDeckCallbacks
): void {
  const [driverA, driverB] = metrics;

  // Defensive deduplication and strict natural sorting (T1, T2, ... T14)
  const sortedCorners = Array.from(new Set(corners)).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, "") || "999", 10);
    const numB = parseInt(b.replace(/\D/g, "") || "999", 10);
    return numA - numB;
  });

  container.innerHTML = `
    <div class="telemetry-deck">
      <!-- 1. Corner Stepper Strip (Strict Numerical T1..T14) -->
      <div class="corner-stepper" id="corner-stepper">
        ${sortedCorners
          .map(
            (c) => `
            <button 
              class="corner-step-btn ${c === selectedCorner ? "active" : ""}" 
              data-corner="${c}"
              id="btn-corner-${c}"
              title="Inspect telemetry for ${c}"
            >
              ${c}
            </button>
          `
          )
          .join("")}
      </div>

      <!-- 2. Horizontal Driver Telemetry Cassettes -->
      ${
        !driverA
          ? `
        <div style="padding: 18px; text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--text-disabled); border: 1px dashed var(--border); border-radius: var(--radius-cassette);">
          [ NO CORNER METRICS DETECTED FOR ${selectedCorner || "CORNER"} IN CURRENT RUN TYPE ]
        </div>
      `
          : `
        <div class="driver-cassette-grid">
          ${renderDriverCassette(driverA)}
          ${driverB ? renderDriverCassette(driverB) : renderEmptyCassette()}
        </div>
      `
      }
    </div>
  `;

  // Attach corner click handlers
  container.querySelectorAll(".corner-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const corner = btn.getAttribute("data-corner");
      if (corner) callbacks.onCornerSelect(corner);
    });
  });
}

function renderDriverCassette(d: CornerMetric): string {
  const maxBrake = 140;
  const brakeDist = d.brake_before_corner_m || 0;
  const filledBlocks = Math.min(10, Math.max(1, Math.round((brakeDist / maxBrake) * 10)));
  const emptyBlocks = 10 - filledBlocks;

  // Dwell ratio indicates car rotation efficiency (transition distance over entry+exit envelope)
  const totalEnvelope = (d.brake_before_corner_m || 80) + (d.full_throttle_after_corner_m || 70);
  const dwellRatio = totalEnvelope > 0 ? ((d.brake_to_full_throttle_m || 30) / totalEnvelope).toFixed(2) : "0.20";

  return `
    <div class="driver-cassette" id="cassette-${d.driver}">
      <!-- Left Sub-Panel: Driver ID & Apex Minimum Speed -->
      <div class="cassette-hero">
        <div class="driver-id-row">
          <span class="driver-code">${d.driver}</span>
          <span class="driver-style-badge">${d.corner_style || "V-STYLE"}</span>
        </div>
        <div class="apex-speed-val">${Math.round(d.min_speed_kmh)}</div>
        <div class="apex-speed-meta">KM/H · IQR ±${d.min_speed_iqr_kmh?.toFixed(1) || "0.0"} (${d.n_laps || 0} L)</div>
      </div>

      <!-- Right Sub-Panel: Braking LED Bar & Micro Metrics -->
      <div class="cassette-stats">
        <div class="brake-indicator-row">
          <span>BRAKE ONSET</span>
          <span style="color: var(--text-display); font-weight: 700;">${d.brake_before_corner_m?.toFixed(1) || "0.0"} M BEFORE</span>
        </div>
        
        <!-- 10-Block Discrete Mechanical Braking LED Indicator -->
        <div class="seg-led-bar" title="Mechanical Braking Pressure Envelope: ${filledBlocks}/10">
          ${Array(filledBlocks).fill(0).map(() => `<div class="led-block on"></div>`).join("")}
          ${Array(emptyBlocks).fill(0).map(() => `<div class="led-block"></div>`).join("")}
        </div>

        <!-- Micro Telemetry Row -->
        <div class="stats-micro-row">
          <span>FULL THROTTLE: <span class="stats-micro-val">${d.full_throttle_after_corner_m?.toFixed(1) || "0.0"} M</span></span>
          <span>DECEL: <span class="stats-micro-val">${d.peak_decel_g_est?.toFixed(2) || "4.50"} G</span></span>
          <span>DWELL: <span class="stats-micro-val">${dwellRatio}</span></span>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyCassette(): string {
  return `
    <div class="driver-cassette" style="opacity: 0.4; justify-content: center; align-items: center; display: flex;">
      <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-disabled);">[ NO TEAMMATE DATA ]</span>
    </div>
  `;
}
