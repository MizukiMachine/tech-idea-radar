import { useState } from 'react';
import type { RssArticle, RssArticleSummaryPolicy, TrendScan, TrendHistoryEntry } from '../api/ai';
import './TrendBoard.css';

const SOURCE_STYLE: Record<string, { color: string; bg: string }> = {
  'Hacker News': { color: '#C67A3A', bg: 'rgba(198,122,58,0.045)' },
  'TechCrunch': { color: '#8A7A3E', bg: 'rgba(138,122,62,0.045)' },
  'Zenn': { color: '#6099BD', bg: 'rgba(96,153,189,0.045)' },
  'Qiita Popular': { color: '#76A852', bg: 'rgba(118,168,82,0.045)' },
  'Qiita': { color: '#76A852', bg: 'rgba(118,168,82,0.045)' },
  'GitHub Blog': { color: '#59636E', bg: 'rgba(89,99,110,0.045)' },
  'Stack Overflow Blog': { color: '#C47A36', bg: 'rgba(196,122,54,0.045)' },
  'Product Hunt': { color: '#C96B3E', bg: 'rgba(201,107,62,0.045)' },
  InfoQ: { color: '#4F7DB8', bg: 'rgba(79,125,184,0.045)' },
  'AWS News Blog': { color: '#98722E', bg: 'rgba(152,114,46,0.045)' },
  'Microsoft DevBlogs': { color: '#5A8F62', bg: 'rgba(90,143,98,0.045)' },
};
const FALLBACK_SOURCE = { color: '#7B8491', bg: 'rgba(123,132,145,0.045)' };

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

function formatTimelineLabel(scannedAt: string): string {
  const date = new Date(scannedAt);
  if (Number.isNaN(date.getTime())) return scannedAt;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return '今';
  if (diffHours < 24) return `${diffHours}時間前`;
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function containsJapanese(text: string): boolean {
  return /[ぁ-んァ-ヶ一-龯]/.test(text);
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function looksLikeJapaneseSummary(text: string, policy: RssArticleSummaryPolicy): boolean {
  const japaneseChars = countMatches(text, /[ぁ-んァ-ヶ一-龯]/g);
  const latinChars = countMatches(text, /[A-Za-z]/g);
  return japaneseChars >= policy.minJapaneseChars
    && japaneseChars >= latinChars * policy.minJapaneseToLatinRatio;
}

function containsFeedMetadataOrUrl(text: string): boolean {
  return /\bArticle URL:|\bComments URL:|\bPoints:|#\s*Comments:|\bhttps?:\/\/\S+|\bwww\.\S+/i.test(text);
}

function articleUrl(article: RssArticle): string {
  return article.url || article.link;
}

function articleSummary(article: RssArticle): string {
  const displayTitle = article.titleJa || article.title;
  const summary = article.summaryJa || '';
  const normalized = summary
    .replace(/^(?:はじめに|概要|要約|導入|introduction)\s*[：:]\s*/i, '')
    .replace(/\bArticle URL:\s*\S+/gi, '')
    .replace(/\bComments URL:\s*\S+/gi, '')
    .replace(/\bPoints:\s*\d+/gi, '')
    .replace(/#\s*Comments:\s*\d+/gi, '')
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '')
    .replace(/\s*(?:\.{3,}|…|続きを読む|read more)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return `「${displayTitle}」に関する記事です。詳細は元記事で確認してください。`;
  if (article.summaryJa || normalized.length <= 680) return normalized;

  const sentences = normalized.match(/[^。.!?！？]+[。.!?！？]/g) ?? [];
  const compact = sentences.reduce((acc, sentence) => (
    `${acc}${sentence}`.length <= 680 ? `${acc}${sentence}` : acc
  ), '');
  return compact || `${normalized.slice(0, 678).trim()}。`;
}

function isDisplayableArticle(article: RssArticle, policy: RssArticleSummaryPolicy): boolean {
  const title = article.titleJa?.trim() || (containsJapanese(article.title) ? article.title.trim() : '');
  const policySummary = article.summaryJa?.trim() ?? '';
  if (!title || !policySummary) return false;
  if (!containsJapanese(title) || !looksLikeJapaneseSummary(policySummary, policy)) return false;
  if (containsFeedMetadataOrUrl(policySummary)) return false;

  const items = policySummary
    .replace(/\r\n/g, '\n')
    .replace(/\s+・/g, '\n・')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/^・\s*/.test(line)
      ? line.replace(/^・\s*/, '').replace(/[。．.]$/u, '').trim()
      : ''));

  if (items.length < policy.minItems || items.length > policy.maxItems) return false;
  if (items.some((item) => !item)) return false;
  if (items.some((item) => item.length > policy.maxItemChars)) {
    return false;
  }

  const totalChars = items.join('').length;
  return totalChars >= policy.minTotalChars && totalChars <= policy.maxTotalChars;
}

function articleSummaryLines(article: RssArticle): string[] {
  return articleSummary(article)
    .replace(/\s+・/g, '\n・')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function articleSummaryItems(article: RssArticle): { text: string; bullet: boolean }[] {
  return articleSummaryLines(article).map((line) => {
    const bullet = /^・\s*/.test(line);
    const text = bullet
      ? line.replace(/^・\s*/, '').replace(/[。．.]$/u, '').trim()
      : line;
    return {
      text,
      bullet,
    };
  });
}

interface TrendBoardProps {
  trends: TrendScan | null;
  loading: boolean;
  error: string | null;
  trendHistory: TrendHistoryEntry[];
  activeTrendIndex: number;
  onSelectTrend: (index: number) => void;
}

export default function TrendBoard({
  trends,
  loading,
  error,
  trendHistory,
  activeTrendIndex,
  onSelectTrend,
}: TrendBoardProps): JSX.Element {
  const [expandedArticleUrls, setExpandedArticleUrls] = useState<Set<string>>(() => new Set());
  const summaryPolicy = trends?.summaryPolicy;
  const rssArticles = summaryPolicy
    ? (trends?.rssContext.relatedArticles ?? []).filter((article) => isDisplayableArticle(article, summaryPolicy))
    : [];
  const keywords = trends?.rssContext.trendingKeywords ?? [];
  const sourceCount = new Set(rssArticles.map((a) => a.source).filter(Boolean)).size;
  const summarizedCount = rssArticles.filter((a) => a.titleJa || a.summaryJa).length;

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
            <span className="tb-metric__value">{summarizedCount}</span>
            <span className="tb-metric__label">要約済み</span>
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

      {trendHistory.length > 1 && (
        <TimelineNavigator
          history={trendHistory}
          activeIndex={activeTrendIndex}
          onSelectIndex={onSelectTrend}
        />
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
                {rssArticles.map((article) => (
                  <FeaturedArticle
                    key={articleUrl(article)}
                    article={article}
                    expanded={expandedArticleUrls.has(articleUrl(article))}
                    onToggle={() => {
                      const url = articleUrl(article);
                      setExpandedArticleUrls((current) => {
                        const next = new Set(current);
                        if (next.has(url)) next.delete(url);
                        else next.add(url);
                        return next;
                      });
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

/* ── Timeline Navigator ───────────────────────────────── */

interface TimelineNavigatorProps {
  history: TrendHistoryEntry[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
}

function TimelineNavigator({ history, activeIndex, onSelectIndex }: TimelineNavigatorProps): JSX.Element {
  return (
    <div className="tb-timeline">
      <div className="tb-timeline__scroll">
        {history.map((entry, index) => (
          <button
            key={entry.scannedAt}
            type="button"
            className={`tb-timeline__item ${index === activeIndex ? 'tb-timeline__item--active' : ''}`}
            onClick={() => onSelectIndex(index)}
            title={new Date(entry.scannedAt).toLocaleString('ja-JP')}
          >
            <span className="tb-timeline__label">{formatTimelineLabel(entry.scannedAt)}</span>
            {index === activeIndex && <span className="tb-timeline__indicator" />}
          </button>
        ))}
      </div>
    </div>
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
  const summaryItems = articleSummaryItems(article);
  const summaryIsList = summaryItems.some((item) => item.bullet);

  return (
    <article
      className="tb-featured"
      style={{ '--source-color': style.color, '--source-bg': style.bg } as React.CSSProperties}
    >
      <div className="tb-featured__source">
        <span className="tb-featured__source-badge">
          <span className="tb-featured__source-dot" />
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
          {summaryIsList ? (
            <ul className="tb-featured__summary-list">
              {summaryItems.map((item, index) => (
                <li key={`${index}-${item.text}`}>{item.text}</li>
              ))}
            </ul>
          ) : (
            summaryItems.map((item, index) => (
              <p key={`${index}-${item.text}`}>{item.text}</p>
            ))
          )}
        </div>
      )}
    </article>
  );
}
