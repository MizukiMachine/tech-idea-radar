import type { IdeaCandidate } from '../types/idea-candidate';
import './RightPanel.css';

const TAG_COLORS = ['#1a1f36', '#3b82f6', '#3178c6', '#ff9900', '#00B67A'];

function buildTagData(ideas: IdeaCandidate[]) {
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
            color: TAG_COLORS[index % TAG_COLORS.length],
        }));
}

interface RightPanelProps {
    ideas: IdeaCandidate[];
    featuredIdea: IdeaCandidate | null;
    selectedIdea: IdeaCandidate | null;
}

export default function RightPanel({
    ideas,
    featuredIdea,
    selectedIdea,
}: RightPanelProps): JSX.Element {
    const tagData = buildTagData(ideas);
    const detailIdea = selectedIdea ?? ideas[0];
    const latestIdea = ideas[0];
    const highlightIdea = featuredIdea ?? latestIdea;

    return (
        <aside className="right-panel">
            <div className="right-panel__card right-panel__card--highlight">
                <div className="right-panel__card-badge">🔥 注目のアイデア</div>
                <h3 className="right-panel__card-title">{highlightIdea?.title ?? '-'}</h3>
                <p className="right-panel__card-desc">
                    {highlightIdea?.tagline ?? ''}
                </p>
                {highlightIdea?.tags[0] && (
                    <span className="right-panel__card-tag">{highlightIdea.tags[0]}</span>
                )}
            </div>

            <div className="right-panel__card right-panel__card--trend">
                <div className="right-panel__card-badge">🚀 最新バッチ</div>
                <h3 className="right-panel__card-title">{latestIdea?.title ?? '-'}</h3>
                <p className="right-panel__card-desc">
                    {latestIdea?.tagline ?? ''}
                </p>
                {latestIdea?.tags[0] && (
                    <span className="right-panel__card-tag">{latestIdea.tags[0]}</span>
                )}
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
                </dl>
            </div>

            <div className="right-panel__card">
                <h4 className="right-panel__chart-title">よく出るタグ</h4>
                <div className="right-panel__chart">
                    {tagData.map((tag) => (
                        <div key={tag.name} className="right-panel__chart-row">
                            <div className="right-panel__chart-label">
                                <span className="right-panel__chart-name">{tag.name}</span>
                            </div>
                            <div className="right-panel__chart-bar-bg">
                                <div
                                    className="right-panel__chart-bar"
                                    style={{ width: `${tag.pct}%`, backgroundColor: tag.color }}
                                />
                            </div>
                            <span className="right-panel__chart-pct">{tag.pct}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
