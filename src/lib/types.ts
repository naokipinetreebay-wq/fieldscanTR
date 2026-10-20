export type DisplayState = "free" | "marked" | "enemy";
export type TransitionMode = "instant" | "countdown" | "blink" | "fade";
export type TimingMode = "fixed" | "random" | "manual";
export type AssignMode = "allyN" | "fullRandom";
export type SyncMode = "simultaneous" | "staggered";
export type Role = "controller" | "display";

export interface RoomConfig {
  assignMode: AssignMode;
  allyCount: number;
  allowMarked: boolean;
  markedCount: number;
  forbidZeroAlly: boolean;
  timingMode: TimingMode;
  fixedSeconds: number;
  randomMinSeconds: number;
  randomMaxSeconds: number;
  /** simultaneous = all devices flip together; staggered = per-device random delay */
  syncMode: SyncMode;
  /** Max random delay (seconds) when syncMode is staggered */
  staggerMaxSeconds: number;
  transition: TransitionMode | "random";
  running: boolean;
}

export interface DisplayInfo {
  id: string;
  label: string;
  state: DisplayState;
  connected: boolean;
}

export interface RoomSnapshot {
  code: string;
  config: RoomConfig;
  displays: DisplayInfo[];
  roundId: number;
  primaryStates: Record<string, DisplayState>;
  previousStates: Record<string, DisplayState>;
  /** Per-device delay (ms) before that device starts its transition this round */
  deviceOffsets: Record<string, number>;
  nextChangeAt: number | null;
  transition: TransitionMode;
  /** End of countdown/blink/fade on the previous color */
  transitionEndsAt: number | null;
  /** End of black gap; after this, primaryStates are shown */
  blackEndsAt: number | null;
  serverNow: number;
}

export type ClientMessage =
  | { type: "hello"; role: Role; deviceId: string; label?: string }
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "setLabel"; deviceId: string; label: string }
  | { type: "start" }
  | { type: "stop" }
  | { type: "next" }
  | { type: "ping" };

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "error"; message: string }
  | { type: "pong" };

export const DEFAULT_CONFIG: RoomConfig = {
  assignMode: "allyN",
  allyCount: 1,
  allowMarked: true,
  /** 味方のうち半分マークにする台数（allowMarked 時は 1 以上推奨） */
  markedCount: 1,
  forbidZeroAlly: true,
  timingMode: "random",
  fixedSeconds: 3,
  randomMinSeconds: 2,
  randomMaxSeconds: 5,
  syncMode: "simultaneous",
  staggerMaxSeconds: 2,
  transition: "countdown",
  running: false,
};

export const COLORS = {
  blue: "#1E6BFF",
  vermilion: "#993333",
} as const;
