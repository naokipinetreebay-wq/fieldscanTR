"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, DisplayState, RoomSnapshot, TransitionMode } from "@/lib/types";

function stateStyle(state: DisplayState): React.CSSProperties {
  if (state === "free") {
    return { background: COLORS.blue };
  }
  if (state === "enemy") {
    return { background: COLORS.vermilion };
  }
  return {
    background: `linear-gradient(90deg, ${COLORS.blue} 50%, ${COLORS.vermilion} 50%)`,
  };
}

/** Stable 3→2→1 without ceil flicker at second boundaries */
function countdownDigit(remainingMs: number, maxSec: number): number {
  if (remainingMs <= 0) return 1;
  const raw = Math.ceil(remainingMs / 1000);
  return Math.min(maxSec, Math.max(1, raw));
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
  const [now, setNow] = useState(() => Date.now());

  // Lock phase clocks when the round changes (avoid snapshot jitter)
  const phaseRef = useRef({
    roundId: -1,
    leadEnd: 0,
    blackEnd: 0,
    offset: 0,
    lastDigit: 3,
  });

  if (snapshot.roundId !== phaseRef.current.roundId) {
    phaseRef.current = {
      roundId: snapshot.roundId,
      leadEnd: snapshot.transitionEndsAt ?? Date.now(),
      blackEnd: snapshot.blackEndsAt ?? snapshot.transitionEndsAt ?? Date.now(),
      offset: snapshot.serverNow ? Date.now() - snapshot.serverNow : 0,
      lastDigit: 3,
    };
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
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

  const serverNow = now - phaseRef.current.offset;
  const effect = useTransitionEffect(
    snapshot.transition,
    phaseRef.current.leadEnd,
    phaseRef.current.blackEnd,
    serverNow,
    prev,
    next,
    phaseRef
  );

  return (
    <div className="display-root" style={effect.style}>
      {effect.overlay}
    </div>
  );
}

function useTransitionEffect(
  transition: TransitionMode,
  leadEnd: number,
  blackEnd: number,
  serverNow: number,
  prev: DisplayState,
  next: DisplayState,
  phaseRef: React.MutableRefObject<{ lastDigit: number }>
) {
  return useMemo(() => {
    const colorChanged = prev !== next;

    // After transition window: show new color
    if (serverNow >= blackEnd) {
      phaseRef.current.lastDigit = 3;
      return { style: stateStyle(next) as React.CSSProperties, overlay: null as React.ReactNode };
    }

    // Black gap only when color actually changes
    if (serverNow >= leadEnd) {
      if (!colorChanged) {
        return { style: stateStyle(next), overlay: null };
      }
      return { style: { background: "#000000" }, overlay: null };
    }

    const remaining = Math.max(0, leadEnd - serverNow);
    const fadeProgress = 1 - remaining / 1200;
    const base = stateStyle(prev);

    if (transition === "countdown") {
      let digit = countdownDigit(remaining, 3);
      // Monotonic: never go back up (kills 3↔4 flash)
      if (digit > phaseRef.current.lastDigit) {
        digit = phaseRef.current.lastDigit;
      } else {
        phaseRef.current.lastDigit = digit;
      }
      return {
        style: base,
        overlay: <div className="countdown-num">{digit}</div>,
      };
    }

    if (transition === "blink") {
      // Blink to near-black, not washed-out white
      const on = Math.floor(serverNow / 220) % 2 === 0;
      return {
        style: on ? base : { background: "#111111" },
        overlay: null,
      };
    }

    if (transition === "fade") {
      return {
        style: {
          ...base,
          opacity: Math.max(0.2, 1 - Math.min(1, fadeProgress)),
        },
        overlay: null,
      };
    }

    // instant → black only if changing
    if (colorChanged) {
      return { style: { background: "#000000" }, overlay: null };
    }
    return { style: stateStyle(next), overlay: null };
  }, [transition, leadEnd, blackEnd, serverNow, prev, next, phaseRef]);
}
