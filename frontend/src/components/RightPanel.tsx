import type { IdeaCandidate } from '../types/idea-candidate';
import './RightPanel.css';

const TECH_COLORS = ['#1a1f36', '#3b82f6', '#3178c6', '#ff9900', '#00B67A'];

function buildTechStackData(ideas: IdeaCandidate[]) {
    const counts = new Map<string, number>();
    ideas.forEach((idea) => {
        idea.tags.forEach((tag) => {
            if (tag.length <= 16) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        });
    });

    const total = Math.max(ideas.length, 1);
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count], index) => ({
            name,
            pct: Math.max(8, Math.round((count / total) * 100)),
            color: TECH_COLORS[index % TECH_COLORS.length],
        }));
}

interface RightPanelProps {
    ideas: IdeaCandidate[];
    selectedIdea: IdeaCandidate | null;
    topRevenueIdea?: IdeaCandidate;
    topTrendIdea?: IdeaCandidate;
}

export default function RightPanel({
    ideas,
    selectedIdea,
    topRevenueIdea,
    topTrendIdea,
}: RightPanelProps): JSX.Element {
    const techStackData = buildTechStackData(ideas);
    const detailIdea = selectedIdea ?? topTrendIdea;

    return (
        <aside className="right-panel">
            {/* High Revenue Potential Card */}
            <div className="right-panel__card right-panel__card--highlight">
                <div className="right-panel__card-badge">高収益ポテンシャル</div>
                <h3 className="right-panel__card-title">{topRevenueIdea?.title ?? '候補を分析中'}</h3>
                <p className="right-panel__card-desc">
                    {topRevenueIdea?.coreProblem ?? '収益性の高いアイデアを抽出しています'}
                </p>
                <span className="right-panel__card-tag">{topRevenueIdea?.revenuePotential ?? '-'}</span>
            </div>

            {/* Trending Card */}
            <div className="right-panel__card right-panel__card--trend">
                <div className="right-panel__card-badge">急上昇トレンド</div>
                <h3 className="right-panel__card-title">{topTrendIdea?.title ?? '候補を分析中'}</h3>
                <p className="right-panel__card-desc">
                    {topTrendIdea?.description ?? 'トレンドスコアの高い候補を抽出しています'}
                </p>
                <span className="right-panel__card-tag">Score {topTrendIdea?.trendScore ?? '-'}</span>
            </div>

            <div className="right-panel__card right-panel__card--detail">
                <div className="right-panel__card-badge">選択中のアイデア</div>
                <h3 className="right-panel__card-title">{detailIdea?.title ?? 'カードを選択'}</h3>
                <dl className="right-panel__detail-list">
                    <div>
                        <dt>対象ユーザー</dt>
                        <dd>{detailIdea?.targetUsers ?? '-'}</dd>
                    </div>
                    <div>
                        <dt>解く課題</dt>
                        <dd>{detailIdea?.coreProblem ?? '-'}</dd>
                    </div>
                    <div>
                        <dt>差別化</dt>
                        <dd>{detailIdea?.differentiation ?? '-'}</dd>
                    </div>
                    <div>
                        <dt>MVP目安</dt>
                        <dd>{detailIdea?.estimatedMvpTime ?? '-'}</dd>
                    </div>
                </dl>
            </div>

            {/* Tech Stack Chart */}
            <div className="right-panel__card">
                <h4 className="right-panel__chart-title">人気の技術スタック</h4>
                <div className="right-panel__chart">
                    {techStackData.map((tech) => (
                        <div key={tech.name} className="right-panel__chart-row">
                            <div className="right-panel__chart-label">
                                <span className="right-panel__chart-name">{tech.name}</span>
                            </div>
                            <div className="right-panel__chart-bar-bg">
                                <div
                                    className="right-panel__chart-bar"
                                    style={{ width: `${tech.pct}%`, backgroundColor: tech.color }}
                                />
                            </div>
                            <span className="right-panel__chart-pct">{tech.pct}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
