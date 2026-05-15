import { useState, useCallback, useRef, useEffect } from 'react';
import type { IdeaCandidate } from './types/idea-candidate';
import {
  fetchIdeas,
  fetchIdeasMeta,
  fetchTrends,
  refreshIdeas,
  refreshTrends,
  filterIdeas,
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
import { getDevelopmentScale } from './utils/idea-metrics';
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

function matchesTab(idea: IdeaCandidate, tab: string): boolean {
  if (tab === 'すべて') return true;
  const text = ideaText(idea);
  const tabKeywords: Record<string, string[]> = {
    SaaS: ['SaaS', 'サブスク', 'B2B'],
    AI: ['AI', '機械学習', 'LLM', '生成', '自動化'],
    プロダクト仮説: ['仮説', '検証', 'プロダクト', '市場', '課題'],
    業務効率化: ['業務', '効率', '自動化', '管理'],
    データ: ['データ', '分析', '可視化', 'レポート'],
    学習: ['学習', '教育', '研修', 'ナレッジ'],
    'API・ツール': ['API', 'ツール', '開発者', 'SDK'],
  };
  return (tabKeywords[tab] ?? [tab]).some((keyword) => text.includes(keyword));
}

function matchesCategory(idea: IdeaCandidate, category: string): boolean {
  if (category === 'すべて') return true;
  const keywords = CATEGORY_KEYWORDS[category] ?? [category];
  const text = ideaText(idea);
  return keywords.some((keyword) => text.includes(keyword));
}

function sortIdeas(ideas: IdeaCandidate[], sort: string): IdeaCandidate[] {
  const sorted = [...ideas];
  if (sort === 'トレンドスコア順') return sorted.sort((a, b) => b.trendScore - a.trendScore);
  if (sort === '収益性順') return sorted.sort((a, b) => revenueScore(b.revenuePotential) - revenueScore(a.revenuePotential));
  if (sort === '開発規模 小さい順' || sort === '開発規模順') {
    return sorted.sort((a, b) => getDevelopmentScale(a) - getDevelopmentScale(b) || b.trendScore - a.trendScore);
  }
  return sorted.sort((a, b) => {
    const aScore = a.trendScore + revenueScore(a.revenuePotential);
    const bScore = b.trendScore + revenueScore(b.revenuePotential);
    return bScore - aScore;
  });
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

function userFacingError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('stream failed')) {
    if (normalized.includes('401') || normalized.includes('403')) {
      return '公開版ではキャッシュ済みのアイデアのみ表示しています。再生成は管理環境で実行します。';
    }
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
  const [activeCategory, setActiveCategory] = useState('すべて');
  const [activeInterests, setActiveInterests] = useState<string[]>([]);
  const [revenueMin, setRevenueMin] = useState<number | null>(null);
  const [scaleMax, setScaleMax] = useState<number | null>(null);
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
  const publicReadonlyMode = Boolean(ideasMeta?.env?.publicReadonlyMode);
  const generatedAt = ideasMeta?.cache?.generatedAt ?? null;
  const headerStatusItems = [
    ideasMeta ? (publicReadonlyMode ? '閲覧用キャッシュ' : '編集・生成モード') : 'データ確認中',
    'データ元 RSS',
    `最終更新 ${formatStamp(generatedAt)}`,
  ];

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
    if (publicReadonlyMode) {
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
  }, [publicReadonlyMode, searchQuery]);

  // Refresh
  const handleRefresh = useCallback((focusKeyword?: string) => {
    if (publicReadonlyMode) {
      setError('公開版ではキャッシュ済みのアイデアのみ表示しています。再生成は管理環境で実行します。');
      return;
    }

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
  }, [publicReadonlyMode, refreshIdeasMeta]);

  const handleTrendRefresh = useCallback(async () => {
    if (publicReadonlyMode) {
      setTrendError('公開版ではキャッシュ済みのトレンドのみ表示しています。再取得は管理環境で実行します。');
      return;
    }

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
  }, [publicReadonlyMode]);

  const handleOpenIdeas = useCallback(() => {
    setActiveView('ideas');
    if (ideas.length === 0 && !loading && !publicReadonlyMode) handleRefresh();
  }, [handleRefresh, ideas.length, loading, publicReadonlyMode]);

  const sourceIdeas = semanticFilteredIdeas ?? ideas;
  const displayedIdeas = sortIdeas(
    sourceIdeas.filter((idea) => {
      const text = ideaText(idea);
      const normalizedSearch = searchQuery.trim().toLowerCase();
      if (!semanticFilteredIdeas && normalizedSearch && !matchesSearchQuery(text, normalizedSearch)) return false;
      if (!matchesCategory(idea, activeCategory)) return false;
      if (activeInterests.length > 0) {
        const hasInterestMatch = activeInterests.some((interest) => {
          const keywords = INTEREST_KEYWORDS[interest] ?? [];
          return keywords.length === 0 || keywords.some((keyword) => text.includes(keyword));
        });
        if (!hasInterestMatch) return false;
      }
      if (revenueMin !== null && revenueScore(idea.revenuePotential) < revenueMin) return false;
      if (scaleMax !== null && getDevelopmentScale(idea) > scaleMax) return false;
      return matchesTab(idea, activeTab);
    }),
    sortLabel,
  );

  const topRevenueIdea = sortIdeas(displayedIdeas, '収益性順')[0] ?? ideas[0];
  const topTrendIdea = sortIdeas(displayedIdeas, 'トレンドスコア順')[0] ?? ideas[0];
  const hasIdeas = ideas.length > 0;
  const showDashboard = loading || hasIdeas;
  const showSetupState = !loading && !hasIdeas;
  const showIdeaCommandBar = activeView === 'ideas' && (hasIdeas || !publicReadonlyMode);
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
              <p>今日の技術ニュースとAI開発トレンドから、検証の起点になるプロダクト仮説を提案します。</p>
            </div>
          </div>
          <div className="app-header__status">
            {headerStatusItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
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

        {showIdeaCommandBar && (
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
                  if (e.key === 'Enter' && !publicReadonlyMode) void handleSemanticSearch();
                }}
              />
              {searchQuery && hasIdeas && (
                <button
                  type="button"
                  className="idea-command-bar__clear"
                  onClick={() => handleSearch('')}
                  aria-label="検索条件をクリア"
                >
                  ×
                </button>
              )}
            </div>
            {!publicReadonlyMode && (
              <button
                type="button"
                className="idea-command-bar__secondary"
                onClick={() => void handleSemanticSearch()}
                disabled={!hasIdeas || loading || semanticFiltering || !searchQuery.trim()}
              >
                {semanticFiltering ? '検索中...' : 'AIで絞り込み'}
              </button>
            )}
            {!publicReadonlyMode && (
              <button
                type="button"
                className="idea-command-bar__primary"
                onClick={() => handleRefresh()}
                disabled={loading}
              >
                {loading ? '生成中...' : hasIdeas ? '再生成' : '生成する'}
              </button>
            )}
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
            refreshDisabled={publicReadonlyMode}
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

            {semanticFilterText && (
              <div className="semantic-filter-banner">
                <span className="semantic-filter-banner__label">意味検索</span>
                <p>{semanticFilterText}</p>
              </div>
            )}

            {showSetupState && (
              <section className="setup-state">
                <div className="setup-state__icon">BR</div>
                <h2>{publicReadonlyMode ? '公開データを準備中です' : 'トレンドから作るものを生成します'}</h2>
                <p>
                  {publicReadonlyMode
                    ? '現在表示できるアイデアがありません。データ更新後に候補が表示されます。'
                    : '技術ニュースとRSSシグナルを材料に、検証の起点になるプロダクト仮説を出します。'}
                </p>
                {!publicReadonlyMode && (
                  <button type="button" className="setup-state__button" onClick={() => handleRefresh()}>
                    アイデアを生成
                  </button>
                )}
              </section>
            )}

            {showDashboard && (
              <div className="dashboard">
                {hasIdeas && (
                  <Sidebar
                    onCategoryFilter={setActiveCategory}
                    onInterestChange={setActiveInterests}
                    onRevenueChange={setRevenueMin}
                    onScaleChange={setScaleMax}
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
