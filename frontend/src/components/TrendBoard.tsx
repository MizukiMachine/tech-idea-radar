import { useState, type CSSProperties } from 'react';
import type {
  RssArticle,
  RssArticleSummaryPolicy,
  RssTopicArticle,
  RssTopicCluster,
  TrendScan,
  TrendHistoryEntry,
} from '../api/ai';
import { topicStatusLabel } from '../utils/trend-status';
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

function topicArticleUrl(article: RssTopicArticle): string {
  return article.url || article.link || '';
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

function hasLegacySummary(article: RssArticle): boolean {
  const summary = article.summaryJa?.trim() ?? '';
  return Boolean(
    summary
    && containsJapanese(summary)
    && !containsFeedMetadataOrUrl(summary)
    && articleUrl(article),
  );
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

type TrendArticleLayout = 'card';
type TopicFilter = 'all' | 'spiking' | 'new' | 'continuing';

const TOPIC_FILTERS: { id: TopicFilter; label: string }[] = [
  { id: 'spiking', label: '急増' },
  { id: 'new', label: '新着' },
  { id: 'continuing', label: '継続' },
  { id: 'all', label: 'すべて' },
];

interface SourceRow {
  source: string;
  count: number;
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
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 16;
  const summaryPolicy = trends?.summaryPolicy;
  const usesLegacySummaryContract = trends?.summaryPolicySource === 'default';
  const relatedArticles = trends?.rssContext.relatedArticles ?? [];
  const policyDisplayableArticles = summaryPolicy
    ? (trends?.rssContext.relatedArticles ?? []).filter((article) => isDisplayableArticle(article, summaryPolicy))
    : [];
  const displayableArticles = usesLegacySummaryContract ? [] : policyDisplayableArticles;
  const fallbackArticles = displayableArticles.length > 0
    ? []
    : relatedArticles.filter((article) => {
      const title = article.titleJa?.trim() || (containsJapanese(article.title) ? article.title.trim() : '');
      return Boolean(title && articleUrl(article));
    });
  const rssArticles = displayableArticles.length > 0 ? displayableArticles : fallbackArticles;
  const summaryArticleUrls = new Set(
    (usesLegacySummaryContract
      ? rssArticles.filter(hasLegacySummary)
      : displayableArticles
    ).map((article) => articleUrl(article)),
  );
  const keywords = trends?.rssContext.trendingKeywords ?? [];
  const topicClusters = (trends?.rssContext.topicClusters ?? []).filter((topic) => topic.status !== 'stale');
  const hasObservedTopics = topicClusters.length > 0;
  const topicCounts: Record<TopicFilter, number> = {
    all: topicClusters.length,
    spiking: topicClusters.filter((topic) => topic.status === 'spiking').length,
    new: topicClusters.filter((topic) => topic.status === 'new').length,
    continuing: topicClusters.filter((topic) => topic.status === 'continuing').length,
  };
  const sourceCount = new Set(rssArticles.map((a) => a.source).filter(Boolean)).size;
  const summarizedCount = summaryArticleUrls.size;

  const maxKeywordCount = keywords.length > 0
    ? Math.max(...keywords.map((k) => k.count))
    : 1;
  const sourceRows = Object.entries(
    rssArticles.reduce<Record<string, number>>((acc, article) => {
      const source = article.source || 'RSS';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));
  const selectedTopicCluster = selectedTopic
    ? topicClusters.find((topic) => topic.topic === selectedTopic) ?? null
    : null;
  const topicFilteredArticles = selectedTopic
    ? rssArticles.filter((article) => article.topicKey === selectedTopic)
    : rssArticles;
  const visibleArticles = topicFilteredArticles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleToggleArticle = (article: RssArticle) => {
    const url = articleUrl(article);
    setExpandedArticleUrls((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleTopicFilterChange = (filter: TopicFilter) => {
    setTopicFilter(filter);
    setSelectedTopic(null);
    setPage(0);
  };

  const handleTopicSelect = (topic: RssTopicCluster) => {
    setSelectedTopic((current) => (current === topic.topic ? null : topic.topic));
    setPage(0);
  };

  const handleClearTopic = () => {
    setSelectedTopic(null);
    setPage(0);
  };

  return (
    <section className="trend-board">
      <div className="tb-header">
        <div className="tb-header__copy">
          <span className="tb-header__eyebrow">RSSフィード</span>
          <h2>tech系開発シグナル</h2>
          <p>海外メディアと開発者向けフィードから、アイデア生成の根拠になる記事とキーワードを確認できます。</p>
        </div>
        <div className="tb-header__metrics">
          <TrendMetric label="RSS記事" value={rssArticles.length} />
          {hasObservedTopics ? (
            <>
              <TrendMetric label="観測トピック" value={topicCounts.all} />
              <TrendMetric label="急増" value={topicCounts.spiking} />
            </>
          ) : (
            <>
              <TrendMetric label="メディア" value={sourceCount} />
              <TrendMetric label="注目KW" value={keywords.length} />
            </>
          )}
          <TrendMetric label="要約済み" value={summarizedCount} />
          <TrendMetric label="最終取得" value={formatDate(trends?.generatedAt)} compact />
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

      {trends?.rssContext.observationWarning && (
        <div className="tb-observation-warning">
          <strong>観測履歴の保存に注意が必要です</strong>
          <span>{trends.rssContext.observationWarning}</span>
        </div>
      )}

      {trends && topicClusters.length > 0 && (
        <TopicRadar
          topics={topicClusters}
          counts={topicCounts}
          filter={topicFilter}
          selectedTopic={selectedTopic}
          onFilterChange={handleTopicFilterChange}
          onSelectTopic={handleTopicSelect}
        />
      )}

      {trends && rssArticles.length > 0 && topicClusters.length === 0 && (
        <div className="tb-topic-unavailable">
          <strong>観測トピックはこのトレンドデータに含まれていません</strong>
          <span>RSS観測メタデータを含むスキャン結果になると、ここに急増・新着・継続トピックが表示されます。</span>
        </div>
      )}

      {trends && rssArticles.length > 0 && (
        <TrendCardsLayout
          articles={topicFilteredArticles}
          allArticleCount={rssArticles.length}
          hasObservedTopics={hasObservedTopics}
          visibleArticles={visibleArticles}
          expandedArticleUrls={expandedArticleUrls}
          onToggleArticle={handleToggleArticle}
          pageSize={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          keywords={keywords}
          maxKeywordCount={maxKeywordCount}
          sourceRows={sourceRows}
          summaryArticleUrls={summaryArticleUrls}
          selectedTopicLabel={selectedTopicCluster?.label ?? null}
          onClearTopic={handleClearTopic}
        />
      )}
    </section>
  );
}

function TrendMetric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className="tb-metric">
      <span className={`tb-metric__value ${compact ? 'tb-metric__value--sm' : ''}`}>{value}</span>
      <span className="tb-metric__label">{label}</span>
    </div>
  );
}

interface TrendLayoutProps {
  articles: RssArticle[];
  allArticleCount: number;
  hasObservedTopics: boolean;
  visibleArticles: RssArticle[];
  expandedArticleUrls: Set<string>;
  onToggleArticle: (article: RssArticle) => void;
  pageSize: number;
  page: number;
  onPageChange: (page: number) => void;
  keywords: { word: string; count: number }[];
  maxKeywordCount: number;
  sourceRows: SourceRow[];
  summaryArticleUrls: Set<string>;
  selectedTopicLabel: string | null;
  onClearTopic: () => void;
}

function TrendCardsLayout({
  articles,
  allArticleCount,
  hasObservedTopics,
  visibleArticles,
  expandedArticleUrls,
  onToggleArticle,
  pageSize,
  page,
  onPageChange,
  keywords,
  maxKeywordCount,
  sourceRows,
  summaryArticleUrls,
  selectedTopicLabel,
  onClearTopic,
}: TrendLayoutProps): JSX.Element {
  return (
    <div className="tb-layout tb-layout--cards">
      <div className="tb-main">
        <TrendFeedHeader
          count={articles.length}
          totalCount={allArticleCount}
          hasObservedTopics={hasObservedTopics}
          selectedTopicLabel={selectedTopicLabel}
          onClearTopic={onClearTopic}
        />
        {articles.length === 0 ? (
          <div className="tb-feed-empty">
            <h3>このトピックに表示できる記事がありません</h3>
            <p>要約ポリシーや日本語タイトルの条件を満たす記事がある場合に表示されます。</p>
          </div>
        ) : (
          <>
            <div className="tb-article-grid">
              {visibleArticles.map((article, index) => (
                <TrendArticleCard
                  key={articleUrl(article)}
                  article={article}
                  layout="card"
                  rank={page * pageSize + index + 1}
                  expanded={expandedArticleUrls.has(articleUrl(article))}
                  summaryAvailable={summaryArticleUrls.has(articleUrl(article))}
                  onToggle={() => onToggleArticle(article)}
                />
              ))}
            </div>
            <Pagination
              total={articles.length}
              pageSize={pageSize}
              current={page}
              onChange={onPageChange}
            />
          </>
        )}
      </div>

      <aside className="tb-sidebar">
        <KeywordPanel keywords={keywords} maxKeywordCount={maxKeywordCount} />
        <SourcePanel sourceRows={sourceRows} articleCount={allArticleCount} />
      </aside>
    </div>
  );
}

function TrendFeedHeader({
  count,
  totalCount,
  hasObservedTopics,
  selectedTopicLabel,
  onClearTopic,
}: {
  count: number;
  totalCount: number;
  hasObservedTopics: boolean;
  selectedTopicLabel: string | null;
  onClearTopic: () => void;
}): JSX.Element {
  return (
    <div className="tb-feed__header">
      <div className="tb-feed__title">
        <h3>
          {selectedTopicLabel
            ? `「${selectedTopicLabel}」の根拠記事`
            : hasObservedTopics
              ? '観測トピックの根拠記事'
              : 'RSS記事一覧'}
        </h3>
        {selectedTopicLabel && (
          <button type="button" className="tb-feed__clear" onClick={onClearTopic}>
            絞り込み解除
          </button>
        )}
      </div>
      <span className="tb-feed__count">
        {selectedTopicLabel ? `${count}/${totalCount}件` : `${count}件`}
      </span>
    </div>
  );
}

function TopicRadar({
  topics,
  counts,
  filter,
  selectedTopic,
  onFilterChange,
  onSelectTopic,
}: {
  topics: RssTopicCluster[];
  counts: Record<TopicFilter, number>;
  filter: TopicFilter;
  selectedTopic: string | null;
  onFilterChange: (filter: TopicFilter) => void;
  onSelectTopic: (topic: RssTopicCluster) => void;
}): JSX.Element {
  const visibleTopics = filter === 'all'
    ? topics
    : topics.filter((topic) => topic.status === filter);

  return (
    <section className="tb-topic-radar">
      <div className="tb-topic-radar__header">
        <div>
          <span className="tb-topic-radar__eyebrow">観測トピック</span>
          <h3>トピックレーダー</h3>
        </div>
        <div className="tb-topic-radar__filters" aria-label="トピック状態">
          {TOPIC_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tb-topic-radar__filter ${filter === item.id ? 'tb-topic-radar__filter--active' : ''}`}
              onClick={() => onFilterChange(item.id)}
              aria-pressed={filter === item.id}
            >
              {item.label}
              <span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {visibleTopics.length === 0 ? (
        <div className="tb-topic-radar__empty">この状態の観測トピックはありません。</div>
      ) : (
        <div className="tb-topic-grid">
          {visibleTopics.map((topic) => (
            <TopicCard
              key={topic.topic}
              topic={topic}
              selected={selectedTopic === topic.topic}
              onSelect={() => onSelectTopic(topic)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TopicCard({
  topic,
  selected,
  onSelect,
}: {
  topic: RssTopicCluster;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <article className={`tb-topic-card tb-topic-card--${topic.status} ${selected ? 'tb-topic-card--selected' : ''}`}>
      <div className="tb-topic-card__top">
        <span className={`tb-status-badge tb-status-badge--${topic.status}`}>
          {topicStatusLabel(topic.status)}
        </span>
        <span className="tb-topic-card__score">score {topic.score}</span>
      </div>
      <h4>{topic.label}</h4>
      <div className="tb-topic-card__metrics">
        <span><strong>{topic.sourceCount}</strong>ソース</span>
        <span><strong>{topic.articleCount}</strong>記事</span>
        <span><strong>{topic.recentCount}</strong>直近</span>
        <span><strong>{topic.previousCount}</strong>前期間</span>
      </div>
      <div className="tb-topic-card__time">
        <span>初回 {formatDate(topic.firstSeenAt)}</span>
        <span>最終 {formatDate(topic.lastSeenAt)}</span>
      </div>
      <div className="tb-topic-card__sources">
        {topic.sources.slice(0, 4).map((source) => (
          <span key={source}>{source}</span>
        ))}
      </div>
      <div className="tb-topic-card__articles">
        {topic.representativeArticles.slice(0, 3).map((article) => {
          const url = topicArticleUrl(article);
          return url ? (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <span>{article.source}</span>
              {article.title}
            </a>
          ) : (
            <span key={`${article.source}-${article.title}`} className="tb-topic-card__article-text">
              {article.title}
            </span>
          );
        })}
      </div>
      <button type="button" className="tb-topic-card__select" onClick={onSelect}>
        {selected ? '選択中' : '根拠記事を見る'}
      </button>
    </article>
  );
}

function KeywordPanel({
  keywords,
  maxKeywordCount,
}: {
  keywords: { word: string; count: number }[];
  maxKeywordCount: number;
}): JSX.Element {
  return (
    <div className="tb-panel tb-keywords-panel">
      <h3 className="tb-panel__title">注目キーワード</h3>
      <div className="tb-keywords">
        {keywords.slice(0, 20).map((keyword) => (
          <span
            key={keyword.word}
            className="tb-keyword"
            style={{
              fontSize: `${0.75 + (keyword.count / maxKeywordCount) * 0.4}rem`,
              opacity: 0.62 + (keyword.count / maxKeywordCount) * 0.38,
            }}
          >
            {keyword.word}
            <strong className="tb-keyword__count">{keyword.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function SourcePanel({
  sourceRows,
  articleCount,
}: {
  sourceRows: SourceRow[];
  articleCount: number;
}): JSX.Element {
  return (
    <div className="tb-panel tb-sources-panel">
      <h3 className="tb-panel__title">ソース別</h3>
      <div className="tb-source-list">
        {sourceRows.map(({ source, count }) => (
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
                  width: `${(count / articleCount) * 100}%`,
                  background: sourceStyle(source).color,
                }}
              />
            </span>
            <span className="tb-source-row__count">{count}</span>
          </div>
        ))}
      </div>
    </div>
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

/* ── Article card ─────────────────────────────────────── */

function TrendArticleCard({
  article,
  expanded,
  summaryAvailable,
  onToggle,
  layout,
  rank,
}: {
  article: RssArticle;
  expanded: boolean;
  summaryAvailable: boolean;
  onToggle: () => void;
  layout: TrendArticleLayout;
  rank: number;
}): JSX.Element {
  const displayTitle = article.titleJa || article.title;
  const style = sourceStyle(article.source);
  const summaryItems = articleSummaryItems(article);
  const summaryIsList = summaryItems.some((item) => item.bullet);
  const hasTopicStatus = article.topicStatus && article.topicStatus !== 'stale';

  return (
    <article
      className={`tb-article tb-article--${layout}`}
      style={{ '--source-color': style.color, '--source-bg': style.bg } as CSSProperties}
    >
      <span className="tb-article__rank">{String(rank).padStart(2, '0')}</span>
      <div className="tb-article__body">
        <div className="tb-article__meta">
          <span className="tb-article__source">
            <span className="tb-article__source-dot" />
            {article.source || 'RSS'}
          </span>
          <time className="tb-article__date">
            {formatDate(article.publishedAt || article.published)}
          </time>
        </div>
        {hasTopicStatus && (
          <div className="tb-article__topic-row">
            <span className={`tb-status-badge tb-status-badge--${article.topicStatus}`}>
              {topicStatusLabel(article.topicStatus)}トピック
            </span>
            {(article.topicSourceCount || article.topicArticleCount) && (
              <span className="tb-article__topic-count">
                {article.topicSourceCount ?? 1}ソース / {article.topicArticleCount ?? 1}記事
              </span>
            )}
            {article.firstSeenAt && (
              <span className="tb-article__topic-seen">初回 {formatDate(article.firstSeenAt)}</span>
            )}
          </div>
        )}
        <h3 className="tb-article__title">{displayTitle}</h3>
        <div className="tb-article__actions">
          <a
            href={articleUrl(article)}
            target="_blank"
            rel="noopener noreferrer"
            className="tb-article__link"
          >
            元記事を読む
            <span aria-hidden="true">↗</span>
          </a>
          {summaryAvailable && (
            <button
              type="button"
              className="tb-article__summary-btn"
              onClick={onToggle}
              aria-expanded={expanded}
            >
              {expanded ? '要約を閉じる' : '要約を見る'}
            </button>
          )}
        </div>
      </div>
      {summaryAvailable && expanded && (
        <div className="tb-article__summary">
          {summaryIsList ? (
            <ul className="tb-article__summary-list">
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

/* ── Pagination ───────────────────────────────────────── */

function Pagination({
  total,
  pageSize,
  current,
  onChange,
}: {
  total: number;
  pageSize: number;
  current: number;
  onChange: (page: number) => void;
}): JSX.Element {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return <></>;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (current > 2) pages.push('...');
    for (let i = Math.max(1, current - 1); i <= Math.min(totalPages - 2, current + 1); i++) {
      pages.push(i);
    }
    if (current < totalPages - 3) pages.push('...');
    pages.push(totalPages - 1);
  }

  return (
    <div className="tb-pagination">
      <button
        type="button"
        className="tb-pagination__btn"
        disabled={current === 0}
        onClick={() => onChange(current - 1)}
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="tb-pagination__ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={`tb-pagination__btn ${p === current ? 'tb-pagination__btn--active' : ''}`}
            onClick={() => onChange(p)}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        type="button"
        className="tb-pagination__btn"
        disabled={current === totalPages - 1}
        onClick={() => onChange(current + 1)}
      >
        ›
      </button>
    </div>
  );
}
