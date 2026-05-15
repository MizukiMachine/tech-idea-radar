import type { IdeaCandidate } from '../types/idea-candidate';
import { developmentScaleStars, getDevelopmentScale } from '../utils/idea-metrics';
import './StatsBar.css';

interface StatsBarProps {
    ideas: IdeaCandidate[];
}

export default function StatsBar({ ideas }: StatsBarProps): JSX.Element {
    const count = ideas.length;
    const avgScore = count > 0 ? Math.round(ideas.reduce((s, i) => s + i.trendScore, 0) / count) : 0;
    const avgScale = count > 0 ? Math.round(ideas.reduce((s, i) => s + getDevelopmentScale(i), 0) / count) : 0;
    const highRevCount = ideas.filter(
        (i) => ['high', 'very high'].includes(i.revenuePotential.toLowerCase())
    ).length;

    const marketLevel = avgScore >= 60 ? '高い' : avgScore >= 40 ? '中程度' : '低い';
    const revenueLevel = highRevCount > count * 0.4 ? '高い' : highRevCount > count * 0.2 ? '中程度' : '低い';

    return (
        <div className="stats-bar">
            <div className="stats-bar__item">
                <div className="stats-bar__icon stats-bar__icon--blue">No</div>
                <div className="stats-bar__content">
                    <div className="stats-bar__label">提案アイデア数</div>
                    <div className="stats-bar__value">
                        <span className="stats-bar__number">{count}</span>
                        <span className="stats-bar__unit">件</span>
                    </div>
                </div>
            </div>

            <div className="stats-bar__item">
                <div className="stats-bar__icon stats-bar__icon--green">Mk</div>
                <div className="stats-bar__content">
                    <div className="stats-bar__label">市場ニーズ</div>
                    <div className="stats-bar__value">
                        <span className="stats-bar__number">{marketLevel}</span>
                        <div className="stats-bar__mini-bars">
                            <span className={`stats-bar__mini-bar ${avgScore >= 20 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${avgScore >= 40 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${avgScore >= 60 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${avgScore >= 80 ? 'stats-bar__mini-bar--active' : ''}`} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="stats-bar__item">
                <div className="stats-bar__icon stats-bar__icon--purple">Sc</div>
                <div className="stats-bar__content">
                    <div className="stats-bar__label">平均開発規模</div>
                    <div className="stats-bar__value">
                        <span className="stats-bar__number stats-bar__number--scale">
                            {avgScale > 0 ? developmentScaleStars(avgScale) : '-'}
                        </span>
                        <div className="stats-bar__mini-bars">
                            <span className={`stats-bar__mini-bar ${avgScale >= 2 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${avgScale >= 3 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${avgScale >= 4 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${avgScale >= 5 ? 'stats-bar__mini-bar--active' : ''}`} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="stats-bar__item">
                <div className="stats-bar__icon stats-bar__icon--orange">Rev</div>
                <div className="stats-bar__content">
                    <div className="stats-bar__label">収益化しやすさ</div>
                    <div className="stats-bar__value">
                        <span className="stats-bar__number">{revenueLevel}</span>
                        <div className="stats-bar__mini-bars">
                            <span className={`stats-bar__mini-bar ${highRevCount >= 2 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${highRevCount >= 5 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${highRevCount >= 10 ? 'stats-bar__mini-bar--active' : ''}`} />
                            <span className={`stats-bar__mini-bar ${highRevCount >= 20 ? 'stats-bar__mini-bar--active' : ''}`} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
