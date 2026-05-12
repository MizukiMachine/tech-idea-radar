import { useState, useCallback, useRef, useEffect } from 'react';
import type { IdeaCandidate } from './types/idea-candidate';
import { fetchIdeas, streamIdeas, filterIdeas, refreshIdeas } from './api/ai';
import './App.css';

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#3b82f6';
  return '#9ca3af';
}

function revenueLabel(potential: string): string {
  const map: Record<string, string> = { 'very high': '★★★★', high: '★★★', medium: '★★', low: '★' };
  return map[potential.toLowerCase()] ?? potential;
}

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
      // Restore all ideas from cache when search cleared
      fetchIdeas().then((result) => setIdeas(result.candidates)).catch(() => {});
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
      {/* Header */}
      <header className="header">
        <div className="header__left">
          <div className="header__logo">
            <div className="header__logo-icon">B</div>
            <span className="header__title">Builder Agent Chain</span>
          </div>
        </div>
        <button type="button" className="btn btn--refresh" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Generating...' : 'Refresh'}
        </button>
      </header>

      {/* Search Bar */}
      <div className="search-bar">
        <span className="search-bar__icon">&#128269;</span>
        <input
          type="text"
          className="search-bar__input"
          placeholder="アイデアを検索（例: AI ツール、SaaS、副業...）"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {isFiltering && <span className="search-bar__spinner" />}
      </div>

      {/* Progress indicator */}
      {progressText && (
        <div className="progress-bar">
          <span className="progress-bar__text">{progressText}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span className="error-banner__icon">!</span>
          <p>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && ideas.length === 0 && (
        <div className="loading-state">
          <div className="loading-state__spinner" />
          <p>{progressText || 'トレンドデータを分析してアイデアを生成中...'}</p>
        </div>
      )}

      {/* Idea Grid */}
      {ideas.length > 0 && (
        <div className="idea-grid">
          {ideas.map((idea) => (
            <div key={idea.id} className="idea-card">
              <div className="idea-card__header">
                <h3 className="idea-card__title">{idea.title}</h3>
                <span className="idea-card__score" style={{ color: scoreColor(idea.trendScore) }}>
                  {idea.trendScore}
                </span>
              </div>
              <p className="idea-card__tagline">{idea.tagline}</p>
              <p className="idea-card__description">{idea.description}</p>
              <div className="idea-card__tags">
                {idea.tags.map((tag) => (
                  <span key={tag} className="idea-card__tag">{tag}</span>
                ))}
              </div>
              <div className="idea-card__footer">
                <span className="idea-card__meta">{idea.productType}</span>
                <span className="idea-card__meta">{idea.estimatedMvpTime}</span>
                <span className="idea-card__revenue">{revenueLabel(idea.revenuePotential)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state after filtering */}
      {!loading && ideas.length === 0 && searchQuery && (
        <div className="empty-state">
          <p>「{searchQuery}」にマッチするアイデアが見つかりませんでした</p>
        </div>
      )}
    </div>
  );
}

export default App;
