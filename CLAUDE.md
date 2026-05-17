# Builder Agent Chain

AI Build Radar — 技術ニュース/RSSからプロダクト仮説を自動生成するプラットフォーム。

## アーキテクチャ

```
Frontend (Vite/React SPA)
  ↓ same-origin /api
Nginx (静的配信 + SSEリバプロ)
  ↓ proxy_pass
Backend (Express, port 3001, PM2管理)
  ↓
AI Engine (LLM API + MCP RSS scout)
```

npm workspaces の monorepo:
- `frontend/` — React 18 + Vite + TypeScript
- `backend/` — Express + Zod + PM2 + SSE streaming
- `ai-engine/` — Anthropic SDK + MCP SDK + エージェント群

## 開発

```bash
npm install                    # 全ワークスペースの依存をインストール
npm run backend:dev            # バックエンド開発サーバー (port 3001)
npm run frontend:dev           # フロントエンド開発サーバー (port 5173, proxy → 3001)
npm run frontend:dev:5180      # ポート5180で起動 (proxy → 3010)
npm run backend:dev:3010       # ポート3010で起動
npm run build                  # 全ワークスペースビルド
npm run test                   # 全ワークスペーステスト (Vitest)
npm run lint                   # 全ワークスペースlint
```

## 環境変数

`backend/.env` に配置（.gitignore済み）。テンプレートは `.env.example`。

| 変数 | 必須 | 説明 |
|---|---|---|
| `PORT` | No | デフォルト 3001 |
| `ZAI_API_KEY` | Yes | LLM APIキー (ZAI/GLM) |
| `LLM_BASE_URL` | No | デフォルト https://api.z.ai/api/anthropic |
| `LLM_MODEL` | No | デフォルト glm-5-turbo |
| `PUBLIC_READONLY_MODE` | No | 公開閲覧モード |
| `ADMIN_API_TOKEN` | No | 管理操作用トークン |
| `IDEA_CACHE_FILE` | No | 永続キャッシュファイルパス |
| `IDEA_WARMUP_ON_START` | No | 起動時ウォームアップ (デフォルト true) |
| `CORS_ORIGIN` | No | 本番では必須 |
| `SMTP_*` | No | RSS障害通知メール |

## キーとなる挙動

### バッチスケジューラ
- JST 0, 4, 8, 12, 16, 20時 に自動生成 (1日6回)
- 最大4バッチ保持 (約60アイデア)
- 同一スロットのバッチは置き換え
- トレンドキャッシュTTL: 4時間

### キャッシュ
- インメモリ + ファイル永続化 (IDEA_CACHE_FILE指定時)
- v1→v2 マイグレーション対応済み
- グレースフルシャットダウン時に flush

### SSE ストリーミング
- `GET /api/ai/ideas/stream` — アイデア生成のリアルタイム配信
- `POST /api/ai/ideas/refresh` — 強制再生成
- nginx で `proxy_buffering off` + `X-Accel-Buffering: no`

### 公開モード
- `PUBLIC_READONLY_MODE=true` で閲覧専用
- 書き込み系APIは `Authorization: Bearer <token>` または `X-Admin-Token` ヘッダーが必要

## デプロイ

```bash
./deploy/deploy.sh                          # 手動デプロイ
# DEPLOY_DIR=/path/to/dir ./deploy/deploy.sh  # デプロイ先変更可能
```

- PM2 でプロセス管理 (`ecosystem.config.cjs`)
- Nginx テンプレート: `deploy/nginx.conf.template`
- SSL: certbot 推奨

## テスト

各ワークスペースで Vitest 使用。フロントエンドは jsdom 環境。

## API エンドポイント

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | `/api/ai/ideas` | No | キャッシュ済みアイデア一覧 |
| GET | `/api/ai/ideas/meta` | No | ランタイムメタデータ |
| GET | `/api/ai/ideas/stream` | Admin* | SSE アイデアストリーム |
| POST | `/api/ai/ideas/refresh` | Admin | SSE 強制再生成 |
| POST | `/api/ai/ideas/filter` | Admin* | LLM意味検索 |
| GET | `/api/ai/trends` | No | トレンド取得 |
| POST | `/api/ai/trends/refresh` | Admin | トレンド強制再取得 |
| GET | `/health` | No | ヘルスチェック |

* キャッシュがあれば認証なしで読める
