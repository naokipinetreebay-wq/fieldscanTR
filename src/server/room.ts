import { WebSocket } from "ws";
import {
  AssignMode,
  DEFAULT_CONFIG,
  DisplayState,
  RoomConfig,
  RoomSnapshot,
  TimingMode,
  TransitionMode,
} from "../lib/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 90 * 60 * 1000;
const MAX_DISPLAYS = 12;
/** Must match DisplayScreen local timings */
const TRANSITION_LEAD_MS: Record<TransitionMode, number> = {
  instant: 0,
  /** Remaining-seconds / lifetime cues run on the current color */
  countdown: 0,
  blink: 0,
  fade: 0,
};
const BLACK_GAP_MS = 280;

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n: number, min: number, max: number): number {
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
  return 0;
}

export type ClientSocket = WebSocket & {
  role?: "controller" | "display";
  deviceId?: string;
  roomCode?: string;
};

interface DisplayClient {
  id: string;
  label: string;
  socket: ClientSocket | null;
  state: DisplayState;
}

export class Room {
  code: string;
  config: RoomConfig = { ...DEFAULT_CONFIG };
  displays = new Map<string, DisplayClient>();
  controllers = new Set<ClientSocket>();
  roundId = 0;
  nextChangeAt: number | null = null;
  transition: TransitionMode = "instant";
  transitionEndsAt: number | null = null;
  blackEndsAt: number | null = null;
  previousStates: Record<string, DisplayState> = {};
  deviceOffsets: Record<string, number> = {};
  roundStartedAt: number | null = null;
  lastActivity = Date.now();
  private timer: NodeJS.Timeout | null = null;

  constructor(code: string) {
    this.code = code;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isExpired(now = Date.now()) {
    // Keep live sessions; idle empty rooms still expire
    if (this.config.running) return false;
    if (this.controllers.size > 0) return false;
    if ([...this.displays.values()].some((d) => d.socket)) return false;
    return now - this.lastActivity > ROOM_TTL_MS;
  }

  displayCount() {
    return this.displays.size;
  }

  addController(socket: ClientSocket) {
    this.controllers.add(socket);
    this.touch();
    this.sendSnapshot(socket);
  }

  removeController(socket: ClientSocket) {
    this.controllers.delete(socket);
  }

  addDisplay(socket: ClientSocket, deviceId: string, label?: string) {
    this.touch();
    const existing = this.displays.get(deviceId);
    if (existing) {
      existing.socket = socket;
      if (label) existing.label = label;
      this.broadcast();
      return { ok: true as const };
    }
    if (this.displays.size >= MAX_DISPLAYS) {
      return { ok: false as const, error: "Display上限（12台）に達しています" };
    }
    this.displays.set(deviceId, {
      id: deviceId,
      label: label || `D${this.displays.size + 1}`,
      socket,
      // Mid-session join waits for the next natural round (do not reset everyone)
      state: "enemy",
    });
    this.broadcast();
    return { ok: true as const };
  }

  removeDisplaySocket(socket: ClientSocket) {
    for (const d of this.displays.values()) {
      if (d.socket === socket) {
        d.socket = null;
        break;
      }
    }
    this.broadcast();
  }

  setLabel(deviceId: string, label: string) {
    const d = this.displays.get(deviceId);
    if (d) {
      d.label = label.slice(0, 24);
      this.touch();
      this.broadcast();
    }
  }

  updateConfig(partial: Partial<RoomConfig>) {
    const prevTiming = this.config.timingMode;
    this.config = { ...this.config, ...partial };
    // Do NOT clamp allyCount to current display count — that silently forced
    // allyCount=1 while phones were still joining, and with markedCount=1
    // pure blue never appeared.
    this.config.allyCount = clamp(this.config.allyCount, 0, MAX_DISPLAYS);
    if (this.config.allowMarked) {
      this.config.markedCount = clamp(this.config.markedCount, 0, this.config.allyCount);
    } else {
      this.config.markedCount = 0;
    }
    this.config.fixedSeconds = clamp(this.config.fixedSeconds, 0.5, 60);
    this.config.randomMinSeconds = clamp(this.config.randomMinSeconds, 0.5, 60);
    this.config.randomMaxSeconds = clamp(this.config.randomMaxSeconds, 0.5, 60);
    this.config.staggerMaxSeconds = clamp(this.config.staggerMaxSeconds ?? 2, 0, 10);
    if (this.config.syncMode !== "staggered") this.config.syncMode = "simultaneous";
    this.touch();
    this.applyTimingModeChange(prevTiming);
    this.broadcast();
  }

  start() {
    this.config.running = true;
    this.touch();
    this.assignRound(true);
  }

  stop() {
    this.config.running = false;
    this.clearTimer();
    this.nextChangeAt = null;
    this.transitionEndsAt = null;
    this.blackEndsAt = null;
    this.touch();
    this.broadcast();
  }

  next() {
    if (!this.config.running) this.config.running = true;
    this.touch();
    this.assignRound(true);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private maxStaggerMs() {
    return this.config.syncMode === "staggered"
      ? Math.max(0, (this.config.staggerMaxSeconds ?? 2) * 1000)
      : 0;
  }

  private armAutoTimer() {
    this.clearTimer();
    if (!this.config.running || this.config.timingMode === "manual") {
      this.nextChangeAt = null;
      return;
    }
    const lead = TRANSITION_LEAD_MS[this.transition];
    const interval = nextIntervalMs(this.config);
    const now = Date.now();
    this.nextChangeAt =
      now + interval + this.maxStaggerMs() + lead + BLACK_GAP_MS + 200;
    const delay = this.nextChangeAt - Date.now();
    this.timer = setTimeout(() => {
      if (this.config.running && this.config.timingMode !== "manual") {
        this.assignRound(false);
      }
    }, Math.max(100, delay));
  }

  private applyTimingModeChange(prevTiming: TimingMode) {
    if (!this.config.running) return;
    if (this.config.timingMode === "manual") {
      this.clearTimer();
      this.nextChangeAt = null;
      return;
    }
    if (prevTiming === "manual" || !this.timer) {
      this.armAutoTimer();
    }
  }

  private assignStates(): Record<string, DisplayState> {
    const ids = [...this.displays.keys()];
    const result: Record<string, DisplayState> = {};
    if (ids.length === 0) return result;

    if (this.config.assignMode === "fullRandom") {
      for (const id of ids) {
        const r = Math.random();
        result[id] = r < 0.34 ? "free" : r < 0.67 ? "marked" : "enemy";
      }
      if (this.config.forbidZeroAlly) {
        const allies = ids.filter((id) => result[id] !== "enemy");
        if (allies.length === 0) {
          const pick = ids[Math.floor(Math.random() * ids.length)];
          result[pick] = this.config.allowMarked && Math.random() < 0.5 ? "marked" : "free";
        }
      }
      return result;
    }

    const allyCount = clamp(this.config.allyCount, this.config.forbidZeroAlly ? 1 : 0, ids.length);
    const shuffled = shuffle(ids);
    const allies = shuffled.slice(0, allyCount);
    const enemies = shuffled.slice(allyCount);

    let markedCount = 0;
    if (this.config.allowMarked && allyCount > 0) {
      // 台数は指定しない。0〜味方台数のあいだで毎回ランダム
      markedCount = Math.floor(Math.random() * (allyCount + 1));
    }
    const markedIds = shuffle(allies).slice(0, markedCount);
    const markedSet = new Set(markedIds);

    for (const id of allies) {
      result[id] = markedSet.has(id) ? "marked" : "free";
    }
    for (const id of enemies) {
      result[id] = "enemy";
    }
    return result;
  }

  private assignRound(fromManual: boolean) {
    this.clearTimer();
    this.touch();
    const previous: Record<string, DisplayState> = {};
    for (const d of this.displays.values()) {
      previous[d.id] = d.state;
    }
    const states = this.assignStates();
    this.roundId += 1;
    this.transition = pickTransition(this.config);
    this.previousStates = previous;

    for (const [id, state] of Object.entries(states)) {
      const d = this.displays.get(id);
      if (d) d.state = state;
    }

    const ids = [...this.displays.keys()];
    const maxStaggerMs = this.maxStaggerMs();
    // Spread devices across 0..max so staggered mode is visibly not simultaneous
    const offsets: Record<string, number> = {};
    if (maxStaggerMs > 0 && ids.length > 1) {
      const order = shuffle(ids);
      for (let i = 0; i < order.length; i++) {
        offsets[order[i]] = Math.round((i / (order.length - 1)) * maxStaggerMs);
      }
    } else {
      for (const id of ids) offsets[id] = 0;
    }
    this.deviceOffsets = offsets;

    const lead = TRANSITION_LEAD_MS[this.transition];
    const now = Date.now();
    this.roundStartedAt = now;
    this.transitionEndsAt = now + lead;
    this.blackEndsAt = now + lead + BLACK_GAP_MS;

    if (this.config.timingMode === "manual") {
      this.nextChangeAt = null;
      this.broadcast();
      return;
    }

    this.armAutoTimer();
    this.broadcast();
    void fromManual;
  }

  snapshot(): RoomSnapshot {
    const primaryStates: Record<string, DisplayState> = {};
    const displays = [...this.displays.values()].map((d) => {
      primaryStates[d.id] = d.state;
      return {
        id: d.id,
        label: d.label,
        state: d.state,
        connected: !!d.socket && d.socket.readyState === WebSocket.OPEN,
      };
    });
    return {
      code: this.code,
      config: this.config,
      displays,
      roundId: this.roundId,
      primaryStates,
      previousStates: { ...this.previousStates },
      deviceOffsets: { ...this.deviceOffsets },
      roundStartedAt: this.roundStartedAt,
      nextChangeAt: this.nextChangeAt,
      transition: this.transition,
      transitionEndsAt: this.transitionEndsAt,
      blackEndsAt: this.blackEndsAt,
      serverNow: Date.now(),
    };
  }

  sendSnapshot(socket: ClientSocket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "snapshot", snapshot: this.snapshot() }));
    }
  }

  broadcast() {
    const payload = JSON.stringify({ type: "snapshot", snapshot: this.snapshot() });
    for (const c of this.controllers) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
    for (const d of this.displays.values()) {
      if (d.socket && d.socket.readyState === WebSocket.OPEN) d.socket.send(payload);
    }
  }

  destroy() {
    this.clearTimer();
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.isExpired()) {
      room.destroy();
      this.rooms.delete(room.code);
      return undefined;
    }
    return room;
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isExpired()) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}

export type { AssignMode };
