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

  let round: PlayRound = pkg.rounds[0];
  for (const r of pkg.rounds) {
    if (r.roundStartedAt <= estNow) round = r;
    else break;
  }

  return {
    roundId: round.roundId,
    primaryStates: round.states,
    previousStates: round.previousStates,
    deviceOffsets: round.deviceOffsets,
    transition: round.transition,
    roundStartedAt: round.roundStartedAt,
    nextChangeAt: round.nextChangeAt,
    usingPackage: true,
  };
}
