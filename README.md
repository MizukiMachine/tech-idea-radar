# Builder Agent Chain

エンジニアが訪問すると、技術トレンドをもとに「個人で作れそうなプロダクト案」や「開発すると参考になりそうなツール案」を確認できるサイト。

- `作るもの提案`: 個人開発で検証しやすいプロダクト案を表示
- `トレンド`: サブページで各種ニュースサイトの技術トレンドや関連記事を紹介

## 公開運用向けの設定

- `PUBLIC_READONLY_MODE=true`: 訪問者アクセスでは自動生成・再取得せず、キャッシュ済みデータだけを表示
- `ADMIN_API_TOKEN=...`: `Authorization: Bearer ...` 付きの管理リクエストだけ再生成・再取得を許可
- `IDEA_CACHE_FILE=.tmp/idea-cache.json`: アイデアとトレンドのキャッシュをファイルに永続化
- `IDEA_CACHE_TTL_HOURS=24`: キャッシュの有効時間。公開モードのデフォルトは24時間
- `X_ENRICHMENT_ENABLED=false`: X APIを使わずRSS-onlyで生成
