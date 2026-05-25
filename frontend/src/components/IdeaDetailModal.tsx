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

const DETAIL_BULLET_MAX_ITEMS = 5;
const DETAIL_BULLET_MAX_CHARS = 70;
const RELATED_ARTICLE_MAX_ITEMS = 4;

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

function trimDetailItem(value: string): string {
    return value
        .replace(/^[\s・\-*•]+/, '')
        .trim()
        .replace(/[。．.]+$/u, '')
        .trim();
}

function compactDetailItem(value: string): string {
    const trimmed = trimDetailItem(value);
    const chars = Array.from(trimmed);
    if (chars.length <= DETAIL_BULLET_MAX_CHARS) return trimmed;
    return trimDetailItem(`${chars.slice(0, DETAIL_BULLET_MAX_CHARS - 1).join('').trimEnd()}…`);
}

function detailItems(description: string): string[] {
    const lines = description
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const alreadyList = lines.length > 1 || lines.some((line) => /^[・\-*•]/.test(line));
    const rawItems = alreadyList
        ? lines
        : description
            .replace(/\r?\n/g, ' ')
            .split(/。|．|(?:\.(?:\s+|$))/u);
    const items = rawItems
        .map(compactDetailItem)
        .filter(Boolean);

    return (items.length > 0 ? items : [compactDetailItem(description)])
        .slice(0, DETAIL_BULLET_MAX_ITEMS);
}

export default function IdeaDetailModal({ idea, trendSignal = null, onClose }: IdeaDetailModalProps): JSX.Element {
    const evidenceUrls = idea.sources.evidenceUrls ?? [];
    const visibleTrendSignal = trendSignal?.status === 'stale' ? null : trendSignal;
    const details = detailItems(idea.description);
    const evidenceUrlSet = new Set(evidenceUrls.map((source) => normalizeUrl(source.url)));
    const relatedTrendArticles = (visibleTrendSignal?.relatedArticles ?? [])
        .filter((article) => !evidenceUrlSet.has(normalizeUrl(article.url)))
        .slice(0, RELATED_ARTICLE_MAX_ITEMS);

    return (
        <div className="idea-modal" role="dialog" aria-modal="true" aria-labelledby="idea-modal-title">
            <button type="button" className="idea-modal__backdrop" onClick={onClose} aria-label="閉じる" />
            <section className="idea-modal__panel">
                <div className="idea-modal__header">
                    <div className="idea-modal__heading">
                        <h2 id="idea-modal-title" className="idea-modal__title">{idea.title}</h2>
                        <div className="idea-modal__target">
                            <span className="idea-modal__summary-label">対象ユーザー</span>
                            <p className="idea-modal__target-text">{idea.targetUsers}</p>
                        </div>
                        <div className="idea-modal__summary">
                            <span className="idea-modal__summary-label">概要</span>
                            <p className="idea-modal__tagline">{idea.tagline}</p>
                        </div>
                    </div>
                    <button type="button" className="idea-modal__close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div className="idea-modal__body">
                    <section className="idea-modal__section idea-modal__section--wide idea-modal__section--detail">
                        <h3>詳細</h3>
                        <ul className="idea-modal__detail-list">
                            {details.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                        </ul>
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

                    {visibleTrendSignal && relatedTrendArticles.length > 0 && (
                        <section className="idea-modal__section idea-modal__section--wide idea-modal__trend-section">
                            <div className="idea-modal__trend-head">
                                <div>
                                    <span className={`idea-modal__trend-badge idea-modal__trend-badge--${visibleTrendSignal.status}`}>
                                        {topicStatusLabel(visibleTrendSignal.status)}トレンド
                                    </span>
                                    <h3>関連記事</h3>
                                </div>
                            </div>
                            <p className="idea-modal__trend-topic">
                                <span>関連トピック</span>
                                {visibleTrendSignal.label}
                            </p>
                            <div className="idea-modal__related-links" aria-label="関連記事">
                                {relatedTrendArticles.map((article) => (
                                    <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer">
                                        <span className="idea-modal__related-source">{article.source}</span>
                                        <span className="idea-modal__related-title">{article.title}</span>
                                    </a>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="idea-modal__section">
                        <h3>タグ</h3>
                        <div className="idea-modal__tags">
                            {idea.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    );
}
