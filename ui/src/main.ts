import "./styles/tokens.css";
import "./styles/components.css";

import {
  compareCorners,
  fetchCorners,
  fetchDrivers,
  fetchEnergySignatures,
  fetchHighlights,
  fetchSegmentDeltas,
  fetchSessions,
  fetchTyreDegradation,
  sendChatMessage,
} from "./api";
import { renderCornerDeck } from "./components/CornerDeck";
import { renderDebriefCard } from "./components/DebriefCard";
import { renderEngineerIntercom } from "./components/EngineerIntercom";
import { renderHeader } from "./components/Header";
import {
  renderTelemetryAnalyzer,
  type ReplayState,
  type TelemetryTab,
} from "./components/TelemetryAnalyzer";
import type {
  ChatMessage,
  CornerMetric,
  EnergySignature,
  SegmentDelta,
  SessionHighlight,
  SessionMetadata,
  TeamDriverInfo,
  TyreStint,
} from "./types";

class AppState {
  sessions: SessionMetadata[] = [];
  currentSessionId: string = "2026_01_R";
  teams: TeamDriverInfo[] = [];
  currentTeam: string = "McLaren";
  currentRunType: "push" | "long_run" = "long_run";
  corners: string[] = [];
  selectedCorner: string = "T1";
  cornerMetrics: CornerMetric[] = [];
  segmentDeltas: SegmentDelta[] = [];
  onlySignificant: boolean = false;
  tyreStints: TyreStint[] = [];
  selectedCompound: string = "ALL";
  energySignatures: EnergySignature[] = [];
  highlights: SessionHighlight[] = [];
  messages: ChatMessage[] = [];
  isTransmitting: boolean = false;
  currentTheme: "light" | "dark" = "light";
  selectedTelemetryTab: TelemetryTab = "segments";
  replayState: ReplayState = {
    currentLap: 1,
    totalLaps: 58,
    isPlaying: false,
    playbackSpeed: 1,
  };
}

const state = new AppState();
let replayInterval: number | null = null;

// Initialize App
async function init() {
  const appEl = document.querySelector("#app");
  if (!appEl) return;

  // Set initial theme
  document.documentElement.setAttribute("data-theme", state.currentTheme);

  // Setup DOM scaffold for 100vh dual-deck
  appEl.innerHTML = `
    <div id="header-mount"></div>
    <main class="main-console">
      <section class="deck" id="telemetry-deck">
        <div id="corner-mount"></div>
        <div id="telemetry-analyzer-mount" style="flex: 1; min-height: 0; display: flex; flex-direction: column;"></div>
      </section>
      <section class="deck" id="intercom-deck">
        <div id="debrief-mount"></div>
        <div id="intercom-mount"></div>
      </section>
    </main>
  `;

  // Fetch initial sessions
  try {
    state.sessions = await fetchSessions();
    if (state.sessions.length > 0) {
      // Prioritize Race if available, else FP2
      const race = state.sessions.find((s) => s.session_id === "2026_01_R");
      const melbourne = state.sessions.find((s) => s.session_id === "2026_01_FP2");
      state.currentSessionId = race ? race.session_id : (melbourne ? melbourne.session_id : state.sessions[0].session_id);
    }

    await loadSessionData(state.currentSessionId);
  } catch (err) {
    console.error("Initialization error:", err);
  }
}

async function loadSessionData(sessionId: string) {
  try {
    const driversData = await fetchDrivers(sessionId);
    state.teams = driversData.teams;
    if (state.teams.length > 0) {
      const hasMcLaren = state.teams.some((t) => t.team.toLowerCase().includes("mclaren"));
      state.currentTeam = hasMcLaren
        ? state.teams.find((t) => t.team.toLowerCase().includes("mclaren"))!.team
        : state.teams[0].team;
    }

    state.corners = await fetchCorners(sessionId);
    if (state.corners.length > 0 && !state.corners.includes(state.selectedCorner)) {
      state.selectedCorner = state.corners[0];
    }

    // Default to long_run if race session
    if (sessionId.endsWith("_R")) {
      state.currentRunType = "long_run";
    }

    await loadTeamData();
  } catch (err) {
    console.error("Failed to load session data:", err);
  }
}

async function loadTeamData() {
  try {
    // 1. Corner comparison
    state.cornerMetrics = await compareCorners(
      state.currentSessionId,
      state.currentTeam,
      state.selectedCorner,
      state.currentRunType
    );

    // 2. Segment deltas
    state.segmentDeltas = await fetchSegmentDeltas(
      state.currentSessionId,
      state.currentTeam,
      state.currentRunType,
      state.onlySignificant
    );

    // 3. Tyre degradation
    state.tyreStints = await fetchTyreDegradation(
      state.currentSessionId,
      state.selectedCompound
    );

    // 4. Energy signatures
    state.energySignatures = await fetchEnergySignatures(
      state.currentSessionId,
      state.currentTeam
    );

    // 5. Highlights
    state.highlights = await fetchHighlights(state.currentSessionId);
    const teamHighlights = state.highlights.filter((h) =>
      h.team.toLowerCase().includes(state.currentTeam.toLowerCase())
    );

    renderAll(teamHighlights.length > 0 ? teamHighlights : state.highlights);
  } catch (err) {
    console.error("Failed to load team data:", err);
  }
}

function renderAll(filteredHighlights?: SessionHighlight[]) {
  const currentTeamInfo = state.teams.find((t) => t.team === state.currentTeam);
  const activeDrivers = currentTeamInfo?.drivers || [];

  // 1. Header
  const headerMount = document.querySelector("#header-mount") as HTMLElement;
  if (headerMount) {
    renderHeader(
      headerMount,
      state.sessions,
      state.currentSessionId,
      state.teams,
      state.currentTeam,
      state.currentRunType,
      state.currentTheme,
      {
        onSessionChange: async (newSession) => {
          state.currentSessionId = newSession;
          await loadSessionData(newSession);
        },
        onTeamChange: async (newTeam) => {
          state.currentTeam = newTeam;
          await loadTeamData();
        },
        onRunTypeChange: async (newRun) => {
          state.currentRunType = newRun;
          await loadTeamData();
        },
        onThemeToggle: () => {
          state.currentTheme = state.currentTheme === "light" ? "dark" : "light";
          document.documentElement.setAttribute("data-theme", state.currentTheme);
          renderAll(filteredHighlights);
        },
      }
    );
  }

  // 2. Corner Deck (Top Left)
  const cornerMount = document.querySelector("#corner-mount") as HTMLElement;
  if (cornerMount) {
    renderCornerDeck(
      cornerMount,
      state.corners,
      state.selectedCorner,
      state.cornerMetrics,
      {
        onCornerSelect: async (corner) => {
          state.selectedCorner = corner;
          state.cornerMetrics = await compareCorners(
            state.currentSessionId,
            state.currentTeam,
            corner,
            state.currentRunType
          );
          renderAll(filteredHighlights);
        },
      }
    );
  }

  // 3. Telemetry Analyzer (Bottom Left — Segment Deltas, Tyre Deg, 2026 Energy, Race Replay)
  const analyzerMount = document.querySelector("#telemetry-analyzer-mount") as HTMLElement;
  if (analyzerMount) {
    renderTelemetryAnalyzer(
      analyzerMount,
      state.selectedTelemetryTab,
      state.segmentDeltas,
      state.onlySignificant,
      state.tyreStints,
      state.selectedCompound,
      state.energySignatures,
      state.replayState,
      {
        onTabChange: (tab) => {
          state.selectedTelemetryTab = tab;
          renderAll(filteredHighlights);
        },
        onToggleSignificantOnly: async (onlySig) => {
          state.onlySignificant = onlySig;
          state.segmentDeltas = await fetchSegmentDeltas(
            state.currentSessionId,
            state.currentTeam,
            state.currentRunType,
            state.onlySignificant
          );
          renderAll(filteredHighlights);
        },
        onCompoundSelect: async (comp) => {
          state.selectedCompound = comp;
          state.tyreStints = await fetchTyreDegradation(
            state.currentSessionId,
            state.selectedCompound
          );
          renderAll(filteredHighlights);
        },
        onReplayLapChange: (lap) => {
          state.replayState.currentLap = lap;
          renderAll(filteredHighlights);
        },
        onReplayPlayToggle: () => {
          state.replayState.isPlaying = !state.replayState.isPlaying;
          if (state.replayState.isPlaying) {
            if (replayInterval) clearInterval(replayInterval);
            replayInterval = window.setInterval(() => {
              state.replayState.currentLap = (state.replayState.currentLap % state.replayState.totalLaps) + 1;
              renderAll(filteredHighlights);
            }, 800);
          } else {
            if (replayInterval) clearInterval(replayInterval);
          }
          renderAll(filteredHighlights);
        },
      }
    );
  }

  // 4. Debrief Card (Top Right)
  const debriefMount = document.querySelector("#debrief-mount") as HTMLElement;
  if (debriefMount) {
    renderDebriefCard(debriefMount, filteredHighlights || state.highlights);
  }

  // 5. Engineer Intercom (Bottom Right — Flex-1 with dynamic team chips)
  const intercomMount = document.querySelector("#intercom-mount") as HTMLElement;
  if (intercomMount) {
    renderEngineerIntercom(
      intercomMount,
      state.messages,
      state.isTransmitting,
      state.currentTeam,
      activeDrivers,
      state.selectedCorner,
      {
        onSendMessage: (text) => handleChat(text),
        onChipClick: (text) => handleChat(text),
      }
    );
  }
}

async function handleChat(question: string) {
  const timeStr = new Date().toLocaleTimeString("en-GB", { hour12: false });
  state.messages.push({
    id: String(Date.now()),
    role: "user",
    content: question,
    timestamp: timeStr,
  });
  state.isTransmitting = true;
  renderAll();

  try {
    const res = await sendChatMessage(question, state.currentSessionId);
    state.messages.push({
      id: String(Date.now() + 1),
      role: "assistant",
      content: res.reply,
      timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      grounded: res.grounded,
      model: res.model,
    });
  } catch (err) {
    state.messages.push({
      id: String(Date.now() + 1),
      role: "assistant",
      content: `[PIT WALL COMMUNICATION FAULT]: ${(err as Error).message}`,
      timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      grounded: false,
    });
  } finally {
    state.isTransmitting = false;
    renderAll();
  }
}

// Boot application
init();
