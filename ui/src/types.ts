export interface SessionMetadata {
  session_id: string;
  year: number;
  round: number;
  event_name: string;
  session_type: string;
  session_date: string;
}

export interface TeamDriverInfo {
  team: string;
  drivers: string[];
  total_laps: number;
}

export interface CornerMetric {
  driver: string;
  team: string;
  corner: string;
  run_type: string;
  n_laps: number;
  brake_before_corner_m: number;
  brake_before_corner_iqr_m: number;
  min_speed_kmh: number;
  min_speed_iqr_kmh: number;
  full_throttle_after_corner_m: number;
  full_throttle_iqr_m: number;
  brake_to_full_throttle_m: number;
  peak_decel_g_est: number;
  corner_style: string;
}

export interface SegmentDelta {
  driver_a: string;
  driver_b: string;
  segment: string;
  delta_s: number;
  ci_low_s: number;
  ci_high_s: number;
  n_a: number;
  n_b: number;
  significant: boolean;
}

export interface TyreStint {
  driver: string;
  team: string;
  compound: string;
  tyre_life_start: number;
  n_laps_used: number;
  base_pace_s: number;
  deg_s_per_lap: number;
  deg_ci_low: number;
  deg_ci_high: number;
  residual_std_s: number;
  fuel_kg_per_lap: number;
  fuel_s_per_kg: number;
}

export interface EnergySignature {
  driver: string;
  team: string;
  straight: string;
  run_type: string;
  n_laps: number;
  v_peak_kmh: number;
  v_end_kmh: number;
  peak_at_frac: number;
  late_loss_kmh: number;
  clipping_flag: boolean;
}

export interface SessionHighlight {
  team: string;
  driver: string;
  headline: string;
  primary_time_loss: string;
  primary_time_gain: string;
  team_summary: string;
  setup_hypotheses: string;
  grounded: boolean;
  model: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  grounded?: boolean;
  model?: string;
}
