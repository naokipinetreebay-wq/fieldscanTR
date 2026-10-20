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
  const state = snapshot.primaryStates[deviceId] || "enemy";
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
    serverNow,
    state
  );

  return (
    <div className="display-root" style={effect.style}>
      {effect.overlay}
    </div>
  );
}

function useTransitionEffect(
  transition: TransitionMode,
  endsAt: number | null,
  serverNow: number,
  state: DisplayState
) {
  return useMemo(() => {
    const base = stateStyle(state);
    if (!endsAt || serverNow >= endsAt) {
      return { style: base as React.CSSProperties, overlay: null as React.ReactNode };
    }

    const lead =
      transition === "countdown" ? 2000 : transition === "blink" ? 1600 : transition === "fade" ? 1200 : 0;
    const remaining = Math.max(0, endsAt - serverNow);
    const progress = lead > 0 ? 1 - remaining / lead : 1;

    if (transition === "countdown") {
      const sec = Math.max(1, Math.ceil(remaining / 1000));
      return {
        style: base,
        overlay: <div className="countdown-num">{sec}</div>,
      };
    }

    if (transition === "blink") {
      const on = Math.floor(serverNow / 200) % 2 === 0;
      return {
        style: {
          ...base,
          opacity: on ? 1 : 0.25,
        },
        overlay: null,
      };
    }

    if (transition === "fade") {
      return {
        style: {
          ...base,
          opacity: Math.max(0.15, 1 - progress),
        },
        overlay: null,
      };
    }

    return { style: base, overlay: null };
  }, [transition, endsAt, serverNow, state]);
}
