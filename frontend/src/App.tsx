import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { IdeaCandidate } from './types/idea-candidate';
import { buildIdeaTrendSignal, ideaTrendSignalKey } from './utils/idea-trend-signal';
import { topicStatusRank } from './utils/trend-status';
import {
  fetchIdeas,
  fetchIdeasMeta,
  fetchTrends,
  fetchTrendHistory,
  fetchTrendSnapshot,
  streamIdeas,
  type SourceSummary,
  type TrendScan,
  type TrendHistoryEntry,
} from './api/ai';
import Sidebar from './components/Sidebar';
import IdeaCard from './components/IdeaCard';
import RightPanel from './components/RightPanel';
import IdeaDetailModal from './components/IdeaDetailModal';
import TrendBoard from './components/TrendBoard';
import './App.css';

type ViewMode = 'grid' | 'list';
type WorkspaceView = 'trends' | 'ideas';
type IdeaSort = 'generated' | 'trend' | 'evidence';

const IDEA_SORTS: { id: IdeaSort; label: string; requiresTrend?: boolean }[] = [
  { id: 'generated', label: '生成順' },
  { id: 'trend', label: 'トレンド優先', requiresTrend: true },
  { id: 'evidence', label: '根拠多い順' },
];

const IDEAS_PER_PAGE = 24;
const TREND_DISPLAY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const TREND_SNAPSHOT_FETCH_LIMIT = 30;
const PUBLIC_READONLY_RETRY_MS = 15_000;

const INTEREST_KEYWORDS: Record<string, string[]> = {
  business: ['業務', '効率', 'SaaS', 'B2B', '自動化', '管理', '営業', '経理', 'バックオフィス'],
  ai: ['AI', '機械学習', '自動化', '生成', 'LLM', 'チャット', '分析'],
  finance: ['金融', 'お金', '決済', '収益', '会計', '投資', 'サブスク', '料金'],
  education: ['学習', '教育', '研修', '教材', 'ナレッジ', 'メモ'],
  health: ['ヘルスケア', '健康', '医療', 'メンタル', '運動'],
  entertainment: ['エンタメ', 'ゲーム', '音楽', '動画', '配信', 'コミュニティ'],
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  SaaS: ['SaaS', 'サブスク'],
  B2B: ['B2B', '法人', '企業', 'チーム', '業務'],
  B2Cアプリ: ['B2C', 'B2Cアプリ', '個人ユーザー', '生活者', '消費者'],
  開発ツール: ['開発ツール', 'dev-tools', '開発者', 'API', 'SDK', 'CLI'],
  ブラウザ拡張機能: ['ブラウザ拡張機能', 'ブラウザ拡張', 'Chrome拡張'],
  モバイル: ['モバイル', 'スマホ', 'iOS', 'Android'],
  'AI・データ': ['AI', 'LLM', '機械学習', 'データ', '分析', 'RAG'],
  業務効率化: ['業務', '効率', '自動化', '管理'],
};

function ideaText(idea: IdeaCandidate): string {
  return [
    idea.title,
    idea.tagline,
    idea.description,
    idea.productType,
    idea.targetUsers,
    idea.coreProblem,
    idea.differentiation,
    ...idea.tags,
    ...idea.sources.rssKeywords,
    ...(idea.sources.evidenceUrls ?? []).map((source) => source.title),
  ].join(' ');
}

function ideaRenderKey(idea: IdeaCandidate, index: number): string {
  return `${idea.id}:${idea.batchTime ?? idea.generatedAt}:${index}`;
}

function isSameIdea(a: IdeaCandidate | null, b: IdeaCandidate): boolean {
  if (!a) return false;
  return a.id === b.id
    && a.generatedAt === b.generatedAt
    && (a.batchTime ?? '') === (b.batchTime ?? '');
}

function ideaEvidenceCount(idea: IdeaCandidate): number {
  return idea.sources.evidenceUrls?.length ?? 0;
}

function matchesCategory(idea: IdeaCandidate, category: string): boolean {
  if (category === 'すべて') return true;
  const keywords = CATEGORY_KEYWORDS[category] ?? [category];
  const text = ideaText(idea);
  return keywords.some((keyword) => text.includes(keyword));
}

function matchesSearchQuery(text: string, query: string): boolean {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const normalizedText = text.toLowerCase();
  return terms.every((term) => normalizedText.includes(term));
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isWithinTrendDisplayWindow(time: number | null, referenceTime = Date.now()): boolean {
  return time !== null && referenceTime - time < TREND_DISPLAY_WINDOW_MS;
}

function paginationItems(totalPages: number, current: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const pages: (number | '...')[] = [0];
  if (current > 2) pages.push('...');
  for (let page = Math.max(1, current - 1); page <= Math.min(totalPages - 2, current + 1); page += 1) {
    pages.push(page);
  }
  if (current < totalPages - 3) pages.push('...');
  pages.push(totalPages - 1);
  return pages;
}

function trendScanTime(scan: TrendScan): number | null {
  return parseTime(scan.generatedAt);
}

function trendHistoryEntryTime(entry: TrendHistoryEntry): number | null {
  return parseTime(entry.generatedAt) ?? parseTime(entry.scannedAt);
}

function userFacingError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    message.includes('RSS記事')
    || normalized.includes('rss_source_unavailable')
    || (normalized.includes('rss') && normalized.includes('unavailable'))
  ) {
    return 'RSS記事を取得できなかったため、生成を停止しました。管理者に通知しています。既存のキャッシュがある場合はそのまま表示します。';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('stream failed')) {
    if (normalized.includes('401') || normalized.includes('403')) {
      return '公開版ではキャッシュ済みのアイデアのみ表示しています。再生成は管理環境で実行します。';
    }
    return 'バックエンドに接続できません。API サーバーを起動してから、もう一度生成してください。';
  }
  if (
    normalized.includes('dev_stack_mismatch')
    || normalized.includes('dev stack')
    || normalized.includes('devstack')
  ) {
    return 'フロントエンドが起動時に確認したバックエンドと現在の接続先が一致しません。npm run dev でフロントエンドとバックエンドをセットで再起動してください。';
  }
  if (normalized.includes('zai_api_key')) {
    return 'ZAI_API_KEY が設定されていません。バックエンドの環境変数を確認してください。';
  }
  if (normalized.includes('admin token required')) {
    return '公開版ではキャッシュ済みのアイデアのみ表示しています。初回データを準備中です。';
  }
  if (normalized.includes('ideas not yet generated')) {
    return 'まだアイデアが生成されていません。先に生成を実行してください。';
  }
  return message;
}

function App(): JSX.Element {
  const ideaListTopRef = useRef<HTMLDivElement | null>(null);
  const previousIdeaPageRef = useRef(0);
  const [activeView, setActiveView] = useState<WorkspaceView>('ideas');
  const [trends, setTrends] = useState<TrendScan | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendSnapshots, setTrendSnapshots] = useState<TrendScan[]>([]);
  const [ideas, setIdeas] = useState<IdeaCandidate[]>([]);
  const [featuredIdea, setFeaturedIdea] = useState<IdeaCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [sourceSummary, setSourceSummary] = useState<SourceSummary | null>(null);
  const [activeCategory, setActiveCategory] = useState('すべて');
  const [activeInterests, setActiveInterests] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [ideaSort, setIdeaSort] = useState<IdeaSort>('generated');
  const [ideaPage, setIdeaPage] = useState(0);
  const [selectedIdea, setSelectedIdea] = useState<IdeaCandidate | null>(null);
  const [modalIdea, setModalIdea] = useState<IdeaCandidate | null>(null);

  // Load cached ideas on mount. Fresh generation starts automatically when cache is disabled.
  useEffect(() => {
    let cancelled = false;
    let streamController: AbortController | null = null;
    let retryTimer: number | null = null;

    async function loadIdeas() {
      try {
        const result = await fetchIdeas();
        if (!cancelled && result.candidates.length > 0) {
          setError(null);
          setIdeas(result.candidates);
          setFeaturedIdea(result.featuredIdea ?? null);
          setSourceSummary(result.sourceSummary);
          setLoading(false);
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'アイデア取得に失敗しました';
        if (!cancelled) setError(userFacingError(message));
        if (!cancelled) setLoading(false);
        return;
      }

      if (cancelled) return;
      const meta = await fetchIdeasMeta().catch(() => null);
      if (cancelled) return;
      if (meta?.env.publicReadonlyMode) {
        setError(null);
        setProgressText(
          meta.generationInProgress || meta.backgroundRefreshInProgress
            ? '初回データを準備中です。しばらくすると自動で表示されます。'
            : '公開版ではキャッシュ済みのアイデアのみ表示しています。現在表示できるアイデアはまだありません。',
        );
        setLoading(true);
        retryTimer = window.setTimeout(() => {
          void loadIdeas();
        }, PUBLIC_READONLY_RETRY_MS);
        return;
      }

      setProgressText('トレンドデータを分析中です。');
      streamController = streamIdeas({
        onProgress: (text) => {
          if (!cancelled) setProgressText(text);
        },
        onIdeaGenerated: (idea) => {
          if (cancelled) return;
          setError(null);
          setIdeas((current) => (
            current.some((existing) => isSameIdea(existing, idea))
              ? current
              : [...current, idea]
          ));
        },
        onComplete: (summary) => {
          if (cancelled) return;
          setFeaturedIdea(summary.featuredIdea ?? null);
          setSourceSummary(summary.sourceSummary ?? null);
          setProgressText(null);
          setLoading(false);
        },
        onError: (message) => {
          if (cancelled) return;
          setError(userFacingError(message));
          setProgressText(null);
          setLoading(false);
        },
      });
    }

    void loadIdeas();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      streamController?.abort();
    };
  }, []);

  useEffect(() => {
    if (activeView === 'trends' || trends) return;
    let cancelled = false;

    async function loadTrendPreview() {
      try {
        const result = await fetchTrends();
        if (!cancelled) {
          const recentTrend = isWithinTrendDisplayWindow(trendScanTime(result)) ? result : null;
          setTrends(recentTrend);
          setTrendSnapshots(recentTrend ? [recentTrend] : []);
        }
      } catch {
        // The trends view still performs its own user-facing load and error handling.
      }
    }

    void loadTrendPreview();
    return () => {
      cancelled = true;
    };
  }, [activeView, trends]);

  // Load trends and trend history when switching to trends view
  useEffect(() => {
    if (activeView !== 'trends') return;
    let cancelled = false;

    async function loadTrends() {
      setTrendsLoading(true);
      setTrendError(null);
      try {
        const trendsResult = await fetchTrends();
        let historyResult: { history: TrendHistoryEntry[] } = { history: [] };
        try {
          historyResult = await fetchTrendHistory();
        } catch {
          historyResult = { history: [] };
        }

        const referenceTime = Date.now();
        const recentHistoryEntries = historyResult.history
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => isWithinTrendDisplayWindow(trendHistoryEntryTime(entry), referenceTime));
        const latestSnapshot = isWithinTrendDisplayWindow(trendScanTime(trendsResult), referenceTime)
          ? trendsResult
          : null;
        const historicalSnapshots = await Promise.all(
          recentHistoryEntries.slice(1, TREND_SNAPSHOT_FETCH_LIMIT).map(async ({ index }) => {
            try {
              return await fetchTrendSnapshot(index);
            } catch {
              return null;
            }
          }),
        );

        if (!cancelled) {
          setTrends(latestSnapshot);
          setTrendSnapshots([
            ...(latestSnapshot ? [latestSnapshot] : []),
            ...historicalSnapshots.filter((snapshot): snapshot is TrendScan => Boolean(snapshot)),
          ]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'トレンド取得に失敗しました';
        if (!cancelled) setTrendError(userFacingError(message));
      } finally {
        if (!cancelled) setTrendsLoading(false);
      }
    }

    void loadTrends();
    return () => {
      cancelled = true;
    };
  }, [activeView]);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setIdeaPage(0);
  }, []);

  const handleOpenIdeas = useCallback(() => {
    setActiveView('ideas');
  }, []);

  const handleCategoryFilter = useCallback((category: string) => {
    setActiveCategory(category);
    setIdeaPage(0);
  }, []);

  const handleInterestChange = useCallback((interests: string[]) => {
    setActiveInterests(interests);
    setIdeaPage(0);
  }, []);

  const handleIdeaSortChange = useCallback((sort: IdeaSort) => {
    setIdeaSort(sort);
    setIdeaPage(0);
  }, []);

  const sourceIdeas = ideas;
  const trendSignalByIdea = useMemo(() => {
    const signals = new Map<string, ReturnType<typeof buildIdeaTrendSignal>>();
    for (const idea of sourceIdeas) {
      signals.set(ideaTrendSignalKey(idea), buildIdeaTrendSignal(idea, trends));
    }
    return signals;
  }, [sourceIdeas, trends]);
  const hasTrendSignals = [...trendSignalByIdea.values()].some((signal) => signal && signal.status !== 'stale');
  const filteredIdeas = sourceIdeas.filter((idea) => {
      const text = ideaText(idea);
      const normalizedSearch = searchQuery.trim().toLowerCase();
      if (normalizedSearch && !matchesSearchQuery(text, normalizedSearch)) return false;
      if (!matchesCategory(idea, activeCategory)) return false;
      if (activeInterests.length > 0) {
        const hasInterestMatch = activeInterests.some((interest) => {
          const keywords = INTEREST_KEYWORDS[interest] ?? [];
          return keywords.length === 0 || keywords.some((keyword) => text.includes(keyword));
        });
        if (!hasInterestMatch) return false;
      }
      return true;
    });
  const displayedIdeas = ideaSort === 'generated'
    ? filteredIdeas
    : [...filteredIdeas].sort((a, b) => {
      const aSignal = trendSignalByIdea.get(ideaTrendSignalKey(a));
      const bSignal = trendSignalByIdea.get(ideaTrendSignalKey(b));
      if (ideaSort === 'trend') {
        return topicStatusRank(bSignal?.status) - topicStatusRank(aSignal?.status)
          || (bSignal?.sourceCount ?? 0) - (aSignal?.sourceCount ?? 0)
          || (bSignal?.articleCount ?? 0) - (aSignal?.articleCount ?? 0)
          || ideaEvidenceCount(b) - ideaEvidenceCount(a);
      }
      return ideaEvidenceCount(b) - ideaEvidenceCount(a)
        || (bSignal?.evidenceCount ?? 0) - (aSignal?.evidenceCount ?? 0)
        || (bSignal?.articleCount ?? 0) - (aSignal?.articleCount ?? 0);
    });
  const totalIdeaPages = Math.ceil(displayedIdeas.length / IDEAS_PER_PAGE);
  const currentIdeaPage = Math.min(ideaPage, Math.max(totalIdeaPages - 1, 0));
  const ideaPageStart = currentIdeaPage * IDEAS_PER_PAGE;
  const pagedIdeas = displayedIdeas.slice(ideaPageStart, ideaPageStart + IDEAS_PER_PAGE);

  useEffect(() => {
    const previousIdeaPage = previousIdeaPageRef.current;
    previousIdeaPageRef.current = currentIdeaPage;

    if (activeView === 'ideas' && previousIdeaPage !== currentIdeaPage) {
      ideaListTopRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [activeView, currentIdeaPage]);

  const hasIdeas = ideas.length > 0;
  const showDashboard = loading || hasIdeas;
  const showSetupState = !loading && !hasIdeas && !error;
  const handleIdeaSelect = useCallback((idea: IdeaCandidate) => {
    setSelectedIdea(idea);
    setModalIdea(idea);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__top">
          <div className="app-header__brand">
            <img className="app-header__logo" src="/brand-logo.svg" alt="" aria-hidden="true" />
            <div className="app-header__brand-copy">
              <h1 className="app-header__brand-title">Lume</h1>
              <p>トレンドから、次のアイデアを照らす</p>
            </div>
          </div>

          <nav className="workspace-tabs" aria-label="主要機能">
            <button
              type="button"
              className={`workspace-tabs__item ${activeView === 'ideas' ? 'workspace-tabs__item--active' : ''}`}
              onClick={handleOpenIdeas}
              aria-pressed={activeView === 'ideas'}
            >
              需要アイデア
              {hasIdeas && <span>{ideas.length}</span>}
            </button>
            <button
              type="button"
              className={`workspace-tabs__item ${activeView === 'trends' ? 'workspace-tabs__item--active' : ''}`}
              onClick={() => setActiveView('trends')}
              aria-pressed={activeView === 'trends'}
            >
              海外トレンド
            </button>
          </nav>
        </div>
      </header>

      <main className="workspace">
        {activeView === 'trends' && (
          <TrendBoard
            trendSnapshots={trendSnapshots}
            loading={trendsLoading}
            error={trendError}
          />
        )}

        {activeView === 'ideas' && (
          <>
            {progressText && (
              <div className="progress-bar">
                <span className="progress-bar__text">{progressText}</span>
              </div>
            )}

            {error && (
              <div className="error-banner">
                <span className="error-banner__icon">!</span>
                <p>{error}</p>
              </div>
            )}

            {sourceSummary?.usedLLMFallback && (
              <div className="data-warning-banner">
                <span className="data-warning-banner__icon">!</span>
                <p>{sourceSummary.warnings?.[0] ?? '外部データ未使用の生成結果です。'}</p>
              </div>
            )}

            {showSetupState && (
              <section className="setup-state">
                <div className="setup-state__icon">BR</div>
                <h2>アイデアを準備中です</h2>
                <p>
                  技術ニュースとRSSシグナルを分析中です。完了後にプロダクト仮説が表示されます。
                </p>
              </section>
            )}

            {showDashboard && (
              <div className="dashboard">
                <section className="main-content">
                  {hasIdeas && (
                    <div className="idea-results-toolbar" ref={ideaListTopRef}>
                      <div className="idea-results-toolbar__search-row">
                        <div className="idea-results-toolbar__search">
                          <span className="idea-results-toolbar__search-icon">⌕</span>
                          <input
                            type="text"
                            aria-label="アイデアをキーワードで絞り込み"
                            placeholder="キーワードで絞り込み"
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            disabled={!hasIdeas}
                          />
                          {searchQuery && hasIdeas && (
                            <button
                              type="button"
                              className="idea-results-toolbar__clear"
                              onClick={() => handleSearch('')}
                              aria-label="検索条件をクリア"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <span className="idea-results-toolbar__count">{displayedIdeas.length}件</span>
                      </div>
                      <div className="idea-results-toolbar__controls">
                        <div className="idea-results-toolbar__sort" aria-label="並び順">
                          {IDEA_SORTS.map((sort) => (
                            <button
                              key={sort.id}
                              type="button"
                              className={`idea-results-toolbar__sort-btn ${ideaSort === sort.id ? 'idea-results-toolbar__sort-btn--active' : ''}`}
                              onClick={() => handleIdeaSortChange(sort.id)}
                              aria-pressed={ideaSort === sort.id}
                              disabled={Boolean(sort.requiresTrend && !hasTrendSignals)}
                              title={sort.requiresTrend && !hasTrendSignals
                                ? '観測トピックを含むトレンドデータで有効になります'
                                : sort.label}
                            >
                              {sort.label}
                            </button>
                          ))}
                        </div>
                        <div className="idea-results-toolbar__view-toggle" aria-label="表示形式">
                          <button
                            type="button"
                            className={`idea-results-toolbar__view-btn ${viewMode === 'grid' ? 'idea-results-toolbar__view-btn--active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            aria-label="グリッド表示"
                            aria-pressed={viewMode === 'grid'}
                          >
                            ▦
                          </button>
                          <button
                            type="button"
                            className={`idea-results-toolbar__view-btn ${viewMode === 'list' ? 'idea-results-toolbar__view-btn--active' : ''}`}
                            onClick={() => setViewMode('list')}
                            aria-label="リスト表示"
                            aria-pressed={viewMode === 'list'}
                          >
                            ☰
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {loading && ideas.length === 0 && (
                    <div className="loading-state">
                      <div className="loading-state__spinner" />
                      <h2>アイデアを生成しています</h2>
                      <p>{progressText || 'トレンドデータを分析中です。完了すると候補が一覧に表示されます。'}</p>
                    </div>
                  )}

                  {displayedIdeas.length > 0 && (
                    <>
                      <div className={`idea-grid idea-grid--${viewMode}`}>
                        {pagedIdeas.map((idea, index) => (
                          <IdeaCard
                            key={ideaRenderKey(idea, ideaPageStart + index)}
                            idea={idea}
                            index={ideaPageStart + index}
                            viewMode={viewMode}
                            selected={isSameIdea(selectedIdea, idea)}
                            trendSignal={trendSignalByIdea.get(ideaTrendSignalKey(idea)) ?? null}
                            onSelect={handleIdeaSelect}
                          />
                        ))}
                      </div>
                      <IdeaPagination
                        total={displayedIdeas.length}
                        pageSize={IDEAS_PER_PAGE}
                        current={currentIdeaPage}
                        onChange={setIdeaPage}
                      />
                    </>
                  )}

                  {hasIdeas && !loading && displayedIdeas.length === 0 && (
                    <div className="empty-state">
                      <h2>条件に合うアイデアがありません</h2>
                      <p>検索語や右側のフィルターを緩めると候補が戻ります。</p>
                    </div>
                  )}
                </section>

                {hasIdeas && (
                  <RightPanel
                    ideas={displayedIdeas}
                    featuredIdea={featuredIdea}
                    onIdeaSelect={handleIdeaSelect}
                    filters={(
                      <Sidebar
                        variant="panel"
                        onCategoryFilter={handleCategoryFilter}
                        onInterestChange={handleInterestChange}
                      />
                    )}
                  />
                )}
              </div>
            )}
          </>
        )}
      </main>
      {modalIdea && (
        <IdeaDetailModal
          idea={modalIdea}
          trendSignal={trendSignalByIdea.get(ideaTrendSignalKey(modalIdea)) ?? null}
          onClose={() => setModalIdea(null)}
        />
      )}
    </div>
  );
}

function IdeaPagination({
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

  const start = current * pageSize + 1;
  const end = Math.min(total, start + pageSize - 1);
  const pages = paginationItems(totalPages, current);

  return (
    <nav className="idea-pagination" aria-label="アイデアページネーション">
      <span className="idea-pagination__summary">{start}-{end} / {total}件</span>
      <div className="idea-pagination__controls">
        <button
          type="button"
          className="idea-pagination__btn"
          disabled={current === 0}
          onClick={() => onChange(current - 1)}
          aria-label="前のページ"
        >
          ‹
        </button>
        {pages.map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="idea-pagination__ellipsis">…</span>
          ) : (
            <button
              key={page}
              type="button"
              className={`idea-pagination__btn ${page === current ? 'idea-pagination__btn--active' : ''}`}
              onClick={() => onChange(page)}
              aria-current={page === current ? 'page' : undefined}
              aria-label={`${page + 1}ページ目`}
            >
              {page + 1}
            </button>
          )
        ))}
        <button
          type="button"
          className="idea-pagination__btn"
          disabled={current === totalPages - 1}
          onClick={() => onChange(current + 1)}
          aria-label="次のページ"
        >
          ›
        </button>
      </div>
    </nav>
  );
}

export default App;
