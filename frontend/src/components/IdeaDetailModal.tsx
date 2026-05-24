import type { IdeaCandidate } from '../types/idea-candidate';
import type { IdeaTrendSignal } from '../types/idea-trend-signal';
import { cleanDisplayText } from '../utils/html-text';
import { topicStatusLabel } from '../utils/trend-status';
import './IdeaDetailModal.css';

interface IdeaDetailModalProps {
    idea: IdeaCandidate;
    trendSignal?: IdeaTrendSignal | null;
    onClose: () => void;
}

function formatDate(value: string | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function normalizeUrl(value: string): string {
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

function evidenceTitle(
    source: NonNullable<IdeaCandidate['sources']['evidenceUrls']>[number],
    trendSignal: IdeaTrendSignal | null,
): string {
    const sourceUrl = normalizeUrl(source.url);
    const trendArticle = trendSignal?.evidenceArticles.find((article) => normalizeUrl(article.url) === sourceUrl);
    return cleanDisplayText(trendArticle?.title || source.title || source.url);
}

export default function IdeaDetailModal({ idea, trendSignal = null, onClose }: IdeaDetailModalProps): JSX.Element {
    const evidenceUrls = idea.sources.evidenceUrls ?? [];
    const visibleTrendSignal = trendSignal?.status === 'stale' ? null : trendSignal;

    return (
        <div className="idea-modal" role="dialog" aria-modal="true" aria-labelledby="idea-modal-title">
            <button type="button" className="idea-modal__backdrop" onClick={onClose} aria-label="閉じる" />
            <section className="idea-modal__panel">
                <div className="idea-modal__header">
                    <div>
                        <span className="idea-modal__eyebrow">{idea.productType}</span>
                        <h2 id="idea-modal-title" className="idea-modal__title">{idea.title}</h2>
                        <div className="idea-modal__summary">
                            <span className="idea-modal__summary-label">概要</span>
                            <p className="idea-modal__tagline">{idea.tagline}</p>
                        </div>
                    </div>
                    <button type="button" className="idea-modal__close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div className="idea-modal__body">
                    <section className="idea-modal__section idea-modal__section--wide idea-modal__section--target">
                        <h3>対象ユーザー</h3>
                        <p>{idea.targetUsers}</p>
                    </section>

                    <section className="idea-modal__section idea-modal__section--wide">
                        <h3>詳細</h3>
                        <p>{idea.description}</p>
                    </section>

                    {visibleTrendSignal && (
                        <section className="idea-modal__section idea-modal__section--wide idea-modal__trend-section">
                            <div className="idea-modal__trend-head">
                                <div>
                                    <span className={`idea-modal__trend-badge idea-modal__trend-badge--${visibleTrendSignal.status}`}>
                                        {topicStatusLabel(visibleTrendSignal.status)}トレンド
                                    </span>
                                    <h3>トレンド根拠</h3>
                                </div>
                                <span className="idea-modal__trend-topic">{visibleTrendSignal.label}</span>
                            </div>
                            <div className="idea-modal__trend-metrics">
                                <span>観測規模 <strong>{visibleTrendSignal.sourceCount}</strong>媒体 / <strong>{visibleTrendSignal.articleCount}</strong>記事</span>
                                <span>初回 {formatDate(visibleTrendSignal.firstSeenAt)}</span>
                                <span>最終 {formatDate(visibleTrendSignal.lastSeenAt)}</span>
                            </div>
                            {visibleTrendSignal.sources.length > 0 && (
                                <div className="idea-modal__trend-sources" aria-label="観測媒体">
                                    {visibleTrendSignal.sources.map((source) => (
                                        <span key={source}>{source}</span>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    <section className="idea-modal__section">
                        <h3>解く課題</h3>
                        <p>{idea.coreProblem}</p>
                    </section>

                    <section className="idea-modal__section">
                        <h3>差別化</h3>
                        <p>{idea.differentiation}</p>
                    </section>

                    <section className="idea-modal__section">
                        <h3>タグ</h3>
                        <div className="idea-modal__tags">
                            {idea.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                    </section>

                    <section className="idea-modal__section idea-modal__section--wide">
                        <h3>根拠・参照元</h3>
                        {evidenceUrls.length > 0 ? (
                            <div className="idea-modal__links">
                                {evidenceUrls.map((source) => (
                                    <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                                        <span>{source.type}</span>
                                        {evidenceTitle(source, visibleTrendSignal)}
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="idea-modal__evidence-empty">
                                <p>この生成結果には参照URLは含まれていません。</p>
                                <div className="idea-modal__tags">
                                    {idea.sources.rssKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </section>
        </div>
    );
}
