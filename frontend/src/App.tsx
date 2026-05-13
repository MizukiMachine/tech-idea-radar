import { useState, useCallback, useRef, useEffect } from 'react';
import type { IdeaCandidate } from './types/idea-candidate';
import { fetchIdeas, streamIdeas, filterIdeas, refreshIdeas } from './api/ai';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import TabFilter from './components/TabFilter';
import IdeaCard from './components/IdeaCard';
import RightPanel from './components/RightPanel';
import './App.css';

function App(): JSX.Element {
  const [ideas, setIdeas] = useState<IdeaCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load ideas on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchIdeas();
        if (!cancelled && result.candidates.length > 0) {
          setIdeas(result.candidates);
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
        onComplete: () => {
          setLoading(false);
          setProgressText(null);
        },
        onError: (msg) => {
          setError(msg);
          setLoading(false);
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
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setIsFiltering(false);
      fetchIdeas().then((result) => setIdeas(result.candidates)).catch(() => { });
      return;
    }

    setIsFiltering(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await filterIdeas(value);
        setIdeas(result.filteredCandidates);
      } catch (err) {
        console.error('Filter error:', err);
      } finally {
        setIsFiltering(false);
      }
    }, 300);
  }, []);

  // Refresh
  const handleRefresh = useCallback(() => {
    setLoading(true);
    setIdeas([]);
    setError(null);
    setSearchQuery('');
    setProgressText('Refreshing...');
    abortRef.current?.abort();

    abortRef.current = refreshIdeas({
      onProgress: (text) => setProgressText(text),
      onIdeaGenerated: (idea) => setIdeas((prev) => [...prev, idea]),
      onComplete: () => {
        setLoading(false);
        setProgressText(null);
      },
      onError: (msg) => {
        setError(msg);
        setLoading(false);
      },
    });
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
          <span className="hero__search-icon">🔍</span>
          <input
            type="text"
            className="hero__search-input"
            placeholder="アイデアを検索（例: AI ツール、SaaS、副業...）"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {isFiltering && <span className="hero__search-spinner" />}
          <button
            type="button"
            className="hero__refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? '生成中...' : '🔄 更新'}
          </button>
        </div>
      </header>

      {/* Progress indicator */}
      {progressText && (
        <div className="progress-bar">
          <span className="progress-bar__text">{progressText}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span className="error-banner__icon">⚠</span>
          <p>{error}</p>
        </div>
      )}

      {/* 3 Column Layout */}
      <div className="dashboard">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main className="main-content">
          {/* Stats */}
          <StatsBar ideas={ideas} />

          {/* Tab Filter */}
          <TabFilter />

          {/* Loading State */}
          {loading && ideas.length === 0 && (
            <div className="loading-state">
              <div className="loading-state__spinner" />
              <p>{progressText || 'トレンドデータを分析してアイデアを生成中...'}</p>
            </div>
          )}

          {/* Idea Grid */}
          {ideas.length > 0 && (
            <div className="idea-grid">
              {ideas.map((idea, index) => (
                <IdeaCard key={idea.id} idea={idea} index={index} />
              ))}
            </div>
          )}

          {/* Empty state after filtering */}
          {!loading && ideas.length === 0 && searchQuery && (
            <div className="empty-state">
              <p>「{searchQuery}」にマッチするアイデアが見つかりませんでした</p>
            </div>
          )}
        </main>

        {/* Right Panel */}
        <RightPanel />
      </div>
    </div>
  );
}

export default App;
