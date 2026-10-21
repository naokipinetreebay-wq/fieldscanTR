"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { SessionExit } from "@/components/SessionExit";
import type { ClientMessage, DisplayState, RoomConfig, RoomSnapshot } from "@/lib/types";
import { COLORS } from "@/lib/types";

export function ControllerPanel({
  snapshot,
  connected,
  send,
  clearSessionKeys,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  clearSessionKeys?: string[];
}) {
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/${snapshot.code}`;
  }, [snapshot.code]);

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  const maxAlly = Math.max(1, snapshot.displays.length || 1);
  const manualPick = cfg.timingMode === "manual" && cfg.manualAssign === "pick";
  const [picks, setPicks] = useState<Record<string, DisplayState>>({});

  const switchNow = () => {
    if (manualPick) {
      const states: Record<string, DisplayState> = {};
      for (const d of snapshot.displays) states[d.id] = picks[d.id] ?? d.state;
      send({ type: "next", states });
      return;
    }
    send({ type: "next" });
  };

  return (
    <div className="controller">
      <header className="controller-header">
        <div>
          <p className="eyebrow">FieldScan / 首振り</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className={`pill ${connected ? "ok" : "bad"}`}>
          {connected ? "接続中" : "再接続中…"}
        </div>
      </header>

      <section className="grid-2">
        <div className="panel">
          <h2>Display参加</h2>
          <p className="muted">台数: {snapshot.displays.length}</p>
          <div className="qr-wrap">
            {displayUrl ? <QRCodeSVG value={displayUrl} size={160} /> : null}
          </div>
          <p className="mono url">{displayUrl}</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => navigator.clipboard.writeText(displayUrl)}
          >
            URLをコピー
          </button>
        </div>

        <div className="panel">
          <h2>操作</h2>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => send({ type: "start" })}>
              開始
            </button>
            {cfg.timingMode === "manual" && !manualPick ? (
              <button type="button" className="btn" onClick={switchNow}>
                切り替え
              </button>
            ) : null}
            {cfg.timingMode !== "manual" ? (
              <button type="button" className="btn" onClick={switchNow}>
                次へ
              </button>
            ) : null}
            <button type="button" className="btn danger" onClick={() => send({ type: "stop" })}>
              一時停止
            </button>
          </div>
          <p className="muted">
            状態: {cfg.running ? "ランニング" : "停止"} / ラウンド #{snapshot.roundId}
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>割当</h2>
        <label className="field">
          <span>モード</span>
          <select
            value={cfg.assignMode}
            onChange={(e) =>
              patch({ assignMode: e.target.value as RoomConfig["assignMode"] })
            }
          >
            <option value="allyN">味方N台</option>
            <option value="fullRandom">完全ランダム</option>
          </select>
        </label>

        {cfg.assignMode === "allyN" ? (
          <>
            <label className="field">
              <span>味方台数（緑）: {cfg.allyCount}</span>
              <input
                type="range"
                min={1}
                max={maxAlly}
                value={Math.min(cfg.allyCount, maxAlly)}
                onChange={(e) => patch({ allyCount: Number(e.target.value) })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={cfg.allowMarked}
                onChange={(e) => patch({ allowMarked: e.target.checked })}
              />
              半分マーク（緑／赤）をランダムに混ぜる
            </label>
            {cfg.allowMarked ? (
              <p className="muted">切り替わるたびに、半分にする台数はランダムです。</p>
            ) : null}
          </>
        ) : (
          <label className="check">
            <input
              type="checkbox"
              checked={cfg.forbidZeroAlly}
              onChange={(e) => patch({ forbidZeroAlly: e.target.checked })}
            />
            味方0台を禁止
          </label>
        )}
      </section>

      <section className="panel">
        <h2>タイミング</h2>
        <label className="field">
          <span>切替</span>
          <select
            value={cfg.timingMode}
            onChange={(e) =>
              patch({ timingMode: e.target.value as RoomConfig["timingMode"] })
            }
          >
            <option value="fixed">固定秒</option>
            <option value="random">ランダム秒</option>
            <option value="manual">手動のみ（切り替えボタン）</option>
          </select>
        </label>
        {cfg.timingMode === "manual" ? (
          <>
            <label className="field">
              <span>手動の中身</span>
              <select
                value={cfg.manualAssign || "random"}
                onChange={(e) =>
                  patch({ manualAssign: e.target.value as RoomConfig["manualAssign"] })
                }
              >
                <option value="random">ランダム表示（タイミングだけボタン）</option>
                <option value="pick">色を指定して切り替え</option>
              </select>
            </label>
            <p className="muted">
              {manualPick
                ? "各端末の色を選んで「切り替え」を押すと、その色になります。"
                : "色は毎回ランダムです。「切り替え」を押したときだけ表示が変わります。"}
            </p>
          </>
        ) : null}
        {cfg.timingMode === "fixed" ? (
          <label className="field">
            <span>秒数: {cfg.fixedSeconds}</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={cfg.fixedSeconds}
              onChange={(e) => patch({ fixedSeconds: Number(e.target.value) })}
            />
          </label>
        ) : null}
        {cfg.timingMode === "random" ? (
          <div className="row">
            <label className="field">
              <span>最小 {cfg.randomMinSeconds}s</span>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={cfg.randomMinSeconds}
                onChange={(e) => patch({ randomMinSeconds: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>最大 {cfg.randomMaxSeconds}s</span>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={cfg.randomMaxSeconds}
                onChange={(e) => patch({ randomMaxSeconds: Number(e.target.value) })}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>遷移</h2>
        <label className="field">
          <span>演出</span>
          <select
            value={cfg.transition}
            onChange={(e) =>
              patch({ transition: e.target.value as RoomConfig["transition"] })
            }
          >
            <option value="instant">即時</option>
            <option value="countdown">カウントダウン（残り秒）</option>
            <option value="blink">点滅（後半＝残り半分）</option>
            <option value="fade">フェード（表示直後から）</option>
            <option value="random">毎回ランダム</option>
          </select>
        </label>
        <label className="field">
          <span>切替音</span>
          <select
            value={cfg.sound || "off"}
            onChange={(e) => patch({ sound: e.target.value as RoomConfig["sound"] })}
          >
            <option value="off">音なし</option>
            <option value="on">音あり（ぴっ）</option>
          </select>
        </label>
        <label className="field">
          <span>端末どうしの切替</span>
          <select
            value={cfg.syncMode || "simultaneous"}
            onChange={(e) =>
              patch({ syncMode: e.target.value as RoomConfig["syncMode"] })
            }
          >
            <option value="simultaneous">いっせい（全端末同時）</option>
            <option value="staggered">ランダム（端末ごとにずれる）</option>
          </select>
        </label>
        {(cfg.syncMode || "simultaneous") === "staggered" ? (
          <label className="field">
            <span>最大ずれ: {cfg.staggerMaxSeconds ?? 2}秒</span>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={cfg.staggerMaxSeconds ?? 2}
              onChange={(e) => patch({ staggerMaxSeconds: Number(e.target.value) })}
            />
          </label>
        ) : null}
      </section>

      <section className="panel">
        <h2>参加端末</h2>
        {snapshot.displays.length === 0 ? (
          <p className="muted">まだDisplayがありません。QRを読み取ってください。</p>
        ) : (
          <>
            <p className="muted">
              いま: 緑フル{" "}
              {snapshot.displays.filter((d) => d.state === "free").length} / 半分{" "}
              {snapshot.displays.filter((d) => d.state === "marked").length} / 敵{" "}
              {snapshot.displays.filter((d) => d.state === "enemy").length}
              {"  "}
              （設定: 味方{cfg.allyCount}
              {cfg.allowMarked ? "・半分マークはランダム" : ""}）
            </p>
            <ul className={`device-list${manualPick ? " picking" : ""}`}>
              {snapshot.displays.map((d) => {
                const chosen = picks[d.id] ?? d.state;
                return (
                  <li key={d.id}>
                    <span
                      className="swatch"
                      style={
                        d.state === "free"
                          ? { background: COLORS.blue }
                          : d.state === "enemy"
                            ? { background: COLORS.vermilion }
                            : {
                                background: `linear-gradient(90deg, ${COLORS.blue} 50%, ${COLORS.vermilion} 50%)`,
                              }
                      }
                    />
                    <input
                      className="label-input"
                      value={d.label}
                      onChange={(e) =>
                        send({ type: "setLabel", deviceId: d.id, label: e.target.value })
                      }
                      placeholder="名前"
                    />
                    {manualPick ? (
                      <div className="color-toggles" role="group" aria-label={`${d.label}の色`}>
                        {(
                          [
                            ["free", "緑"],
                            ["enemy", "赤"],
                            ["marked", "半分"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={`color-toggle${chosen === value ? ` on on-${value}` : ""}`}
                            onClick={() =>
                              setPicks((prev) => ({ ...prev, [d.id]: value }))
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="state-tag">
                        {d.state === "free" ? "緑" : d.state === "marked" ? "半分" : "赤"}
                      </span>
                    )}
                    <span className={`dot ${d.connected ? "ok" : "bad"}`} />
                  </li>
                );
              })}
            </ul>
            {manualPick ? (
              <button type="button" className="btn primary switch-near" onClick={switchNow}>
                切り替え
              </button>
            ) : null}
          </>
        )}
      </section>

      <SessionExit
        onStop={() => send({ type: "stop" })}
        clearSessionKeys={clearSessionKeys}
      />
    </div>
  );
}
