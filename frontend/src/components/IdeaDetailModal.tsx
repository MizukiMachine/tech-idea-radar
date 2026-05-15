import type { IdeaCandidate } from '../types/idea-candidate';
import { developmentScaleLabel, developmentScaleStars, getDevelopmentScale } from '../utils/idea-metrics';
import './IdeaDetailModal.css';

interface IdeaDetailModalProps {
    idea: IdeaCandidate;
    onClose: () => void;
}

export default function IdeaDetailModal({ idea, onClose }: IdeaDetailModalProps): JSX.Element {
    const evidenceUrls = idea.sources.evidenceUrls ?? [];
    const developmentScale = getDevelopmentScale(idea);

    return (
        <div className="idea-modal" role="dialog" aria-modal="true" aria-labelledby="idea-modal-title">
            <button type="button" className="idea-modal__backdrop" onClick={onClose} aria-label="閉じる" />
            <section className="idea-modal__panel">
                <div className="idea-modal__header">
                    <div>
                        <span className="idea-modal__eyebrow">{idea.productType}</span>
                        <h2 id="idea-modal-title" className="idea-modal__title">{idea.title}</h2>
                        <p className="idea-modal__tagline">{idea.tagline}</p>
                    </div>
                    <button type="button" className="idea-modal__close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div className="idea-modal__score-row">
                    <div className="idea-modal__score">
                        <span>市場スコア</span>
                        <strong>{idea.trendScore}</strong>
                    </div>
                    <div className="idea-modal__score">
                        <span>収益性</span>
                        <strong>{idea.revenuePotential}</strong>
                    </div>
                    <div className="idea-modal__score">
                        <span>開発規模</span>
                        <strong className="idea-modal__scale-stars">{developmentScaleStars(developmentScale)}</strong>
                    </div>
                </div>

                <div className="idea-modal__body">
                    <section className="idea-modal__section idea-modal__section--wide">
                        <h3>概要</h3>
                        <p>{idea.description}</p>
                    </section>

                    <section className="idea-modal__section">
                        <h3>対象ユーザー</h3>
                        <p>{idea.targetUsers}</p>
                    </section>

                    <section className="idea-modal__section">
                        <h3>解く課題</h3>
                        <p>{idea.coreProblem}</p>
                    </section>

                    <section className="idea-modal__section">
                        <h3>差別化</h3>
                        <p>{idea.differentiation}</p>
                    </section>

                    <section className="idea-modal__section">
                        <h3>開発規模</h3>
                        <p>{idea.developmentScaleReason ?? developmentScaleLabel(developmentScale)}</p>
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
                                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                                        <span>{source.type}</span>
                                        {source.title || source.url}
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
