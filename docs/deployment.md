# デプロイ

## Docker

```bash
docker build -t builder-agent-chain .
docker run --rm -p 3001:3001 --env-file .env builder-agent-chain
curl http://127.0.0.1:3001/health
```

## PaaS

`Dockerfile` をビルドできる PaaS に Web Service としてデプロイします。

- Build: Dockerfile
- Port: `PORT`、未指定なら `3001`
- Health check: `/health`
- API mode: same-origin `/api`

## 本番環境変数

```env
NODE_ENV=production
PUBLIC_READONLY_MODE=true
ADMIN_API_TOKEN=<secret>
CORS_ORIGIN=https://your-domain.example
IDEA_CACHE_FILE=/var/lib/builder-agent-chain/idea-cache.json
```

公開 URL が作成されたら、`CORS_ORIGIN` にその URL を設定してください。
