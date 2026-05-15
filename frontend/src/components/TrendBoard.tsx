import type { RssArticle, TrendScan, XDemandSignal, XTrendingTopic } from '../api/ai';
import XPostEmbed from './XPostEmbed';
import './TrendBoard.css';

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function categoryLabel(category: XDemandSignal['needCategory']): string {
  const labels: Record<XDemandSignal['needCategory'], string> = {
    want: '欲しい',
    frustration: '不満',
    problem: '課題',
    wish: '誰か作って',
  };
  return labels[category];
}

function compactText(text: string, max = 170): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function articleUrl(article: RssArticle): string {
  return article.url || article.link;
}

interface TrendBoardProps {
  trends: TrendScan | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenIdeas: () => void;
  onUseSignal: (query: string) => void;
}

export default function TrendBoard({
  trends,
  loading,
  error,
  onRefresh,
  onOpenIdeas,
  onUseSignal,
}: TrendBoardProps): JSX.Element {
  const rssArticles = trends?.rssContext.relatedArticles ?? [];
  const demandSignals = trends?.xContext.demandSignals ?? [];
  const xTopics = trends?.xContext.trendingTopics ?? [];
  const keywords = trends?.rssContext.trendingKeywords ?? [];
  const sourceSummary = trends?.sourceSummary;
  const totalSignals = rssArticles.length + demandSignals.length + xTopics.length;

  return (
    <section className="trend-board">
      <div className="trend-board__toolbar">
        <div>
          <p className="trend-board__eyebrow">Today signal scan</p>
          <h2 className="trend-board__title">今日のAI開発シグナル</h2>
        </div>
        <div className="trend-board__actions">
          <button type="button" className="trend-board__secondary-btn" onClick={onRefresh} disabled={loading}>
            {loading ? '取得中...' : '再取得'}
          </button>
          <button type="button" className="trend-board__primary-btn" onClick={onOpenIdeas}>
            アイデアを見る
          </button>
        </div>
      </div>

      {error && (
        <div className="trend-board__error">
          <strong>トレンド取得に失敗しました。</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="trend-board__stats">
        <div className="trend-board__stat">
          <span className="trend-board__stat-label">RSS記事</span>
          <strong>{sourceSummary?.rssItemCount ?? rssArticles.length}</strong>
        </div>
        <div className="trend-board__stat">
          <span className="trend-board__stat-label">Xシグナル</span>
          <strong>{sourceSummary?.xSignalCount ?? demandSignals.length + xTopics.length}</strong>
        </div>
        <div className="trend-board__stat">
          <span className="trend-board__stat-label">需要投稿</span>
          <strong>{demandSignals.length}</strong>
        </div>
        <div className="trend-board__stat">
          <span className="trend-board__stat-label">最終取得</span>
          <strong>{formatDate(trends?.generatedAt)}</strong>
        </div>
      </div>

      {loading && !trends && (
        <div className="trend-board__loading">
          <span className="trend-board__spinner" />
          <div>
            <h3>RSS と X を取得しています</h3>
            <p>取得できたシグナルから、アイデア化しやすい課題を並べます。</p>
          </div>
        </div>
      )}

      {!loading && trends && totalSignals === 0 && (
        <div className="trend-board__empty">
          <h3>表示できるシグナルがありません</h3>
          <p>RSS または X の接続設定を確認して、再取得してください。</p>
        </div>
      )}

      {trends && totalSignals > 0 && (
        <div className="trend-board__layout">
          <div className="trend-board__main">
            <section className="trend-section">
              <div className="trend-section__header">
                <h3>X需要シグナル</h3>
                <span>{demandSignals.length}件</span>
              </div>
              <div className="trend-card-list">
                {demandSignals.length === 0 && (
                  <div className="trend-card trend-card--muted">
                    <p>Xの需要シグナルはまだありません。RSS記事からアイデア生成できます。</p>
                  </div>
                )}
                {demandSignals.map((signal) => (
                  <DemandSignalCard key={signal.tweet.id} signal={signal} onUseSignal={onUseSignal} />
                ))}
              </div>
            </section>

            <section className="trend-section">
              <div className="trend-section__header">
                <h3>Xトレンド</h3>
                <span>{xTopics.length}件</span>
              </div>
              <div className="trend-topic-grid">
                {xTopics.map((topic) => (
                  <XTopicCard key={topic.url || topic.topic} topic={topic} onUseSignal={onUseSignal} />
                ))}
              </div>
            </section>

            <section className="trend-section">
              <div className="trend-section__header">
                <h3>RSSフィード</h3>
                <span>{rssArticles.length}件</span>
              </div>
              <div className="rss-list">
                {rssArticles.slice(0, 12).map((article) => (
                  <ArticleRow key={articleUrl(article)} article={article} onUseSignal={onUseSignal} />
                ))}
              </div>
            </section>
          </div>

          <aside className="trend-board__side">
            <div className="trend-side-panel">
              <h3>注目キーワード</h3>
              <div className="trend-keywords">
                {keywords.slice(0, 18).map((keyword) => (
                  <button
                    type="button"
                    key={keyword.word}
                    className="trend-keyword"
                    onClick={() => onUseSignal(keyword.word)}
                  >
                    <span>{keyword.word}</span>
                    <strong>{keyword.count}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="trend-side-panel trend-side-panel--focus">
              <h3>次の一手</h3>
              <p>需要投稿、RSS記事、キーワードのどれかを起点にすると、アイデア一覧をその文脈で絞り込めます。</p>
              <button type="button" onClick={onOpenIdeas}>全候補を確認</button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function DemandSignalCard({
  signal,
  onUseSignal,
}: {
  signal: XDemandSignal;
  onUseSignal: (query: string) => void;
}): JSX.Element {
  const query = signal.matchedKeywords[0] || signal.tweet.text.slice(0, 60);

  return (
    <article className="trend-card trend-card--demand">
      <div className="trend-card__meta">
        <span className="trend-card__badge">{categoryLabel(signal.needCategory)}</span>
        <span>関連度 {signal.relevanceScore}</span>
        <span>{formatDate(signal.tweet.createdAt)}</span>
      </div>
      <XPostEmbed tweet={signal.tweet} />
      <div className="trend-card__chips">
        {signal.matchedKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
      </div>
      <div className="trend-card__footer">
        <a href={signal.tweet.url} target="_blank" rel="noreferrer">Xで開く</a>
        <button type="button" onClick={() => onUseSignal(query)}>この課題から案を見る</button>
      </div>
    </article>
  );
}

function XTopicCard({
  topic,
  onUseSignal,
}: {
  topic: XTrendingTopic;
  onUseSignal: (query: string) => void;
}): JSX.Element {
  const query = topic.relatedHashtags[0] || topic.topic.slice(0, 60);

  return (
    <article className="trend-topic-card">
      <div className="trend-topic-card__top">
        <span>X trend</span>
        <strong>{topic.tweetVolume}</strong>
      </div>
      <p>{compactText(topic.topic, 120)}</p>
      <div className="trend-topic-card__tags">
        {topic.relatedHashtags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <button type="button" onClick={() => onUseSignal(query)}>関連アイデア</button>
    </article>
  );
}

function ArticleRow({
  article,
  onUseSignal,
}: {
  article: RssArticle;
  onUseSignal: (query: string) => void;
}): JSX.Element {
  const query = article.keywords?.[0] || article.title;

  return (
    <article className="rss-row">
      <div className="rss-row__source">
        <span>{article.source || 'RSS'}</span>
        <time>{formatDate(article.publishedAt || article.published)}</time>
      </div>
      <div className="rss-row__body">
        <h4>{article.title}</h4>
        <p>{compactText(article.summary || article.description || '', 150)}</p>
        <div className="rss-row__chips">
          {(article.keywords ?? []).slice(0, 5).map((keyword) => <span key={keyword}>{keyword}</span>)}
        </div>
      </div>
      <div className="rss-row__actions">
        <a href={articleUrl(article)} target="_blank" rel="noreferrer">読む</a>
        <button type="button" onClick={() => onUseSignal(query)}>案を見る</button>
      </div>
    </article>
  );
}
