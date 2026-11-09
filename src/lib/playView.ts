import type {
  DisplayState,
  PlayRound,
  RoomSnapshot,
  TransitionMode,
} from "./types";

export type FieldPlayView = {
  roundId: number;
  primaryStates: Record<string, DisplayState>;
  previousStates: Record<string, DisplayState>;
  deviceOffsets: Record<string, number>;
  transition: TransitionMode;
  roundStartedAt: number | null;
  nextChangeAt: number | null;
  usingPackage: boolean;
};

/** パッケージがあるときは端末時計で該当ラウンドを選ぶ。なければスナップショットそのまま。 */
export function resolvePlayView(snapshot: RoomSnapshot, estNow: number): FieldPlayView {
  const pkg = snapshot.playPackage;
  if (!pkg?.rounds.length || !snapshot.config.running) {
    return {
      roundId: snapshot.roundId,
      primaryStates: snapshot.primaryStates,
      previousStates: snapshot.previousStates,
      deviceOffsets: snapshot.deviceOffsets,
      transition: snapshot.transition,
      roundStartedAt: snapshot.roundStartedAt,
      nextChangeAt: snapshot.nextChangeAt,
      usingPackage: false,
    };
  }

  const first = pkg.rounds[0];
  const last = pkg.rounds[pkg.rounds.length - 1];
  const span = Math.max(1, last.nextChangeAt - first.roundStartedAt);
  let t = estNow;
  if (estNow > last.nextChangeAt) {
    const elapsed = estNow - first.roundStartedAt;
    t = first.roundStartedAt + (elapsed % span);
  }

  let round: PlayRound = first;
  for (const r of pkg.rounds) {
    if (r.roundStartedAt <= t) round = r;
    else break;
  }

  const loopOffset =
    estNow > last.nextChangeAt
      ? Math.floor((estNow - first.roundStartedAt) / span) * span
      : 0;

  return {
    roundId: round.roundId,
    primaryStates: round.states,
    previousStates: round.previousStates,
    deviceOffsets: round.deviceOffsets,
    transition: round.transition,
    roundStartedAt: round.roundStartedAt + loopOffset,
    nextChangeAt: round.nextChangeAt + loopOffset,
    usingPackage: true,
  };
}
