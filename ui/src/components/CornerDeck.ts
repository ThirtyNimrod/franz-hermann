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
  // If no metrics loaded or empty
  const [driverA, driverB] = metrics;

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <span>[ CORNER TELEMETRY INSTRUMENT ]</span>
        </div>
        <div class="card-meta">
          <span>ACTIVE: ${selectedCorner || "NONE"}</span>
        </div>
      </div>

      <!-- Corner Stepper Strip -->
      <div class="corner-strip">
        ${corners
          .map(
            (c) => `
            <button class="corner-btn ${c === selectedCorner ? "active" : ""}" data-corner="${c}">
              ${c}
            </button>
          `
          )
          .join("")}
      </div>

      <!-- Teammates Comparison Columns -->
      ${
        !driverA
          ? `
        <div style="padding: 32px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled);">
          [ NO TELEMETRY RECORDED FOR ${selectedCorner} IN THIS RUN TYPE ]
        </div>
      `
          : `
        <div class="teammate-grid">
          ${renderDriverColumn(driverA)}
          ${driverB ? renderDriverColumn(driverB) : `<div></div>`}
        </div>
      `
      }
    </div>
  `;

  // Attach corner click handlers
  container.querySelectorAll(".corner-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const corner = btn.getAttribute("data-corner");
      if (corner) callbacks.onCornerSelect(corner);
    });
  });
}

function renderDriverColumn(d: CornerMetric): string {
  // Max braking reference for segmented bar (up to 150m)
  const maxBrake = 140;
  const filledBlocks = Math.min(10, Math.max(1, Math.round((d.brake_before_corner_m / maxBrake) * 10)));
  const emptyBlocks = 10 - filledBlocks;

  return `
    <div class="telemetry-column">
      <div class="driver-tag-row">
        <div class="driver-code">${d.driver}</div>
        <div class="corner-style-badge">${d.corner_style || "U-STYLE"}</div>
      </div>

      <!-- Hero Apex Speed -->
      <div class="hero-metric">
        <div class="hero-label">APEX MINIMUM SPEED</div>
        <div class="hero-value-wrap">
          <span class="hero-value">${Math.round(d.min_speed_kmh)}</span>
          <span class="hero-unit">KM/H</span>
        </div>
        <div class="hero-spread">IQR: ±${d.min_speed_iqr_kmh?.toFixed(1) || "0.0"} KM/H (${d.n_laps} LAPS)</div>
      </div>

      <!-- Segmented Braking Bar -->
      <div class="seg-bar-wrap">
        <div class="seg-bar-header">
          <span>BRAKE ONSET</span>
          <span style="color: var(--text-display); font-weight: 700;">${d.brake_before_corner_m?.toFixed(1)} M BEFORE</span>
        </div>
        <div class="seg-bar">
          ${Array(filledBlocks)
            .fill(0)
            .map(() => `<div class="seg-block filled"></div>`)
            .join("")}
          ${Array(emptyBlocks)
            .fill(0)
            .map(() => `<div class="seg-block"></div>`)
            .join("")}
        </div>
      </div>

      <!-- Stat Rows -->
      <div>
        <div class="stat-row">
          <span class="stat-label">FULL THROTTLE PICKUP</span>
          <span class="stat-value">${d.full_throttle_after_corner_m?.toFixed(1)} M AFTER</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">TRANSITION DISTANCE</span>
          <span class="stat-value">${d.brake_to_full_throttle_m?.toFixed(1)} M</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">PEAK DECELERATION</span>
          <span class="stat-value">${d.peak_decel_g_est?.toFixed(2)} G</span>
        </div>
      </div>
    </div>
  `;
}
