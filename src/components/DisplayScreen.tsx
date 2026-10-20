"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, DisplayState, RoomSnapshot, TransitionMode } from "@/lib/types";

const COUNTDOWN_MS = 3000;
const BLACK_MS = 280;

function stateStyle(state: DisplayState): React.CSSProperties {
  if (state === "free") return { background: COLORS.blue };
  if (state === "enemy") return { background: COLORS.vermilion };
  return {
    background: `linear-gradient(90deg, ${COLORS.blue} 50%, ${COLORS.vermilion} 50%)`,
  };
}

/**
 * 3 → 2 → 1, each held for exactly 1 second (local clock).
 * elapsed 0–999 → 3, 1000–1999 → 2, 2000–2999 → 1
 */
function digitForElapsed(elapsedMs: number): number {
  if (elapsedMs < 1000) return 3;
  if (elapsedMs < 2000) return 2;
  return 1;
}

export function DisplayScreen({
  snapshot,
  deviceId,
}: {
  snapshot: RoomSnapshot;
  deviceId: string;
}) {
  const next = snapshot.primaryStates[deviceId] || "enemy";
  const prev = snapshot.previousStates?.[deviceId] ?? next;
  const colorChanged = prev !== next;

  const phaseRef = useRef({
    roundId: -1,
    localStart: 0,
    transition: "instant" as TransitionMode,
  });

  if (snapshot.roundId !== phaseRef.current.roundId) {
    phaseRef.current = {
      roundId: snapshot.roundId,
      localStart: Date.now(),
      transition: snapshot.transition,
    };
  }

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 50);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let wake: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          wake = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* ignore */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wake?.release().catch(() => undefined);
    };
  }, []);

  const { localStart, transition } = phaseRef.current;
  const elapsed = Math.max(0, Date.now() - localStart);

  const leadMs =
    transition === "countdown"
      ? COUNTDOWN_MS
      : transition === "blink"
        ? 1600
        : transition === "fade"
          ? 1200
          : 0;
  const blackStart = leadMs;
  const blackEnd = leadMs + (colorChanged ? BLACK_MS : 0);

  let style: React.CSSProperties = stateStyle(next);
  let overlay: React.ReactNode = null;

  if (elapsed < leadMs) {
    // Still on previous color + effect
    style = stateStyle(prev);
    if (transition === "countdown") {
      const digit = digitForElapsed(elapsed);
      overlay = <div className="countdown-num">{digit}</div>;
    } else if (transition === "blink") {
      const on = Math.floor(elapsed / 220) % 2 === 0;
      style = on ? stateStyle(prev) : { background: "#111111" };
    } else if (transition === "fade") {
      style = {
        ...stateStyle(prev),
        opacity: Math.max(0.2, 1 - elapsed / leadMs),
      };
    }
  } else if (elapsed < blackEnd && colorChanged) {
    style = { background: "#000000" };
  } else {
    style = stateStyle(next);
  }

  return (
    <div className="display-root" style={style}>
      {overlay}
    </div>
  );
}
