"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom } from "@/lib/ws";

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom();
      router.push(`/r/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      setBusy(false);
    }
  };

  return (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">FieldScan · TRwebapp</p>
        <h1>首振りスキャン</h1>
        <p>
          フィールド周囲の端末を同期し、青＝フリー／朱＝敵を切り替えて首振りを鍛えます。
        </p>
        <div className="home-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={onCreate}>
            {busy ? "作成中…" : "ルームを作成"}
          </button>
          <a className="btn" href="https://tr.rojiura.app">
            ポータル（tr）に戻る
          </a>
        </div>
        {error ? (
          <p className="muted" style={{ marginTop: 12, color: "var(--bad)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
