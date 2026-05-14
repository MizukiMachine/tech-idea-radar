import { useState, useCallback, useRef, useEffect } from 'react';
import type { IdeaCandidate } from './types/idea-candidate';
import { fetchIdeas, streamIdeas, refreshIdeas, filterIdeas, type SourceSummary } from './api/ai';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import TabFilter from './components/TabFilter';
import IdeaCard from './components/IdeaCard';
import RightPanel from './components/RightPanel';
import IdeaDetailModal from './components/IdeaDetailModal';
import './App.css';

type ViewMode = 'grid' | 'list';

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

function App(): JSX.Element {
  const [ideas, setIdeas] = useState<IdeaCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [semanticFilterText, setSemanticFilterText] = useState<string | null>(null);
  const [semanticFilteredIdeas, setSemanticFilteredIdeas] = useState<IdeaCandidate[] | null>(null);
  const [semanticFiltering, setSemanticFiltering] = useState(false);
  const [sourceSummary, setSourceSummary] = useState<SourceSummary | null>(null);
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

  // Load ideas on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchIdeas();
        if (!cancelled && result.candidates.length > 0) {
          setIdeas(result.candidates);
          setSourceSummary(result.sourceSummary);
          setLoading(false);
          return;
        }
      } catch { /* cache miss, fall through to stream */ }

      if (cancelled) return;

      // Stream ideas
      abortRef.current = streamIdeas({
        onProgress: (text) => setProgressText(text),
        onIdeaGenerated: (idea) => {
          setIdeas((prev) => [...prev, idea]);
        },
        onComplete: (summary) => {
          setSourceSummary(summary.sourceSummary ?? null);
          setLoading(false);
          setProgressText(null);
        },
        onError: (msg) => {
          setError(userFacingError(msg));
          setLoading(false);
          setProgressText(null);
        },
      });
    }

    load();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setSemanticFilteredIdeas(null);
    setSemanticFilterText(null);
    setError(null);
  }, []);

  const handleSemanticSearch = useCallback(async () => {
    const query = searchQuery.trim();
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
  const handleRefresh = useCallback(() => {
    setLoading(true);
    setIdeas([]);
    setError(null);
    setSearchQuery('');
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
      },
      onError: (msg) => {
        setError(userFacingError(msg));
        setLoading(false);
        setProgressText(null);
      },
    });
  }, []);

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
  const showDashboard = loading || hasIdeas;
  const showSetupState = !loading && !hasIdeas;
  const handleIdeaSelect = useCallback((idea: IdeaCandidate) => {
    setSelectedIdea(idea);
    setModalIdea(idea);
  }, []);

  return (
    <div className="app">
      {/* Hero Header */}
      <header className="hero">
        <h1 className="hero__title">作るものが決まっていないエンジニアへ</h1>
        <p className="hero__subtitle">
          あなたのスキル・興味・市場性から、作るべきアイデアを提案
        </p>

        {/* Search bar in header */}
        <div className="hero__search">
          <span className="hero__search-icon">⌕</span>
          <input
            type="text"
            className="hero__search-input"
            placeholder="キーワードで絞り込み（例: AI ツール、SaaS、副業）"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            disabled={!hasIdeas}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSemanticSearch();
            }}
          />
          <button
            type="button"
            className="hero__semantic-btn"
            onClick={() => void handleSemanticSearch()}
            disabled={!hasIdeas || loading || semanticFiltering || !searchQuery.trim()}
          >
            {semanticFiltering ? '検索中...' : 'AIで絞り込み'}
          </button>
          <button
            type="button"
            className="hero__refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? '生成中...' : hasIdeas ? '再生成' : '生成する'}
          </button>
        </div>
        {hasIdeas && (
          <p className="hero__search-hint">
            入力すると一覧を絞り込みます。AIで絞り込みは、文章の意図に近い候補を再選定します。
          </p>
        )}
      </header>

      {/* Progress indicator */}
      {progressText && (
        <div className="progress-bar">
          <span className="progress-bar__text">{progressText}</span>
        </div>
      )}

      {error && hasIdeas && (
        <div className="error-banner">
          <span className="error-banner__icon">⚠</span>
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
        <main className="setup-state">
          <div className="setup-state__icon">⌁</div>
          <h2>アイデア生成を開始します</h2>
          <p>
            RSS と X の市場シグナルを集め、個人開発で取り組みやすいプロダクト案を生成します。
          </p>
          {error && <div className="setup-state__error">{error}</div>}
          <button type="button" className="setup-state__button" onClick={handleRefresh}>
            アイデアを生成
          </button>
        </main>
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

          <main className="main-content">
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
          </main>

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
      {modalIdea && <IdeaDetailModal idea={modalIdea} onClose={() => setModalIdea(null)} />}
    </div>
  );
}

export default App;
