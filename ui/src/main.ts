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
import { renderHeader } from "./components/Header";
import {
  renderRadioTransponder,
} from "./components/RadioTransponder";
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
  isDrawerOpen: boolean = false;
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

// Initialize Option C Pit Wall Console
async function init() {
  const appEl = document.querySelector("#app");
  if (!appEl) return;

  // Automatically follow system default color scheme (dark / light)
  const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const applySystemTheme = (isDark: boolean) => {
    state.currentTheme = isDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", state.currentTheme);
  };
  applySystemTheme(systemDarkQuery.matches);
  systemDarkQuery.addEventListener("change", (e) => {
    applySystemTheme(e.matches);
    renderAll();
  });

  // Setup DOM scaffold for Option C layout
  appEl.innerHTML = `
    <div id="header-mount"></div>
    <main class="main-console">
      <section class="deck" id="telemetry-deck">
        <div id="corner-mount"></div>
        <div id="telemetry-analyzer-mount" style="flex: 1; min-height: 0; display: flex; flex-direction: column;"></div>
      </section>
      <div id="transponder-mount"></div>
    </main>
  `;

  // Attach global keyboard shortcuts
  window.addEventListener("keydown", handleGlobalKeyDown);

  // Fetch initial sessions
  try {
    state.sessions = await fetchSessions();
    if (state.sessions.length > 0) {
      // Prioritize Race if available, else FP2
      const race = state.sessions.find((s) => s.session_id === "2026_01_R");
      const melbourne = state.sessions.find((s) => s.session_id === "2026_01_FP2");
      state.currentSessionId = race
        ? race.session_id
        : melbourne
        ? melbourne.session_id
        : state.sessions[0].session_id;
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
  const activeHighlights = filteredHighlights || state.highlights;

  // 1. Pinned Compact Header (38px)
  const headerMount = document.querySelector("#header-mount") as HTMLElement;
  if (headerMount) {
    renderHeader(
      headerMount,
      state.sessions,
      state.currentSessionId,
      state.teams,
      state.currentTeam,
      state.currentRunType,
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
      }
    );
  }

  // 2. Corner Stepper & Horizontal Driver Cassettes (Top Deck)
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
          renderAll(activeHighlights);
        },
      }
    );
  }

  // 3. Full-Width Strategy & Telemetry Analyzer (Flex-1 Deck)
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
      activeHighlights,
      {
        onTabChange: (tab) => {
          state.selectedTelemetryTab = tab;
          renderAll(activeHighlights);
        },
        onToggleSignificantOnly: async (onlySig) => {
          state.onlySignificant = onlySig;
          state.segmentDeltas = await fetchSegmentDeltas(
            state.currentSessionId,
            state.currentTeam,
            state.currentRunType,
            state.onlySignificant
          );
          renderAll(activeHighlights);
        },
        onCompoundSelect: async (comp) => {
          state.selectedCompound = comp;
          state.tyreStints = await fetchTyreDegradation(
            state.currentSessionId,
            state.selectedCompound
          );
          renderAll(activeHighlights);
        },
        onReplayLapChange: (lap) => {
          state.replayState.currentLap = lap;
          renderAll(activeHighlights);
        },
        onReplayPlayToggle: () => {
          state.replayState.isPlaying = !state.replayState.isPlaying;
          if (state.replayState.isPlaying) {
            if (replayInterval) clearInterval(replayInterval);
            replayInterval = window.setInterval(() => {
              state.replayState.currentLap = (state.replayState.currentLap % state.replayState.totalLaps) + 1;
              renderAll(activeHighlights);
            }, 800);
          } else {
            if (replayInterval) clearInterval(replayInterval);
          }
          renderAll(activeHighlights);
        },
      }
    );
  }

  // 4. Pinned Radio Transponder Bar & Slide-Up Comms Sheet
  const transponderMount = document.querySelector("#transponder-mount") as HTMLElement;
  if (transponderMount) {
    renderRadioTransponder(
      transponderMount,
      state.messages,
      state.isTransmitting,
      state.isDrawerOpen,
      state.currentTeam,
      activeDrivers,
      state.selectedCorner,
      {
        onSendMessage: (text) => handleChat(text),
        onChipClick: (text) => handleChat(text),
        onAnchorClick: (corner, segment, tab) => handleDeepLink(corner, segment, tab),
        onDrawerToggle: (open) => {
          state.isDrawerOpen = open;
          renderAll(activeHighlights);
        },
      }
    );
  }
}

// Bidirectional Event Bus: Deep-linking from LLM text to Telemetry Tables
async function handleDeepLink(corner?: string, segment?: string, tab?: string) {
  if (tab) {
    state.selectedTelemetryTab = tab as TelemetryTab;
  }

  if (corner && state.corners.includes(corner)) {
    state.selectedCorner = corner;
    state.cornerMetrics = await compareCorners(
      state.currentSessionId,
      state.currentTeam,
      corner,
      state.currentRunType
    );
  }

  renderAll();

  // Highlight and scroll to target element
  setTimeout(() => {
    let targetEl: HTMLElement | null = null;
    if (segment) {
      targetEl = document.querySelector(`#row-segment-${segment}`);
    } else if (corner) {
      targetEl = document.querySelector(`#btn-corner-${corner}`);
    }

    if (targetEl) {
      targetEl.classList.add("flash-highlight");
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        targetEl?.classList.remove("flash-highlight");
      }, 2500);
    }
  }, 60);
}

// Global Keyboard Navigation
function handleGlobalKeyDown(e: KeyboardEvent) {
  // If user is currently typing in an input field, do not hijack keys
  const targetTag = (e.target as HTMLElement)?.tagName;
  if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") {
    if (e.key === "Escape" && state.isDrawerOpen) {
      state.isDrawerOpen = false;
      renderAll();
    }
    return;
  }

  // Ctrl + / or Cmd + / : Toggle Comms Sheet
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    e.preventDefault();
    state.isDrawerOpen = !state.isDrawerOpen;
    renderAll();
    return;
  }

  // Escape: Close Comms Sheet
  if (e.key === "Escape" && state.isDrawerOpen) {
    state.isDrawerOpen = false;
    renderAll();
    return;
  }

  // ArrowLeft / ArrowRight: Navigate Corners
  if (state.corners.length > 0) {
    const currentIndex = state.corners.indexOf(state.selectedCorner);
    if (e.key === "ArrowLeft" && currentIndex > 0) {
      const prevCorner = state.corners[currentIndex - 1];
      handleDeepLink(prevCorner);
    } else if (e.key === "ArrowRight" && currentIndex < state.corners.length - 1) {
      const nextCorner = state.corners[currentIndex + 1];
      handleDeepLink(nextCorner);
    }
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
