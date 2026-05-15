import { useState, useCallback, useRef, useEffect } from 'react';
import type { IdeaCandidate } from './types/idea-candidate';
import {
  fetchIdeas,
  fetchIdeasMeta,
  fetchTrends,
  refreshIdeas,
  refreshTrends,
  filterIdeas,
  getApiBase,
  type SourceSummary,
  type IdeasMeta,
  type TrendScan,
} from './api/ai';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import TabFilter from './components/TabFilter';
import IdeaCard from './components/IdeaCard';
import RightPanel from './components/RightPanel';
import IdeaDetailModal from './components/IdeaDetailModal';
import TrendBoard from './components/TrendBoard';
import './App.css';

type ViewMode = 'grid' | 'list';
type WorkspaceView = 'trends' | 'ideas';

const INTEREST_KEYWORDS: Record<string, string[]> = {
  business: ['業務', '効率', 'SaaS', 'B2B', '自動化', '管理', '営業', '経理', 'バックオフィス'],
  ai: ['AI', '機械学習', '自動化', '生成', 'LLM', 'チャット', '分析'],
  finance: ['金融', 'お金', '決済', '収益', '会計', '投資', 'サブスク', '料金'],
  education: ['学習', '教育', '研修', '教材', 'ナレッジ', 'メモ'],
  health: ['ヘルスケア', '健康', '医療', 'メンタル', '運動'],
  entertainment: ['エンタメ', 'ゲーム', '音楽', '動画', '配信', 'コミュニティ'],
  other: [],
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
  ].join(' ');
}

function revenueScore(value: string): number {
  const normalized = value.toLowerCase();
  if (normalized.includes('very high')) return 95;
  if (normalized.includes('high')) return 78;
  if (normalized.includes('medium')) return 55;
  if (normalized.includes('low')) return 25;
  return 50;
}

function timeframeScore(value: string): number {
  if (value.includes('日') || value.includes('1週') || value.includes('2週')) return 95;
  if (value.includes('週') || value.includes('1ヶ月')) return 82;
  if (value.includes('2ヶ月')) return 62;
  if (value.includes('3ヶ月')) return 45;
  return 35;
}

function matchesTab(idea: IdeaCandidate, tab: string): boolean {
  if (tab === 'すべて') return true;
  const text = ideaText(idea);
  const tabKeywords: Record<string, string[]> = {
    SaaS: ['SaaS', 'サブスク', 'B2B'],
    AI: ['AI', '機械学習', 'LLM', '生成', '自動化'],
    個人開発: ['個人', '開発', 'ツール', '小規模'],
    業務効率化: ['業務', '効率', '自動化', '管理'],
    データ: ['データ', '分析', '可視化', 'レポート'],
    学習: ['学習', '教育', '研修', 'ナレッジ'],
    'API・ツール': ['API', 'ツール', '開発者', 'SDK'],
  };
  return (tabKeywords[tab] ?? [tab]).some((keyword) => text.includes(keyword));
}

function sortIdeas(ideas: IdeaCandidate[], sort: string): IdeaCandidate[] {
  const sorted = [...ideas];
  if (sort === 'トレンドスコア順') return sorted.sort((a, b) => b.trendScore - a.trendScore);
  if (sort === '収益性順') return sorted.sort((a, b) => revenueScore(b.revenuePotential) - revenueScore(a.revenuePotential));
  if (sort === '開発期間順') return sorted.sort((a, b) => timeframeScore(b.estimatedMvpTime) - timeframeScore(a.estimatedMvpTime));
  return sorted.sort((a, b) => {
    const aScore = a.trendScore + revenueScore(a.revenuePotential) + timeframeScore(a.estimatedMvpTime);
    const bScore = b.trendScore + revenueScore(b.revenuePotential) + timeframeScore(b.estimatedMvpTime);
    return bScore - aScore;
  });
}

function userFacingError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('stream failed')) {
    return 'バックエンドに接続できません。API サーバーを起動してから、もう一度生成してください。';
  }
  if (normalized.includes('zai_api_key')) {
    return 'ZAI_API_KEY が設定されていません。バックエンドの環境変数を確認してください。';
  }
  if (normalized.includes('ideas not yet generated')) {
    return 'まだアイデアが生成されていません。先に生成を実行してください。';
  }
  return message;
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ja-JP');
}

function isIdeasMeta(value: unknown): value is IdeasMeta {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.instanceId === 'string'
    && typeof obj.pid === 'number'
    && typeof obj.startedAt === 'string'
    && typeof obj.cache === 'object'
    && obj.cache !== null;
}

function App(): JSX.Element {
  const [activeView, setActiveView] = useState<WorkspaceView>('ideas');
  const [trends, setTrends] = useState<TrendScan | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<IdeaCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [semanticFilterText, setSemanticFilterText] = useState<string | null>(null);
  const [semanticFilteredIdeas, setSemanticFilteredIdeas] = useState<IdeaCandidate[] | null>(null);
  const [semanticFiltering, setSemanticFiltering] = useState(false);
  const [sourceSummary, setSourceSummary] = useState<SourceSummary | null>(null);
  const [ideasMeta, setIdeasMeta] = useState<IdeasMeta | null>(null);
  const [activeTech, setActiveTech] = useState('すべて');
  const [activeInterests, setActiveInterests] = useState(['business', 'ai', 'education']);
  const [revenueMin, setRevenueMin] = useState<number | null>(null);
  const [timeframeMin, setTimeframeMin] = useState<number | null>(null);
  const [sortLabel, setSortLabel] = useState('おすすめ順');
  const [activeTab, setActiveTab] = useState('すべて');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIdea, setSelectedIdea] = useState<IdeaCandidate | null>(null);
  const [modalIdea, setModalIdea] = useState<IdeaCandidate | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshIdeasMeta = useCallback((retryUsage = false) => {
    const update = () => {
      void fetchIdeasMeta()
        .then((meta) => { if (isIdeasMeta(meta)) setIdeasMeta(meta); })
        .catch(() => undefined);
    };
    update();
    if (retryUsage) window.setTimeout(update, 2000);
  }, []);

  // Load trends and any cached ideas on mount. Idea generation is user-triggered.
  useEffect(() => {
    let cancelled = false;

    async function loadTrends() {
      setTrendsLoading(true);
      setTrendError(null);
      try {
        const result = await fetchTrends();
        if (!cancelled) setTrends(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'トレンド取得に失敗しました';
        if (!cancelled) setTrendError(userFacingError(message));
      } finally {
        if (!cancelled) setTrendsLoading(false);
      }
    }

    async function loadIdeas() {
      const metaPromise = fetchIdeasMeta().catch(() => null);
      try {
        const result = await fetchIdeas();
        const meta = await metaPromise;
        if (!cancelled && isIdeasMeta(meta)) setIdeasMeta(meta);
        if (!cancelled && result.candidates.length > 0) {
          setIdeas(result.candidates);
          setSourceSummary(result.sourceSummary);
          setLoading(false);
          return;
        }
      } catch {
        const meta = await metaPromise;
        if (!cancelled && isIdeasMeta(meta)) setIdeasMeta(meta);
      }

      if (!cancelled) setLoading(false);
    }

    void loadTrends();
    void loadIdeas();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [refreshIdeasMeta]);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setSemanticFilteredIdeas(null);
    setSemanticFilterText(null);
    setError(null);
  }, []);

  const handleSemanticSearch = useCallback(async (queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) {
      setSemanticFilteredIdeas(null);
      setSemanticFilterText(null);
      return;
    }

    setSemanticFiltering(true);
    setError(null);
    try {
      const result = await filterIdeas(query);
      setSemanticFilteredIdeas(result.filteredCandidates);
      setSemanticFilterText(result.filterReasoning);
    } catch (err) {
      const message = err instanceof Error ? err.message : '意味検索に失敗しました';
      setError(userFacingError(message));
    } finally {
      setSemanticFiltering(false);
    }
  }, [searchQuery]);

  // Refresh
  const handleRefresh = useCallback((focusKeyword?: string) => {
    setLoading(true);
    setIdeas([]);
    setError(null);
    setSemanticFilteredIdeas(null);
    setSemanticFilterText(null);
    setSourceSummary(null);
    setProgressText('トレンドデータを取得しています...');
    abortRef.current?.abort();

    abortRef.current = refreshIdeas({
      onProgress: (text) => setProgressText(text),
      onIdeaGenerated: (idea) => setIdeas((prev) => [...prev, idea]),
      onComplete: (summary) => {
        setSourceSummary(summary.sourceSummary ?? null);
        setLoading(false);
        setProgressText(null);
        refreshIdeasMeta(true);
      },
      onError: (msg) => {
        setError(userFacingError(msg));
        setLoading(false);
        setProgressText(null);
      },
    }, focusKeyword);
  }, [refreshIdeasMeta]);

  const handleTrendRefresh = useCallback(async () => {
    setTrendsLoading(true);
    setTrendError(null);
    try {
      const result = await refreshTrends();
      setTrends(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'トレンド再取得に失敗しました';
      setTrendError(userFacingError(message));
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  const handleOpenIdeas = useCallback(() => {
    setActiveView('ideas');
    if (ideas.length === 0 && !loading) handleRefresh();
  }, [handleRefresh, ideas.length, loading]);

  const handleUseSignal = useCallback((query: string) => {
    const normalized = query.trim();
    if (!normalized) return;
    setSemanticFilteredIdeas(null);
    setSemanticFilterText(null);
    setError(null);
    setActiveView('ideas');
    if (ideas.length > 0) {
      setSearchQuery(normalized);
      void handleSemanticSearch(normalized);
    } else if (!loading) {
      setSearchQuery('');
      handleRefresh(normalized);
    }
  }, [handleRefresh, handleSemanticSearch, ideas.length, loading]);

  const sourceIdeas = semanticFilteredIdeas ?? ideas;
  const displayedIdeas = sortIdeas(
    sourceIdeas.filter((idea) => {
      const text = ideaText(idea);
      const normalizedSearch = searchQuery.trim().toLowerCase();
      if (!semanticFilteredIdeas && normalizedSearch && !text.toLowerCase().includes(normalizedSearch)) return false;
      if (activeTech !== 'すべて' && !text.includes(activeTech.replace('AI・機械学習', 'AI'))) return false;
      if (activeInterests.length > 0) {
        const hasInterestMatch = activeInterests.some((interest) => {
          const keywords = INTEREST_KEYWORDS[interest] ?? [];
          return keywords.length === 0 || keywords.some((keyword) => text.includes(keyword));
        });
        if (!hasInterestMatch) return false;
      }
      if (revenueMin !== null && revenueScore(idea.revenuePotential) < revenueMin) return false;
      if (timeframeMin !== null && timeframeScore(idea.estimatedMvpTime) < timeframeMin) return false;
      return matchesTab(idea, activeTab);
    }),
    sortLabel,
  );

  const topRevenueIdea = sortIdeas(displayedIdeas, '収益性順')[0] ?? ideas[0];
  const topTrendIdea = sortIdeas(displayedIdeas, 'トレンドスコア順')[0] ?? ideas[0];
  const hasIdeas = ideas.length > 0;
  const showXMissingWarning = hasIdeas
    && (sourceSummary?.xSignalCount ?? 0) === 0
    && ideasMeta?.env?.hasXBearerToken
    && ideasMeta?.env?.xSearchFixtureMode !== 'replay';
  const showDashboard = loading || hasIdeas;
  const showSetupState = !loading && !hasIdeas;
  const handleIdeaSelect = useCallback((idea: IdeaCandidate) => {
    setSelectedIdea(idea);
    setModalIdea(idea);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__top">
          <div className="app-header__brand">
            <div>
              <span className="app-header__eyebrow">AI Build Radar</span>
              <h1>作るものが決まっていないエンジニアへ</h1>
              <p>今日のAIトレンドと需要投稿から、個人開発で作れるプロダクト案を提案します。</p>
            </div>
          </div>
          <div className="app-header__status">
            <span>API {getApiBase()}</span>
            <span>X {ideasMeta?.env?.hasXBearerToken ? 'connected' : 'not set'}</span>
            <span>最終生成 {formatStamp(sourceSummary ? (ideasMeta?.cache?.generatedAt ?? null) : null)}</span>
          </div>
        </div>

        <nav className="workspace-tabs" aria-label="主要機能">
          <button
            type="button"
            className={`workspace-tabs__item ${activeView === 'ideas' ? 'workspace-tabs__item--active' : ''}`}
            onClick={handleOpenIdeas}
          >
            作るもの提案
            {hasIdeas && <span>{ideas.length}</span>}
          </button>
          <button
            type="button"
            className={`workspace-tabs__item ${activeView === 'trends' ? 'workspace-tabs__item--active' : ''}`}
            onClick={() => setActiveView('trends')}
          >
            トレンド
          </button>
        </nav>

        {activeView === 'ideas' && (
          <div className="idea-command-bar">
            <div className="idea-command-bar__search">
              <span className="idea-command-bar__search-icon">⌕</span>
              <input
                type="text"
                placeholder="キーワードで絞り込み（例: AI ツール、SaaS、副業）"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                disabled={!hasIdeas}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSemanticSearch();
                }}
              />
            </div>
            <button
              type="button"
              className="idea-command-bar__secondary"
              onClick={() => void handleSemanticSearch()}
              disabled={!hasIdeas || loading || semanticFiltering || !searchQuery.trim()}
            >
              {semanticFiltering ? '検索中...' : 'AIで絞り込み'}
            </button>
            <button
              type="button"
              className="idea-command-bar__primary"
              onClick={() => handleRefresh()}
              disabled={loading}
            >
              {loading ? '生成中...' : hasIdeas ? '再生成' : '生成する'}
            </button>
          </div>
        )}
      </header>

      <main className="workspace">
        {activeView === 'trends' && (
          <TrendBoard
            trends={trends}
            loading={trendsLoading}
            error={trendError}
            onRefresh={() => void handleTrendRefresh()}
            onOpenIdeas={handleOpenIdeas}
            onUseSignal={handleUseSignal}
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

            {showXMissingWarning && (
              <div className="data-warning-banner">
                <span className="data-warning-banner__icon">!</span>
                <p>
                  Xトークンは設定済みですが、この生成結果はXシグナル0件です（backend: {ideasMeta?.instanceId}）。
                  再生成すると最新データで作り直します。
                </p>
              </div>
            )}

            {semanticFilterText && (
              <div className="semantic-filter-banner">
                <span className="semantic-filter-banner__label">意味検索</span>
                <p>{semanticFilterText}</p>
              </div>
            )}

            {showSetupState && (
              <section className="setup-state">
                <div className="setup-state__icon">BR</div>
                <h2>トレンドから作るものを生成します</h2>
                <p>
                  RSS と X の市場シグナルを材料に、個人開発で検証しやすいプロダクト案を出します。
                </p>
                <button type="button" className="setup-state__button" onClick={() => handleRefresh()}>
                  アイデアを生成
                </button>
              </section>
            )}

            {showDashboard && (
              <div className="dashboard">
                {hasIdeas && (
                  <Sidebar
                    onTechFilter={setActiveTech}
                    onInterestChange={setActiveInterests}
                    onRevenueChange={setRevenueMin}
                    onTimeframeChange={setTimeframeMin}
                    onSortChange={setSortLabel}
                    highlightedIdea={topTrendIdea}
                  />
                )}

                <section className="main-content">
                  {hasIdeas && <StatsBar ideas={displayedIdeas} />}

                  {hasIdeas && (
                    <TabFilter
                      activeTab={activeTab}
                      viewMode={viewMode}
                      onTabChange={setActiveTab}
                      onViewChange={setViewMode}
                      sortLabel={sortLabel}
                      resultCount={displayedIdeas.length}
                    />
                  )}

                  {loading && ideas.length === 0 && (
                    <div className="loading-state">
                      <div className="loading-state__spinner" />
                      <h2>アイデアを生成しています</h2>
                      <p>{progressText || 'トレンドデータを分析中です。完了すると候補が一覧に表示されます。'}</p>
                    </div>
                  )}

                  {displayedIdeas.length > 0 && (
                    <div className={`idea-grid idea-grid--${viewMode}`}>
                      {displayedIdeas.map((idea, index) => (
                        <IdeaCard
                          key={idea.id}
                          idea={idea}
                          index={index}
                          viewMode={viewMode}
                          selected={selectedIdea?.id === idea.id}
                          onSelect={handleIdeaSelect}
                        />
                      ))}
                    </div>
                  )}

                  {hasIdeas && !loading && displayedIdeas.length === 0 && (
                    <div className="empty-state">
                      <h2>条件に合うアイデアがありません</h2>
                      <p>検索語、タブ、左側のフィルターを緩めると候補が戻ります。</p>
                    </div>
                  )}
                </section>

                {hasIdeas && (
                  <RightPanel
                    ideas={displayedIdeas}
                    selectedIdea={selectedIdea}
                    topRevenueIdea={topRevenueIdea}
                    topTrendIdea={topTrendIdea}
                  />
                )}
              </div>
            )}
          </>
        )}
      </main>
      {modalIdea && <IdeaDetailModal idea={modalIdea} onClose={() => setModalIdea(null)} />}
    </div>
  );
}

export default App;
