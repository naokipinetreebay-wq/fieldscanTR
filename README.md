# FieldScan TR — 首振りスキャン

複数端末を同期し、緑（フリー）／半分（マーク）／赤（敵）を表示するサッカートレーニング用Webアプリです。

姉妹アプリ（チーム色ゴール）は同階層の `randomgoalgameTR` です。

## 公開 URL

| 役割 | URL |
|------|-----|
| ポータル | https://tr.rojiura.app |
| 本アプリ | https://tr.rojiura.app/fieldscan/ |
| ルーム／WS | https://tr-api.rojiura.app |

旧ホスト `https://fieldscan.rojiura.app` は新 URL へ 301 します。

## 起動（ローカル）

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開き、「ルームを作成」。Display は QR または `/d/?code=`。

## 本番ビルド（Pages 用）

```bash
npm run build
```

静的 export（`basePath: /fieldscan`）を `trwebapp` 配下へ載せて Pages デプロイします。詳細は `trwebapp/README.md`。
