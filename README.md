# FieldScan TR — 首振りスキャン

複数端末を同期し、青（フリー）／半分（マーク）／朱（敵）を表示するサッカートレーニング用Webアプリです。

姉妹アプリ（チーム色ゴール）は同階層の `randomgoalgameTR` です。

## 公開URL案（TRwebapp）

| 役割 | URL |
|------|-----|
| ポータル | https://tr.rojiura.app |
| 本アプリ | https://fieldscan.rojiura.app |

ポータルから各トレーニングアプリへ誘導する想定です。

## 起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開き、「ルームを作成」。DisplayはQRまたは `/d/コード`。

同時にゴールゲームも起動する場合:

```bash
# fieldscanTR
PORT=3000 npm run dev
# randomgoalgameTR
PORT=3001 npm run dev
```

## 本番

```bash
npm run build
npm start
```

単一プロセスで HTTP + WebSocket を待ち受けます（`PORT` 環境変数対応）。

## 使い方（要点）

1. コーチ端末でルーム作成 → コントローラ
2. 周囲の端末で Display URL を開く
3. 味方台数・タイミング・遷移を設定して開始
