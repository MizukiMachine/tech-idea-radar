# Builder Agent Chain

技術ニュースのRSSをもとに、エンジニア向けのプロダクト仮説や作ると面白そうなツール案を表示するアプリです。

## 主な機能

- `トレンド`: RSSから取得した技術記事、注目キーワード、記事要約を確認できます。
- `作るもの提案`: RSS記事を根拠にしたプロダクト案を確認できます。
- 管理者操作や定期更新で、新しいRSS記事を集めてアイデアを追加します。
- 公開運用では、訪問者が勝手にAI生成やRSS再取得を実行しないようにできます。
- RSS記事が取得できない場合は、LLMの一般知識だけで生成せず、既存キャッシュを維持します。

## RSSトレンドの扱い

RSSは単発の記事一覧としてではなく、継続観測する情報として扱います。

1. 設定されたRSSフィードを並列数を抑えて取得します。
2. 取得結果は短時間キャッシュし、同じフィードへの連続アクセスを減らします。
3. 取得した記事はタイトル、URL、配信元、公開日時、概要をもとに正規化します。
4. 記事ごとに初回観測日時と最終観測日時を記録します。
5. 直近の観測履歴から、話題を `new` / `spiking` / `continuing` に分類します。

これにより、フロントエンドでは単なる新着記事だけでなく、「新しく出てきた話題」「複数ソースで急に増えている話題」「継続して出ている話題」を表示できます。

## RSS観測履歴

`RSS_OBSERVATIONS_FILE` を指定すると、RSS記事の観測履歴をJSONで保存します。未指定の場合はプロセス内メモリだけで保持します。

保存する主な情報:

- 記事の識別子
- タイトル、URL、配信元
- 公開日時
- 初回観測日時
- 最終観測日時
- 概要
- トピックキー

デフォルトでは、直近24時間、最大5000件、1ソースあたり最大500件を保持します。

## よく使う設定

- `PUBLIC_READONLY_MODE=true`: 公開アクセスではキャッシュ済みデータだけを表示します。
- `ADMIN_API_TOKEN=...`: 管理者だけが再取得や再生成を実行できるようにします。
- `IDEA_CACHE_FILE=.tmp/idea-cache.json`: アイデアとトレンドのキャッシュを保存します。
- `RSS_FEEDS='[{"name":"Hacker News","url":"https://hnrss.org/frontpage"}]'`: 取得するRSSフィードを指定します。
- `RSS_OBSERVATIONS_FILE=.tmp/rss-observations.json`: RSS観測履歴をJSONで保存します。
- `RSS_OBSERVATION_RETENTION_HOURS=24`: RSS観測履歴の保持時間を指定します。
- `RSS_FETCH_CONCURRENCY=3`: RSSフィードの同時取得数を指定します。
- `RSS_MAX_RELATED_ARTICLES=18`: トレンド表示やアイデア生成に使う記事数を指定します。

## 開発

```bash
npm install
npm run dev
npm run build
npm run test
```

`npm run dev` はバックエンドとフロントエンドをセットで起動します。既定ではバックエンドを `127.0.0.1:3010`、フロントエンドを `127.0.0.1:5180` で起動し、フロントエンドの `/api` と `/health` が今回起動したバックエンドに向いていることを確認してからURLを表示します。
ローカル開発中は dev stack id をフロントエンド、Vite proxy、バックエンドで照合します。別プロセスや古いモックAPIに向いた場合は、ブラウザ内のAPIクライアントとバックエンドの両方で拒否します。また、別ポートに古い `builder-agent-chain` の待受プロセスが残っている場合は起動を止めます。意図的に複数スタックを並行起動する場合だけ `BAC_ALLOW_STALE_BUILDER_PROCESSES=true` を指定してください。フロント単体で起動する場合は `BAC_ALLOW_FRONTEND_SOLO=true` と `VITE_PROXY_TARGET` を明示してください。

静的ビルドやプレビューでも、誤接続を避けるため `VITE_API_BASE_URL` を焼き込むビルドは既定で失敗します。通常は同一オリジンの `/api` proxy を使ってください。別オリジンの本番・ステージングAPIを意図的に使う場合だけ、完全一致するURLを `VITE_ALLOWED_API_BASES` に追加します。プレビューは raw `vite preview` ではなく、dev-stack header を付けてバックエンドを検証する `npm run preview:stack` を使ってください。`npm run dev` が起動中なら、`preview:stack` は `.tmp/dev-stack.json` から現在のバックエンドと stack id を自動で読みます。
