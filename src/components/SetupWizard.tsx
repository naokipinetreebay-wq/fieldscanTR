"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import type { ClientMessage, RoomConfig, RoomSnapshot } from "@/lib/types";
import { COLORS } from "@/lib/types";

const STEPS = ["説明", "端末", "割当", "切替", "確認"] as const;

export function SetupWizard({
  snapshot,
  connected,
  send,
  onDone,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [targetCount, setTargetCount] = useState(4);
  const cfg = snapshot.config;

  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/${snapshot.code}`;
  }, [snapshot.code]);

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  useEffect(() => {
    if (snapshot.displays.length > 0) {
      setTargetCount((t) => Math.max(t, snapshot.displays.length));
    }
  }, [snapshot.displays.length]);

  const maxAlly = Math.max(1, snapshot.displays.length || targetCount || 1);
  const joined = snapshot.displays.length;
  const canLeaveDevices = joined >= 1;

  return (
    <div className="wizard">
      <header className="wizard-top">
        <div>
          <p className="eyebrow">FieldScan · セットアップ</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className={`pill ${connected ? "ok" : "bad"}`}>
          {connected ? "接続中" : "再接続中…"}
        </div>
      </header>

      <ol className="wizard-steps" aria-label="手順">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            <span className="n">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="panel wizard-panel">
        {step === 0 ? (
          <div className="wizard-body">
            <h2>首振りスキャンとは</h2>
            <ul className="explain-list">
              <li>
                <strong>青</strong> … フリーの味方（パスできる）
              </li>
              <li>
                <strong>半分（青＋朱）</strong> … マークされている味方
              </li>
              <li>
                <strong>朱</strong> … 敵／スペースがない
              </li>
            </ul>
            <p className="muted">
              端末を前後左右などに置き、ボールを受ける前後で周囲を見て「フリー」を探す練習です。コーチ端末が色の切替を同期します。
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-body">
            <h2>端末を登録する</h2>
            <p className="muted">目標台数を決め、QRを各スマホ・タブレットで開いてください。</p>
            <label className="field">
              <span>目標台数: {targetCount}</span>
              <input
                type="range"
                min={1}
                max={12}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
              />
            </label>
            <p className="join-meter">
              登録 <strong>{joined}</strong> / 目標 {targetCount}
            </p>
            <div className="qr-wrap">
              {displayUrl ? <QRCodeSVG value={displayUrl} size={168} /> : null}
            </div>
            <p className="mono">{displayUrl}</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigator.clipboard.writeText(displayUrl)}
            >
              URLをコピー
            </button>
            {joined > 0 ? (
              <ul className="device-list" style={{ marginTop: 14 }}>
                {snapshot.displays.map((d) => (
                  <li key={d.id}>
                    <span className="swatch" style={{ background: COLORS.blue }} />
                    <input
                      className="label-input"
                      value={d.label}
                      onChange={(e) =>
                        send({ type: "setLabel", deviceId: d.id, label: e.target.value })
                      }
                      placeholder="前 / 後 / 左 / 右"
                    />
                    <span className={`dot ${d.connected ? "ok" : "bad"}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>
                まだ端末がありません。
              </p>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <h2>割当パラメータ</h2>
            <label className="field">
              <span>モード</span>
              <select
                value={cfg.assignMode}
                onChange={(e) =>
                  patch({ assignMode: e.target.value as RoomConfig["assignMode"] })
                }
              >
                <option value="allyN">味方N台（推奨）</option>
                <option value="fullRandom">完全ランダム</option>
              </select>
            </label>
            {cfg.assignMode === "allyN" ? (
              <>
                <label className="field">
                  <span>味方台数（青系）: {cfg.allyCount}</span>
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
                  マーク（半分）を含める
                </label>
                {cfg.allowMarked ? (
                  <label className="field">
                    <span>マーク台数: {cfg.markedCount}</span>
                    <input
                      type="range"
                      min={0}
                      max={cfg.allyCount}
                      value={Math.min(cfg.markedCount, cfg.allyCount)}
                      onChange={(e) => patch({ markedCount: Number(e.target.value) })}
                    />
                  </label>
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
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <h2>切替と演出</h2>
            <label className="field">
              <span>タイミング</span>
              <select
                value={cfg.timingMode}
                onChange={(e) =>
                  patch({ timingMode: e.target.value as RoomConfig["timingMode"] })
                }
              >
                <option value="fixed">固定秒</option>
                <option value="random">ランダム秒</option>
                <option value="manual">手動のみ</option>
              </select>
            </label>
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
            <label className="field">
              <span>遷移演出</span>
              <select
                value={cfg.transition}
                onChange={(e) =>
                  patch({ transition: e.target.value as RoomConfig["transition"] })
                }
              >
                <option value="instant">即時</option>
                <option value="countdown">カウントダウン</option>
                <option value="blink">点滅</option>
                <option value="fade">フェード</option>
                <option value="random">毎回ランダム</option>
              </select>
            </label>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="wizard-body">
            <h2>準備完了</h2>
            <ul className="summary-list">
              <li>端末 {joined} 台</li>
              <li>
                割当:{" "}
                {cfg.assignMode === "allyN"
                  ? `味方 ${cfg.allyCount} 台`
                  : "完全ランダム"}
              </li>
              <li>
                切替:{" "}
                {cfg.timingMode === "fixed"
                  ? `${cfg.fixedSeconds}秒固定`
                  : cfg.timingMode === "random"
                    ? `${cfg.randomMinSeconds}〜${cfg.randomMaxSeconds}秒`
                    : "手動"}
              </li>
              <li>演出: {cfg.transition}</li>
            </ul>
            <p className="muted">次の画面で開始・停止・再設定ができます。</p>
          </div>
        ) : null}
      </section>

      <footer className="wizard-nav">
        <button
          type="button"
          className="btn"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn primary"
            disabled={step === 1 && !canLeaveDevices}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 1 && !canLeaveDevices ? "端末を1台以上登録" : "次へ"}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onDone}>
            コントローラへ
          </button>
        )}
      </footer>
    </div>
  );
}
