# 開発

## セットアップ

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` は backend と frontend をセットで起動します。frontend の `/api` と `/health` は同じ dev stack の backend に proxy されます。

## 必須環境変数

```env
ZAI_API_KEY=...
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-5-turbo
```

その他の設定は `.env.example` を参照してください。

## コマンド

```bash
npm run lint
npm run test
npm run build
npm run preview:stack
```
