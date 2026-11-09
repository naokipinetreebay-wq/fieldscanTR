import type {
  DisplayState,
  PlayPackage,
  PlayRound,
  RoomConfig,
  RoomSnapshot,
  TransitionMode,
} from "./types";

/** 開始時一括。尽きたら端末側でループ */
export const LOCAL_PACKAGE_ROUNDS = 300;

const BLACK_GAP_MS = 280;
const TRANSITION_LEAD_MS: Record<TransitionMode, number> = {
  instant: 0,
  countdown: 0,
  blink: 0,
  fade: 0,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pickTransition(config: RoomConfig): TransitionMode {
  if (config.transition !== "random") return config.transition;
  const options: TransitionMode[] = ["instant", "countdown", "blink", "fade"];
  return options[Math.floor(Math.random() * options.length)];
}

function nextIntervalMs(config: RoomConfig): number {
  if (config.timingMode === "fixed") {
    return Math.max(0.5, config.fixedSeconds) * 1000;
  }
  if (config.timingMode === "random") {
    const min = Math.min(config.randomMinSeconds, config.randomMaxSeconds);
    const max = Math.max(config.randomMinSeconds, config.randomMaxSeconds);
    return (min + Math.random() * (max - min)) * 1000;
  }
  return 3000;
}

function maxStaggerMs(config: RoomConfig) {
  return config.syncMode === "staggered"
    ? Math.max(0, (config.staggerMaxSeconds ?? 2) * 1000)
    : 0;
}

function planOffsets(ids: string[], config: RoomConfig): Record<string, number> {
  const max = maxStaggerMs(config);
  const offsets: Record<string, number> = {};
  if (max > 0 && ids.length > 1) {
    const order = shuffle(ids);
    for (let i = 0; i < order.length; i++) {
      offsets[order[i]] = Math.round((i / (order.length - 1)) * max);
    }
  } else {
    for (const id of ids) offsets[id] = 0;
  }
  return offsets;
}

export function assignStates(
  ids: string[],
  config: RoomConfig,
  current: Record<string, DisplayState>,
  pending?: Record<string, DisplayState> | null
): Record<string, DisplayState> {
  const result: Record<string, DisplayState> = {};
  if (ids.length === 0) return result;

  if (config.timingMode === "manual" && config.manualAssign === "pick") {
    for (const id of ids) {
      const chosen = pending?.[id];
      result[id] =
        chosen === "free" || chosen === "marked" || chosen === "enemy"
          ? chosen
          : current[id] ?? "free";
    }
    return result;
  }

  if (config.assignMode === "fullRandom") {
    for (const id of ids) {
      const r = Math.random();
      result[id] = r < 0.34 ? "free" : r < 0.67 ? "marked" : "enemy";
    }
    if (config.forbidZeroAlly) {
      const allies = ids.filter((id) => result[id] !== "enemy");
      if (allies.length === 0) {
        const pick = ids[Math.floor(Math.random() * ids.length)];
        result[pick] =
          config.allowMarked && Math.random() < 0.5 ? "marked" : "free";
      }
    }
    return result;
  }

  const allyCount = clamp(
    config.allyCount,
    config.forbidZeroAlly ? 1 : 0,
    ids.length
  );
  const shuffled = shuffle(ids);
  const allies = shuffled.slice(0, allyCount);
  const enemies = shuffled.slice(allyCount);
  let markedCount = 0;
  if (config.allowMarked && allyCount > 0) {
    markedCount = Math.floor(Math.random() * (allyCount + 1));
  }
  const markedSet = new Set(shuffle(allies).slice(0, markedCount));
  for (const id of allies) result[id] = markedSet.has(id) ? "marked" : "free";
  for (const id of enemies) result[id] = "enemy";
  return result;
}

export function buildLocalPlayPackage(
  ids: string[],
  config: RoomConfig,
  opts?: {
    count?: number;
    startAt?: number;
    fromRoundId?: number;
    previous?: Record<string, DisplayState>;
  }
): PlayPackage {
  const count = opts?.count ?? LOCAL_PACKAGE_ROUNDS;
  let previous: Record<string, DisplayState> = { ...(opts?.previous ?? {}) };
  for (const id of ids) {
    if (!(id in previous)) previous[id] = "free";
  }
  let t = opts?.startAt ?? Date.now();
  let nextRoundId = opts?.fromRoundId ?? 1;
  const rounds: PlayRound[] = [];

  for (let i = 0; i < count; i++) {
    const states = assignStates(ids, config, previous, null);
    for (const id of ids) {
      if (!(id in states)) states[id] = previous[id] ?? "free";
    }
    const transition = pickTransition(config);
    const offsets = planOffsets(ids, config);
    const lead = TRANSITION_LEAD_MS[transition];
    const interval = nextIntervalMs(config);
    const nextChangeAt =
      t + interval + maxStaggerMs(config) + lead + BLACK_GAP_MS + 200;
    rounds.push({
      roundId: nextRoundId++,
      states,
      previousStates: { ...previous },
      deviceOffsets: offsets,
      transition,
      roundStartedAt: t,
      nextChangeAt,
    });
    previous = states;
    t = nextChangeAt;
  }
  return { rounds };
}

export type HostOverlay = {
  playPackage: PlayPackage | null;
  roundId: number;
  primaryStates: Record<string, DisplayState>;
  previousStates: Record<string, DisplayState>;
  deviceOffsets: Record<string, number>;
  transition: TransitionMode;
  roundStartedAt: number | null;
  nextChangeAt: number | null;
  transitionEndsAt: number | null;
  blackEndsAt: number | null;
  manualCueEndsAt: number | null;
  hostNow: number;
};

export function overlayFromPackage(
  pkg: PlayPackage,
  hostNow = Date.now()
): HostOverlay {
  const first = pkg.rounds[0];
  const lead = first ? TRANSITION_LEAD_MS[first.transition] : 0;
  return {
    playPackage: pkg,
    roundId: first?.roundId ?? 0,
    primaryStates: first?.states ?? {},
    previousStates: first?.previousStates ?? {},
    deviceOffsets: first?.deviceOffsets ?? {},
    transition: first?.transition ?? "instant",
    roundStartedAt: first?.roundStartedAt ?? null,
    nextChangeAt: first?.nextChangeAt ?? null,
    transitionEndsAt: first ? first.roundStartedAt + lead : null,
    blackEndsAt: first ? first.roundStartedAt + lead + BLACK_GAP_MS : null,
    manualCueEndsAt: null,
    hostNow,
  };
}

/** 手動切替: 即時 or 3秒カウント後にコントローラが押し込む用 */
export function buildManualOverlay(
  ids: string[],
  config: RoomConfig,
  current: Record<string, DisplayState>,
  pending: Record<string, DisplayState> | null,
  phase: "cue" | "reveal",
  now = Date.now()
): HostOverlay {
  if (phase === "cue" && config.manualPreCountdown) {
    return {
      playPackage: null,
      roundId: 0,
      primaryStates: { ...current },
      previousStates: { ...current },
      deviceOffsets: Object.fromEntries(ids.map((id) => [id, 0])),
      transition: "countdown",
      roundStartedAt: now,
      nextChangeAt: now + 3000,
      transitionEndsAt: now + 3000,
      blackEndsAt: null,
      manualCueEndsAt: now + 3000,
      hostNow: now,
    };
  }

  const previous = { ...current };
  const states = assignStates(ids, config, current, pending);
  const transition = pickTransition(config);
  const lead = TRANSITION_LEAD_MS[transition];
  const offsets = planOffsets(ids, config);
  return {
    playPackage: null,
    roundId: Date.now(),
    primaryStates: states,
    previousStates: previous,
    deviceOffsets: offsets,
    transition,
    roundStartedAt: now,
    nextChangeAt: null,
    transitionEndsAt: now + lead,
    blackEndsAt: now + lead + BLACK_GAP_MS,
    manualCueEndsAt: null,
    hostNow: now,
  };
}

export function idsFromSnapshot(snapshot: RoomSnapshot): string[] {
  return snapshot.displays.map((d) => d.id);
}

export function currentStatesFromSnapshot(
  snapshot: RoomSnapshot
): Record<string, DisplayState> {
  const out: Record<string, DisplayState> = {};
  for (const d of snapshot.displays) out[d.id] = d.state;
  return { ...snapshot.primaryStates, ...out };
}
