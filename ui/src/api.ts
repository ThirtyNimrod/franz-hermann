import type {
  CornerMetric,
  EnergySignature,
  SegmentDelta,
  SessionHighlight,
  SessionMetadata,
  TeamDriverInfo,
  TyreStint,
} from "./types";

const BASE_URL = "/api";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error [${res.status}]: ${errorText || res.statusText}`);
  }
  return res.json();
}

export async function fetchSessions(): Promise<SessionMetadata[]> {
  const res = await fetch(`${BASE_URL}/sessions`);
  return handleResponse<SessionMetadata[]>(res);
}

export async function fetchDrivers(
  sessionId: string
): Promise<{ session_id: string; teams: TeamDriverInfo[]; details: any[] }> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/drivers`);
  return handleResponse(res);
}

export async function fetchCorners(sessionId: string): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/corners`);
  return handleResponse<string[]>(res);
}

export async function fetchHighlights(
  sessionId: string,
  driver?: string
): Promise<SessionHighlight[]> {
  const url = new URL(`${BASE_URL}/sessions/${sessionId}/highlights`, window.location.origin);
  if (driver) url.searchParams.set("driver", driver);
  const res = await fetch(url.toString());
  return handleResponse<SessionHighlight[]>(res);
}

export async function compareCorners(
  sessionId: string,
  team: string,
  corner: string,
  runType: "push" | "long_run" = "push"
): Promise<CornerMetric[]> {
  const url = new URL(`${BASE_URL}/sessions/${sessionId}/corners/compare`, window.location.origin);
  url.searchParams.set("team", team);
  url.searchParams.set("corner", corner);
  url.searchParams.set("run_type", runType);
  const res = await fetch(url.toString());
  return handleResponse<CornerMetric[]>(res);
}

export async function fetchSegmentDeltas(
  sessionId: string,
  team: string,
  runType: "push" | "long_run" = "push",
  onlySignificant: boolean = false
): Promise<SegmentDelta[]> {
  const url = new URL(`${BASE_URL}/sessions/${sessionId}/segments`, window.location.origin);
  url.searchParams.set("team", team);
  url.searchParams.set("run_type", runType);
  if (onlySignificant) url.searchParams.set("only_significant", "true");
  const res = await fetch(url.toString());
  return handleResponse<SegmentDelta[]>(res);
}

export async function fetchTyreDegradation(
  sessionId: string,
  compound?: string,
  driver?: string
): Promise<TyreStint[]> {
  const url = new URL(`${BASE_URL}/sessions/${sessionId}/tyre`, window.location.origin);
  if (compound && compound !== "ALL") url.searchParams.set("compound", compound);
  if (driver) url.searchParams.set("driver", driver);
  const res = await fetch(url.toString());
  return handleResponse<TyreStint[]>(res);
}

export async function fetchEnergySignatures(
  sessionId: string,
  team?: string
): Promise<EnergySignature[]> {
  const url = new URL(`${BASE_URL}/sessions/${sessionId}/energy`, window.location.origin);
  if (team) url.searchParams.set("team", team);
  const res = await fetch(url.toString());
  return handleResponse<EnergySignature[]>(res);
}

export async function sendChatMessage(
  question: string,
  sessionId?: string,
  model?: string
): Promise<{ reply: string; model: string; grounded: boolean }> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId, model }),
  });
  return handleResponse(res);
}
