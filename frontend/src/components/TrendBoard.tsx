import { useState } from 'react';
import type { RssArticle, TrendScan } from '../api/ai';
import './TrendBoard.css';

const SOURCE_STYLE: Record<string, { color: string; bg: string }> = {
  'Hacker News': { color: '#FF6600', bg: 'rgba(255,102,0,0.08)' },
  'TechCrunch': { color: '#0A9E01', bg: 'rgba(10,158,1,0.08)' },
  'The Verge': { color: '#E5127D', bg: 'rgba(229,18,125,0.08)' },
  'DEV Community': { color: '#3B49DF', bg: 'rgba(59,73,223,0.08)' },
  'Zenn': { color: '#3EA8FF', bg: 'rgba(62,168,255,0.08)' },
  'Qiita Popular': { color: '#55C500', bg: 'rgba(85,197,0,0.08)' },
  'Qiita': { color: '#55C500', bg: 'rgba(85,197,0,0.08)' },
};
const FALLBACK_SOURCE = { color: '#6B7280', bg: 'rgba(107,112,128,0.08)' };

function sourceStyle(source: string | undefined) {
  return SOURCE_STYLE[source ?? ''] ?? FALLBACK_SOURCE;
}

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
}

export default function TrendBoard({
  trends,
  loading,
  error,
}: TrendBoardProps): JSX.Element {
  const [expandedArticleUrl, setExpandedArticleUrl] = useState<string | null>(null);
  const rssArticles = trends?.rssContext.relatedArticles ?? [];
  const keywords = trends?.rssContext.trendingKeywords ?? [];
  const sourceCount = new Set(rssArticles.map((a) => a.source).filter(Boolean)).size;
  const translatedCount = rssArticles.filter((a) => a.titleJa || a.summaryJa).length;

  const maxKeywordCount = keywords.length > 0
    ? Math.max(...keywords.map((k) => k.count))
    : 1;

  return (
    <section className="trend-board">
      {/* Hero header */}
      <div className="tb-hero">
        <div className="tb-hero__inner">
          <div className="tb-hero__badge">SIGNAL SCAN</div>
          <h2 className="tb-hero__title">今日のAI開発シグナル</h2>
          <p className="tb-hero__subtitle">
            主要テックメディアの最新記事から、プロダクト開発に活きるトレンドを毎日キャッチ
          </p>
        </div>
        <div className="tb-hero__metrics">
          <div className="tb-metric">
            <span className="tb-metric__value">{rssArticles.length}</span>
            <span className="tb-metric__label">RSS記事</span>
          </div>
          <div className="tb-metric">
            <span className="tb-metric__value">{sourceCount}</span>
            <span className="tb-metric__label">メディア</span>
          </div>
          <div className="tb-metric">
            <span className="tb-metric__value">{translatedCount}</span>
            <span className="tb-metric__label">日本語化</span>
          </div>
          <div className="tb-metric">
            <span className="tb-metric__value tb-metric__value--sm">
              {formatDate(trends?.generatedAt)}
            </span>
            <span className="tb-metric__label">最終取得</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="tb-error">
          <strong>トレンド取得に失敗しました</strong>
          <span>{error}</span>
        </div>
      )}

      {loading && !trends && (
        <div className="tb-loading">
          <span className="tb-loading__spinner" />
          <div>
            <h3>RSS を取得しています</h3>
            <p>複数メディアの記事を集め、日本語タイトルと要約を準備しています。</p>
          </div>
        </div>
      )}

      {!loading && trends && rssArticles.length === 0 && (
        <div className="tb-loading">
          <h3>表示できるRSS記事がありません</h3>
          <p>データ更新後に表示されます。</p>
        </div>
      )}

      {trends && rssArticles.length > 0 && (
        <div className="tb-layout">
          <div className="tb-main">
            <section className="tb-feed">
              <div className="tb-feed__header">
                <h3>RSSフィード</h3>
                <span className="tb-feed__count">{rssArticles.length}件</span>
              </div>
              <div className="tb-feed__list">
                {rssArticles.slice(0, 12).map((article) => (
                  <FeaturedArticle
                    key={articleUrl(article)}
                    article={article}
                    expanded={expandedArticleUrl === articleUrl(article)}
                    onToggle={() => {
                      const url = articleUrl(article);
                      setExpandedArticleUrl((c) => (c === url ? null : url));
                    }}
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="tb-sidebar">
            <div className="tb-keywords-panel">
              <h3 className="tb-keywords-panel__title">注目キーワード</h3>
              <div className="tb-keywords">
                {keywords.slice(0, 20).map((keyword) => (
                  <span
                    key={keyword.word}
                    className="tb-keyword"
                    style={{
                      fontSize: `${0.75 + (keyword.count / maxKeywordCount) * 0.55}rem`,
                      opacity: 0.55 + (keyword.count / maxKeywordCount) * 0.45,
                    }}
                  >
                    {keyword.word}
                    <strong className="tb-keyword__count">{keyword.count}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Sources breakdown */}
            <div className="tb-sources-panel">
              <h3 className="tb-sources-panel__title">ソース別</h3>
              {Object.entries(
                rssArticles.reduce<Record<string, number>>((acc, a) => {
                  const s = a.source || 'RSS';
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => (
                  <div key={source} className="tb-source-row">
                    <span
                      className="tb-source-row__dot"
                      style={{ background: sourceStyle(source).color }}
                    />
                    <span className="tb-source-row__name">{source}</span>
                    <span className="tb-source-row__bar-wrap">
                      <span
                        className="tb-source-row__bar"
                        style={{
                          width: `${(count / rssArticles.length) * 100}%`,
                          background: sourceStyle(source).color,
                        }}
                      />
                    </span>
                    <span className="tb-source-row__count">{count}</span>
                  </div>
                ))}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

/* ── Featured article (first) ─────────────────────────── */

function FeaturedArticle({
  article,
  expanded,
  onToggle,
}: {
  article: RssArticle;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const displayTitle = article.titleJa || article.title;
  const style = sourceStyle(article.source);

  return (
    <article
      className="tb-featured"
      style={{ '--source-color': style.color } as React.CSSProperties}
    >
      <div className="tb-featured__source">
        <span
          className="tb-featured__source-badge"
          style={{ background: style.bg, color: style.color }}
        >
          {article.source || 'RSS'}
        </span>
        <time className="tb-featured__date">
          {formatDate(article.publishedAt || article.published)}
        </time>
      </div>
      <h3 className="tb-featured__title">{displayTitle}</h3>
      <div className="tb-featured__actions">
        <a
          href={articleUrl(article)}
          target="_blank"
          rel="noopener noreferrer"
          className="tb-featured__link"
        >
          元記事を読む
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M17 7H7M17 7V17" />
          </svg>
        </a>
        <button type="button" className="tb-featured__summary-btn" onClick={onToggle}>
          {expanded ? '要約を閉じる' : '要約を見る'}
        </button>
      </div>
      {expanded && (
        <div className="tb-featured__summary">
          <p>{articleSummary(article)}</p>
        </div>
      )}
    </article>
  );
}

