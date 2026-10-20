"use client";

import { useEffect, useMemo, useState } from "react";
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
  const clockOffset = snapshot.serverNow ? Date.now() - snapshot.serverNow : 0;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 50);
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

  const serverNow = now - clockOffset;
  const effect = useTransitionEffect(
    snapshot.transition,
    snapshot.transitionEndsAt,
    snapshot.blackEndsAt,
    serverNow,
    prev,
    next
  );

  return (
    <div className="display-root" style={effect.style}>
      {effect.overlay}
    </div>
  );
}

function useTransitionEffect(
  transition: TransitionMode,
  transitionEndsAt: number | null,
  blackEndsAt: number | null,
  serverNow: number,
  prev: DisplayState,
  next: DisplayState
) {
  return useMemo(() => {
    const leadEnd = transitionEndsAt ?? 0;
    const blackEnd = blackEndsAt ?? leadEnd;

    // After black gap: show new color
    if (!blackEndsAt || serverNow >= blackEnd) {
      return { style: stateStyle(next) as React.CSSProperties, overlay: null as React.ReactNode };
    }

    // Black gap between previous and next
    if (serverNow >= leadEnd) {
      return { style: { background: "#000000" }, overlay: null };
    }

    // Pre-transition on previous color
    const lead =
      transition === "countdown" ? 3000 : transition === "blink" ? 1600 : transition === "fade" ? 1200 : 0;
    const remaining = Math.max(0, leadEnd - serverNow);
    const progress = lead > 0 ? 1 - remaining / lead : 1;
    const base = stateStyle(prev);

    if (transition === "countdown" && lead > 0) {
      const sec = Math.max(1, Math.ceil(remaining / 1000));
      return {
        style: base,
        overlay: <div className="countdown-num">{sec}</div>,
      };
    }

    if (transition === "blink") {
      const on = Math.floor(serverNow / 200) % 2 === 0;
      return { style: { ...base, opacity: on ? 1 : 0.2 }, overlay: null };
    }

    if (transition === "fade") {
      return {
        style: { ...base, opacity: Math.max(0.12, 1 - progress) },
        overlay: null,
      };
    }

    // instant: fall through to black as soon as lead is 0
    return { style: { background: "#000000" }, overlay: null };
  }, [transition, transitionEndsAt, blackEndsAt, serverNow, prev, next]);
}
