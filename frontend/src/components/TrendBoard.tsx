import { useState } from 'react';
import type { RssArticle, TrendScan } from '../api/ai';
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

function articleUrl(article: RssArticle): string {
  return article.url || article.link;
}

function articleSummary(article: RssArticle): string {
  const displayTitle = article.titleJa || article.title;
  return article.summaryJa
    || article.summary
    || article.description
    || `「${displayTitle}」に関する記事です。詳細は元記事で確認してください。`;
}

interface TrendBoardProps {
  trends: TrendScan | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  refreshDisabled?: boolean;
}

export default function TrendBoard({
  trends,
  loading,
  error,
  onRefresh,
  refreshDisabled = false,
}: TrendBoardProps): JSX.Element {
  const [expandedArticleUrl, setExpandedArticleUrl] = useState<string | null>(null);
  const rssArticles = trends?.rssContext.relatedArticles ?? [];
  const keywords = trends?.rssContext.trendingKeywords ?? [];
  const sourceCount = new Set(rssArticles.map((article) => article.source).filter(Boolean)).size;
  const translatedCount = rssArticles.filter((article) => article.titleJa || article.summaryJa).length;

  return (
    <section className="trend-board">
      <div className="trend-board__toolbar">
        <div>
          <p className="trend-board__eyebrow">Today signal scan</p>
          <h2 className="trend-board__title">今日のAI開発シグナル</h2>
        </div>
        <div className="trend-board__actions">
          {!refreshDisabled && (
            <button type="button" className="trend-board__secondary-btn" onClick={onRefresh} disabled={loading}>
              {loading ? '取得中...' : '再取得'}
            </button>
          )}
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
          <strong>{rssArticles.length}</strong>
        </div>
        <div className="trend-board__stat">
          <span className="trend-board__stat-label">取得メディア</span>
          <strong>{sourceCount}</strong>
        </div>
        <div className="trend-board__stat">
          <span className="trend-board__stat-label">日本語化</span>
          <strong>{translatedCount}</strong>
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
            <h3>RSS を取得しています</h3>
            <p>複数メディアの記事を集め、日本語タイトルと要約を準備しています。</p>
          </div>
        </div>
      )}

      {!loading && trends && rssArticles.length === 0 && (
        <div className="trend-board__empty">
          <h3>表示できるRSS記事がありません</h3>
          <p>{refreshDisabled ? 'データ更新後に表示されます。' : 'RSS の接続状態を確認して、再取得してください。'}</p>
        </div>
      )}

      {trends && rssArticles.length > 0 && (
        <div className="trend-board__layout">
          <div className="trend-board__main">
            <section className="trend-section">
              <div className="trend-section__header">
                <div>
                  <h3>RSSフィード</h3>
                  <p>Hacker News、TechCrunch、The Verge、DEV Community、Zenn、Qiita などから取得しています。</p>
                </div>
                <span>{rssArticles.length}件</span>
              </div>
              <div className="rss-list">
                {rssArticles.slice(0, 12).map((article) => (
                  <ArticleRow
                    key={articleUrl(article)}
                    article={article}
                    expanded={expandedArticleUrl === articleUrl(article)}
                    onToggleSummary={() => {
                      const url = articleUrl(article);
                      setExpandedArticleUrl((current) => (current === url ? null : url));
                    }}
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="trend-board__side">
            <div className="trend-side-panel">
              <h3>注目キーワード</h3>
              <div className="trend-keywords">
                {keywords.slice(0, 18).map((keyword) => (
                  <span
                    key={keyword.word}
                    className="trend-keyword"
                  >
                    <span>{keyword.word}</span>
                    <strong>{keyword.count}</strong>
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function ArticleRow({
  article,
  expanded,
  onToggleSummary,
}: {
  article: RssArticle;
  expanded: boolean;
  onToggleSummary: () => void;
}): JSX.Element {
  const displayTitle = article.titleJa || article.title;

  return (
    <article className="rss-row">
      <div className="rss-row__source">
        <span>{article.source || 'RSS'}</span>
        <time>{formatDate(article.publishedAt || article.published)}</time>
      </div>
      <div className="rss-row__body">
        <h4>{displayTitle}</h4>
      </div>
      <div className="rss-row__actions">
        <a href={articleUrl(article)} target="_blank" rel="noopener noreferrer">読む</a>
        <button type="button" className="rss-row__summary-btn" onClick={onToggleSummary}>
          {expanded ? '要約を閉じる' : '記事の要約'}
        </button>
      </div>
      {expanded && (
        <div className="rss-row__summary">
          <strong>記事の要約</strong>
          <p>{articleSummary(article)}</p>
        </div>
      )}
    </article>
  );
}
