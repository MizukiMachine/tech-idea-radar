import type { IdeaCandidate } from '../types/idea-candidate';
import type { FeaturedTrend } from '../api/ai';
import './RightPanel.css';

const TAG_COLORS = ['#1a1f36', '#6B8F2A', '#00B67A', '#FF9900', '#8B4DFF'];

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
    featuredTrend: FeaturedTrend | null;
    selectedIdea: IdeaCandidate | null;
    onOpenTrends: () => void;
}

export default function RightPanel({
    ideas,
    featuredIdea,
    featuredTrend,
    selectedIdea,
    onOpenTrends,
}: RightPanelProps): JSX.Element {
    const tagData = buildTagData(ideas);
    const latestIdea = ideas[0];
    const highlightIdea = featuredIdea ?? latestIdea;
    const focusIdea = selectedIdea ?? highlightIdea;

    return (
        <aside className="right-panel">
            <div className="right-panel__card right-panel__card--highlight">
                <div className="right-panel__card-badge">{selectedIdea ? '選択中のアイデア' : '注目のアイデア'}</div>
                <h3 className="right-panel__card-title">{focusIdea?.title ?? '-'}</h3>
                <p className="right-panel__card-desc">
                    {focusIdea?.tagline ?? ''}
                </p>
                {focusIdea?.tags[0] && (
                    <span className="right-panel__card-tag">{focusIdea.tags[0]}</span>
                )}
            </div>

            {highlightIdea && focusIdea?.id !== highlightIdea.id && (
                <div className="right-panel__card right-panel__card--compact">
                    <div className="right-panel__card-badge">レコメンド</div>
                    <h3 className="right-panel__card-title">{highlightIdea.title}</h3>
                    <p className="right-panel__card-desc">{highlightIdea.tagline}</p>
                </div>
            )}

            <div className="right-panel__card right-panel__card--trend">
                <div className="right-panel__card-badge">注目のトレンド</div>
                <h3 className="right-panel__card-title">
                    {featuredTrend?.titleJa ?? featuredTrend?.title ?? 'トレンドを確認'}
                </h3>
                <p className="right-panel__card-desc">
                    {featuredTrend?.summary ?? '最新のRSSフィードから、次のアイデアにつながる動きを確認できます。'}
                </p>
                {featuredTrend?.source && (
                    <span className="right-panel__card-tag">{featuredTrend.source}</span>
                )}
                <button type="button" className="right-panel__card-action" onClick={onOpenTrends}>
                    トレンドを見る
                </button>
            </div>

            <div className="right-panel__card">
                <h4 className="right-panel__chart-title">よく出るタグ</h4>
                {tagData.length > 0 ? (
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
                ) : (
                    <p className="right-panel__empty">表示中のアイデアにタグがありません。</p>
                )}
            </div>
        </aside>
    );
}
