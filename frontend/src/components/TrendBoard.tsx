import { useMemo, useState, type CSSProperties } from 'react';
import type {
  RssArticle,
  RssArticleSummaryPolicy,
  TrendScan,
  RssTopicStatus,
} from '../api/ai';
import { formatBatchTimestamp, normalizeBatchTimeJST } from '../utils/batch-time';
import { cleanDisplayText } from '../utils/html-text';
import { displayTopicStatus, topicStatusLabel } from '../utils/trend-status';
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
const KEYWORD_STOP_WORDS = new Set([
  'https', 'http', 'www', 'com', 'with', 'from', 'that', 'this', 'your', 'you',
  'for', 'and', 'the', 'are', 'was', 'were', 'into', 'about', 'using', 'how',
  'what', 'why', 'new', 'news', 'more', 'after', 'over', 'under', 'their',
  'they', 'will', 'can', 'has', 'have', 'had', 'not', 'but', 'all',
  'です', 'ます', 'でした', 'ました', 'する', 'した', 'して', 'いる', 'ある',
  'ない', 'こと', 'これ', 'それ', 'ため', 'よう', 'など', 'その', 'この',
  'もの', 'また', 'から', 'まで', 'より', 'として', 'について', '記事',
  '今回', '紹介', 'では', 'とは', 'にも', 'には', 'への', 'でも', 'という',
  'そして', 'ただし', '一方', 'できる', 'できた', 'なる', 'なった', 'れる',
  'られる', 'された', 'される', 'ための', 'ような', '中で', '上で',
]);
const NUMBER_ONLY_KEYWORD = /^[\d０-９]+$/;

function sourceStyle(source: string | undefined) {
  return SOURCE_STYLE[source ?? ''] ?? FALLBACK_SOURCE;
}

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isDisplayKeyword(value: string): boolean {
  const normalized = normalizeKeyword(value);
  if (!normalized || normalized.length > 32) return false;
  const key = normalized.toLowerCase();
  if (KEYWORD_STOP_WORDS.has(key)) return false;
  if (NUMBER_ONLY_KEYWORD.test(normalized)) return false;
  return true;
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

function normalizeArticleUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function articleIdentity(article: RssArticle): string {
  const url = normalizeArticleUrl(articleUrl(article));
  return url || `${article.source}:${article.title}:${article.publishedAt ?? article.published}`;
}

function articleDisplayTitle(article: RssArticle): string {
  return cleanDisplayText(article.titleJa || article.title);
}

type MergedRssArticle = RssArticle & {
  trendSnapshotGeneratedAt?: string;
  trendSnapshotBatchTime?: string;
};

function articleTrendReferenceDate(article: RssArticle, fallback?: string): string | undefined {
  return (article as MergedRssArticle).trendSnapshotGeneratedAt ?? fallback;
}

function articleBatchTime(article: RssArticle, fallback?: string): string | undefined {
  const merged = article as MergedRssArticle;
  return merged.trendSnapshotBatchTime
    ?? normalizeBatchTimeJST(undefined, article.lastSeenAt ?? articleTrendReferenceDate(article, fallback));
}

function mergeKeywords(articles: RssArticle[], fallback: TrendScan['rssContext']['trendingKeywords']) {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const keyword of article.keywords ?? []) {
      const normalized = normalizeKeyword(keyword);
      if (!isDisplayKeyword(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  const merged = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  const sanitizedFallback = fallback
    .map(({ word, count }) => ({ word: normalizeKeyword(word), count }))
    .filter(({ word }) => isDisplayKeyword(word))
    .slice(0, 20);

  return merged.length > 0 ? merged : sanitizedFallback;
}

function mergeTrendSnapshots(snapshots: TrendScan[]): TrendScan | null {
  const latest = snapshots[0];
  if (!latest) return null;

  const seenArticles = new Set<string>();
  const relatedArticles: MergedRssArticle[] = [];
  const seenTopics = new Set<string>();
  const topicClusters: NonNullable<TrendScan['rssContext']['topicClusters']> = [];
  const warnings = new Set<string>();
  const sourceErrors = [];
  const summaryErrors = [];
  const replacedSummaryErrors = [];

  for (const snapshot of snapshots) {
    for (const article of snapshot.rssContext.relatedArticles) {
      const key = articleIdentity(article);
      if (seenArticles.has(key)) continue;
      seenArticles.add(key);
      relatedArticles.push({
        ...article,
        trendSnapshotGeneratedAt: snapshot.generatedAt,
        trendSnapshotBatchTime: normalizeBatchTimeJST(snapshot.batchTime, snapshot.generatedAt),
      });
    }

    for (const topic of snapshot.rssContext.topicClusters ?? []) {
      if (seenTopics.has(topic.topic)) continue;
      seenTopics.add(topic.topic);
      topicClusters.push(topic);
    }

    for (const warning of snapshot.sourceSummary.warnings ?? []) warnings.add(warning);
    sourceErrors.push(...(snapshot.rssContext.sourceErrors ?? []));
    summaryErrors.push(...(snapshot.rssContext.summaryErrors ?? []));
    replacedSummaryErrors.push(...(snapshot.rssContext.replacedSummaryErrors ?? []));
  }

  const trendingKeywords = mergeKeywords(relatedArticles, latest.rssContext.trendingKeywords);

  return {
    ...latest,
    rssContext: {
      ...latest.rssContext,
      trendingKeywords,
      relatedArticles,
      topicClusters,
      ...(sourceErrors.length > 0 ? { sourceErrors } : {}),
      ...(summaryErrors.length > 0 ? { summaryErrors } : {}),
      ...(replacedSummaryErrors.length > 0 ? { replacedSummaryErrors } : {}),
    },
    sourceSummary: {
      ...latest.sourceSummary,
      rssItemCount: relatedArticles.length + trendingKeywords.length,
      ...(warnings.size > 0 ? { warnings: [...warnings] } : {}),
    },
  };
}

function articleSummary(article: RssArticle): string {
  const displayTitle = articleDisplayTitle(article);
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

function trendSearchText(article: RssArticle): string {
  return [
    article.title,
    article.titleJa,
    article.summary,
    article.summaryJa,
    article.source,
    article.topicKey,
    ...(article.keywords ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function matchesTrendSearch(article: RssArticle, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = trendSearchText(article);
  return terms.every((term) => text.includes(term));
}

type TrendArticleLayout = 'card';
type TopicFilter = 'all' | 'spiking' | 'new' | 'continuing';

const TOPIC_FILTERS: { id: TopicFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'new', label: '新着' },
  { id: 'spiking', label: '急増' },
  { id: 'continuing', label: '継続' },
];

interface SourceRow {
  source: string;
  count: number;
}

interface TrendBoardProps {
  trendSnapshots: TrendScan[];
  loading: boolean;
  error: string | null;
}

export default function TrendBoard({
  trendSnapshots,
  loading,
  error,
}: TrendBoardProps): JSX.Element {
  const [expandedArticleUrls, setExpandedArticleUrls] = useState<Set<string>>(() => new Set());
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
  const [trendSearchQuery, setTrendSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const mergedTrends = useMemo(
    () => mergeTrendSnapshots(trendSnapshots),
    [trendSnapshots],
  );
  const summaryPolicy = mergedTrends?.summaryPolicy;
  const usesLegacySummaryContract = mergedTrends?.summaryPolicySource === 'default';
  const relatedArticles = mergedTrends?.rssContext.relatedArticles ?? [];
  const policyDisplayableArticles = summaryPolicy
    ? relatedArticles.filter((article) => isDisplayableArticle(article, summaryPolicy))
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
  const topicClusters = (mergedTrends?.rssContext.topicClusters ?? []).filter((topic) => topic.status !== 'stale');
  const articleDisplayStatus = (article: RssArticle) => displayTopicStatus(
    article,
    articleTrendReferenceDate(article, mergedTrends?.generatedAt),
  );
  const articleStatusCounts: Record<TopicFilter, number> = {
    all: rssArticles.length,
    spiking: rssArticles.filter((article) => articleDisplayStatus(article) === 'spiking').length,
    new: rssArticles.filter((article) => articleDisplayStatus(article) === 'new').length,
    continuing: rssArticles.filter((article) => articleDisplayStatus(article) === 'continuing').length,
  };

  const sourceRows = Object.entries(
    rssArticles.reduce<Record<string, number>>((acc, article) => {
      const source = article.source || 'RSS';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));
  const statusFilteredArticles = topicFilter === 'all'
    ? rssArticles
    : rssArticles.filter((article) => articleDisplayStatus(article) === topicFilter);
  const filteredArticles = statusFilteredArticles.filter((article) => matchesTrendSearch(article, trendSearchQuery));
  const visibleArticles = filteredArticles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const contributingSnapshotCount = new Set(
    rssArticles.map((article) => articleTrendReferenceDate(article, mergedTrends?.generatedAt)).filter(Boolean),
  ).size;

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
    setPage(0);
  };

  const handleClearFilter = () => {
    setTopicFilter('all');
    setPage(0);
  };

  const handleTrendSearch = (value: string) => {
    setTrendSearchQuery(value);
    setPage(0);
  };

  const handleClearTrendSearch = () => {
    setTrendSearchQuery('');
    setPage(0);
  };

  return (
    <section className="trend-board" aria-label="海外トレンド">
      {error && (
        <div className="tb-error">
          <strong>トレンド取得に失敗しました</strong>
          <span>{error}</span>
        </div>
      )}

      {loading && !mergedTrends && (
        <div className="tb-loading">
          <span className="tb-loading__spinner" />
          <div>
            <h3>RSS を取得しています</h3>
            <p>複数メディアの記事を集め、日本語タイトルと要約を準備しています。</p>
          </div>
        </div>
      )}

      {!loading && (!mergedTrends || rssArticles.length === 0) && (
        <div className="tb-loading">
          <h3>表示できるRSS記事がありません</h3>
          <p>データ更新後に表示されます。</p>
        </div>
      )}

      {mergedTrends?.rssContext.observationWarning && rssArticles.length === 0 && (
        <div className="tb-observation-warning">
          <strong>観測履歴の保存に注意が必要です</strong>
          <span>{mergedTrends.rssContext.observationWarning}</span>
        </div>
      )}

      {mergedTrends && rssArticles.length > 0 && (
        <TrendCardsLayout
          articles={filteredArticles}
          allArticleCount={rssArticles.length}
          visibleArticles={visibleArticles}
          expandedArticleUrls={expandedArticleUrls}
          onToggleArticle={handleToggleArticle}
          pageSize={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          sourceRows={sourceRows}
          summaryArticleUrls={summaryArticleUrls}
          statusFilter={topicFilter}
          statusCounts={articleStatusCounts}
          onStatusFilterChange={handleTopicFilterChange}
          onClearFilter={handleClearFilter}
          searchQuery={trendSearchQuery}
          onSearchChange={handleTrendSearch}
          onClearSearch={handleClearTrendSearch}
          trendGeneratedAt={mergedTrends.generatedAt}
          observationWarning={mergedTrends.rssContext.observationWarning}
          showTopicUnavailable={topicClusters.length === 0}
          snapshotCount={contributingSnapshotCount}
        />
      )}
    </section>
  );
}

interface TrendLayoutProps {
  articles: RssArticle[];
  allArticleCount: number;
  visibleArticles: RssArticle[];
  expandedArticleUrls: Set<string>;
  onToggleArticle: (article: RssArticle) => void;
  pageSize: number;
  page: number;
  onPageChange: (page: number) => void;
  sourceRows: SourceRow[];
  summaryArticleUrls: Set<string>;
  statusFilter: TopicFilter;
  statusCounts: Record<TopicFilter, number>;
  onStatusFilterChange: (filter: TopicFilter) => void;
  onClearFilter: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  trendGeneratedAt?: string;
  observationWarning?: string;
  showTopicUnavailable: boolean;
  snapshotCount: number;
}

function TrendCardsLayout({
  articles,
  allArticleCount,
  visibleArticles,
  expandedArticleUrls,
  onToggleArticle,
  pageSize,
  page,
  onPageChange,
  sourceRows,
  summaryArticleUrls,
  statusFilter,
  statusCounts,
  onStatusFilterChange,
  onClearFilter,
  searchQuery,
  onSearchChange,
  onClearSearch,
  trendGeneratedAt,
  observationWarning,
  showTopicUnavailable,
  snapshotCount,
}: TrendLayoutProps): JSX.Element {
  return (
    <div className="tb-layout tb-layout--cards">
      <div className="tb-main">
        <TrendFeedHeader
          count={articles.length}
          totalCount={allArticleCount}
          statusFilter={statusFilter}
          statusCounts={statusCounts}
          onStatusFilterChange={onStatusFilterChange}
          onClearFilter={onClearFilter}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onClearSearch={onClearSearch}
          snapshotCount={snapshotCount}
        />
        {articles.length === 0 ? (
          <div className="tb-feed-empty">
            <h3>この条件に一致する記事がありません</h3>
            <p>{searchQuery.trim() ? '検索語を変えるか、検索条件をクリアしてください。' : '別の状態を選ぶか、すべての記事に戻してください。'}</p>
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
                  displayStatus={displayTopicStatus(article, articleTrendReferenceDate(article, trendGeneratedAt))}
                  batchTime={articleBatchTime(article, trendGeneratedAt)}
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
        {(observationWarning || showTopicUnavailable) && (
          <div className="tb-feed-notices">
            {observationWarning && (
              <div className="tb-observation-warning">
                <strong>観測履歴の保存に注意が必要です</strong>
                <span>{observationWarning}</span>
              </div>
            )}
            {showTopicUnavailable && (
              <div className="tb-topic-unavailable">
                <strong>観測トピックはこのトレンドデータに含まれていません</strong>
                <span>RSS観測メタデータを含むスキャン結果になると、記事一覧を急増・新着・継続で絞り込めます。</span>
              </div>
            )}
          </div>
        )}
        <SourcePanel sourceRows={sourceRows} articleCount={allArticleCount} />
      </aside>
    </div>
  );
}

function TrendFeedHeader({
  count,
  totalCount,
  statusFilter,
  statusCounts,
  onStatusFilterChange,
  onClearFilter,
  searchQuery,
  onSearchChange,
  onClearSearch,
  snapshotCount,
}: {
  count: number;
  totalCount: number;
  statusFilter: TopicFilter;
  statusCounts: Record<TopicFilter, number>;
  onStatusFilterChange: (filter: TopicFilter) => void;
  onClearFilter: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  snapshotCount: number;
}): JSX.Element {
  const filtered = statusFilter !== 'all';
  const searched = searchQuery.trim().length > 0;
  const statusLabel = TOPIC_FILTERS.find((item) => item.id === statusFilter)?.label ?? 'すべて';

  return (
    <div className="tb-feed__header">
      <div className="tb-feed__search-row">
        <div className="tb-feed__search">
          <span className="tb-feed__search-icon">⌕</span>
          <input
            type="text"
            aria-label="トレンド記事をキーワードで絞り込み"
            placeholder="キーワードで絞り込み"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searched && (
            <button
              type="button"
              className="tb-feed__search-clear"
              onClick={onClearSearch}
              aria-label="検索条件をクリア"
            >
              ×
            </button>
          )}
        </div>
        <span className="tb-feed__count">
          {filtered || searched ? `${count}/${totalCount}件` : `${count}件`}
        </span>
        {snapshotCount > 1 && (
          <span
            className="tb-feed__count"
            title="直近の取得結果をまとめ、同じ記事URLは1件にしています"
          >
            直近{snapshotCount}回を統合・重複除外
          </span>
        )}
        {filtered && (
          <span className="tb-feed__active-filter">
            <span>{`${statusLabel}の記事`}</span>
            <button type="button" className="tb-feed__clear" onClick={onClearFilter}>
              絞り込み解除
            </button>
          </span>
        )}
      </div>
      <div className="tb-feed__tools">
        <StatusFilters
          counts={statusCounts}
          activeFilter={statusFilter}
          onChange={onStatusFilterChange}
        />
      </div>
    </div>
  );
}

function StatusFilters({
  counts,
  activeFilter,
  onChange,
}: {
  counts: Record<TopicFilter, number>;
  activeFilter: TopicFilter;
  onChange: (filter: TopicFilter) => void;
}): JSX.Element {
  return (
    <div className="tb-status-filters" aria-label="記事ステータス">
      {TOPIC_FILTERS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`tb-status-filter ${activeFilter === item.id ? 'tb-status-filter--active' : ''}`}
          onClick={() => onChange(item.id)}
          aria-pressed={activeFilter === item.id}
          disabled={item.id !== 'all' && counts[item.id] === 0}
        >
          {item.label}
          <span>{counts[item.id]}</span>
        </button>
      ))}
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
      <h3 className="tb-panel__title">媒体別</h3>
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

/* ── Article card ─────────────────────────────────────── */

function TrendArticleCard({
  article,
  expanded,
  summaryAvailable,
  onToggle,
  layout,
  rank,
  displayStatus,
  batchTime,
}: {
  article: RssArticle;
  expanded: boolean;
  summaryAvailable: boolean;
  onToggle: () => void;
  layout: TrendArticleLayout;
  rank: number;
  displayStatus: RssTopicStatus | null;
  batchTime?: string;
}): JSX.Element {
  const displayTitle = articleDisplayTitle(article);
  const style = sourceStyle(article.source);
  const summaryItems = articleSummaryItems(article);
  const summaryIsList = summaryItems.some((item) => item.bullet);

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
        </div>
        <div className="tb-article__title-row">
          {displayStatus && (
            <span className={`tb-status-badge tb-status-badge--${displayStatus}`}>
              {topicStatusLabel(displayStatus)}
            </span>
          )}
          <h3 className="tb-article__title">{displayTitle}</h3>
        </div>
        <div className="tb-article__footer">
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
          {batchTime && (
            <time className="tb-article__batch-time" dateTime={batchTime}>
              {formatBatchTimestamp(batchTime)}
            </time>
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
