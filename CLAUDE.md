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
AI Engine (LLM API + direct RSS reader)
```

npm workspaces の monorepo:
- `frontend/` — React 18 + Vite + TypeScript
- `backend/` — Express + Zod + PM2 + SSE streaming
- `ai-engine/` — Anthropic SDK + RSS取得 + エージェント群

## 開発

```bash
npm install                    # 全ワークスペースの依存をインストール
npm run dev                    # フロント + バックエンドをセット起動し、proxy → 今回のbackendを検証
npm run backend:dev            # npm run dev と同じセット起動
npm run frontend:dev           # npm run dev と同じセット起動
npm run frontend:dev:solo      # フロント単体起動。VITE_PROXY_TARGET の明示指定が必要
npm run backend:dev:solo       # バックエンド単体起動
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
| `RSS_FEEDS` | No | RSSソースJSON配列。未指定なら既定の主要テックRSS |
| `CORS_ORIGIN` | No | 本番では必須 |
| `SMTP_*` | No | RSS障害通知メール |

## キーとなる挙動

### プロンプト管理
- LLMプロンプトの正本は `ai-engine/src/prompts/catalog.yaml` に置く。
- YAMLには `id`、`version`、`inputs`、`rules`、`output_format`、`messages` を定義し、長い本文はblock scalarのMarkdown/自然文として管理する。
- TypeScript側は `renderPromptRole()` でYAMLを読み込み、検証、素材選択、JSON化、1パスの変数展開だけを担当する。
- コード内に長いプロンプト文言を再定義しない。実行時データ、認可が必要な情報、秘密情報の選別はコード側で行う。
- `secret` と `forbidden` の入力は最終プロンプトへレンダリングしない。YAMLに秘密情報や環境変数値を混ぜない。
- `npm run build --workspace ai-engine` は `dist/prompts/catalog.yaml` をコピーするため、配布時もYAMLカタログを同梱する。

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
