# Builder Agent Chain

エンジニアが訪問すると、技術トレンドをもとに「個人で作れそうなプロダクト案」や「開発すると参考になりそうなツール案」を確認できるサイト。

- `作るもの提案`: 個人開発で検証しやすいプロダクト案を表示
- `トレンド`: サブページで各種ニュースサイトの技術トレンドや関連記事を紹介

## 公開運用向けの設定

- `PUBLIC_READONLY_MODE=true`: 訪問者アクセスでは自動生成・再取得せず、キャッシュ済みデータだけを表示
- `ADMIN_API_TOKEN=...`: `Authorization: Bearer ...` 付きの管理リクエストだけ再生成・再取得・AI絞り込みを許可
- `IDEA_CACHE_FILE=.tmp/idea-cache.json`: アイデアとトレンドのキャッシュをファイルに永続化
- `IDEA_CACHE_TTL_HOURS=24`: キャッシュの有効時間。公開モードのデフォルトは24時間
- `IDEA_WARMUP_ON_START=true`: サーバー起動時にキャッシュが空/期限切れならバックグラウンド生成
- `IDEA_BACKGROUND_REFRESH_HOURS=12`: 指定した時間ごとに、表示中のキャッシュを残したままバックグラウンド再生成（未設定/0なら定期更新なし）
- `CORS_ORIGIN=https://your-site.example.com`: APIを別ドメインで公開する場合、ブラウザからの許可元をカンマ区切りで指定
