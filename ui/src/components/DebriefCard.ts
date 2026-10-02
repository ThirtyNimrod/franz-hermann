import type { SessionHighlight } from "../types";

export function renderDebriefCard(container: HTMLElement, highlights: SessionHighlight[]): void {
  const teamHighlights = highlights[0];

  container.innerHTML = `
    <div class="card" style="flex-shrink: 0; max-height: 260px; overflow-y: auto;">
      <div class="card-header">
        <div class="card-title">
          <span>[ POST-SESSION ENGINEER DEBRIEF ]</span>
        </div>
        <div class="card-meta">
          ${
            teamHighlights
              ? `<span style="color: ${teamHighlights.grounded ? "var(--success)" : "var(--warning)"}; font-weight: 700;">
                  ${teamHighlights.grounded ? "[GROUNDED: VERIFIED]" : "[DETERMINISTIC FALLBACK]"}
                </span>`
              : `<span>[AWAITING REPORT]</span>`
          }
        </div>
      </div>

      ${
        !teamHighlights
          ? `
        <div style="padding: 16px; text-align: center; font-family: var(--font-mono); color: var(--text-disabled); font-size: 11px;">
          [ NO DEBRIEF SYNTHESIS RUN FOR THIS TEAM ]
        </div>
      `
          : `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <!-- Summary Box -->
          <div style="border-left: 2px solid var(--border-visible); padding-left: 10px;">
            <div style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">
              TEAM STRATEGIC SUMMARY (${teamHighlights.team})
            </div>
            <div style="font-size: 12px; color: var(--text-primary); margin-top: 2px; line-height: 1.35;">
              ${teamHighlights.team_summary}
            </div>
          </div>

          <!-- Drivers Highlights -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${highlights
              .map(
                (h) => `
              <div style="background-color: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--border); padding-bottom: 2px;">
                  <span style="font-family: var(--font-display); font-size: 14px; font-weight: 700;">${h.driver}</span>
                  <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">
                    ${h.headline}
                  </span>
                </div>
                <div style="margin-top: 4px; font-family: var(--font-mono); font-size: 10px; display: flex; flex-direction: column; gap: 2px;">
                  <div>
                    <span style="color: var(--text-secondary);">GAIN:</span>
                    <span style="color: var(--success); font-weight: 700;">${h.primary_time_gain || "None"}</span>
                  </div>
                  <div>
                    <span style="color: var(--text-secondary);">LOSS:</span>
                    <span style="color: var(--accent); font-weight: 700;">${h.primary_time_loss || "None"}</span>
                  </div>
                </div>
                ${
                  h.setup_hypotheses
                    ? `
                  <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--border); font-size: 10px; color: var(--text-secondary); line-height: 1.3;">
                    <span style="font-weight: 700; color: var(--text-primary);">HYPOTHESIS:</span> ${h.setup_hypotheses}
                  </div>
                `
                    : ""
                }
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
      }
    </div>
  `;
}
