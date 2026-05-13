import './RightPanel.css';

const TECH_STACK_DATA = [
    { name: 'Next.js', icon: '🌐', pct: 32, color: '#1a1f36' },
    { name: 'Python', icon: '🐍', pct: 24, color: '#3b82f6' },
    { name: 'TypeScript', icon: '📘', pct: 18, color: '#3178c6' },
    { name: 'AWS', icon: '☁️', pct: 14, color: '#ff9900' },
    { name: 'React', icon: '⚛️', pct: 12, color: '#61dafb' },
];

export default function RightPanel(): JSX.Element {
    return (
        <aside className="right-panel">
            {/* High Revenue Potential Card */}
            <div className="right-panel__card right-panel__card--highlight">
                <div className="right-panel__card-badge">🔥 高収益ポテンシャル</div>
                <h3 className="right-panel__card-title">サブスク管理SaaS</h3>
                <p className="right-panel__card-desc">
                    サブスクの一元管理と料金の最適化を支援
                </p>
                <span className="right-panel__card-tag">SaaS</span>
            </div>

            {/* Trending Card */}
            <div className="right-panel__card right-panel__card--trend">
                <div className="right-panel__card-badge">🚀 急上昇トレンド</div>
                <h3 className="right-panel__card-title">AI画像生成APIサービス</h3>
                <p className="right-panel__card-desc">
                    画像生成機能をAPIで提供する開発者向けプラットフォーム
                </p>
                <span className="right-panel__card-tag">AI・API</span>
            </div>

            {/* Tech Stack Chart */}
            <div className="right-panel__card">
                <h4 className="right-panel__chart-title">人気の技術スタック</h4>
                <div className="right-panel__chart">
                    {TECH_STACK_DATA.map((tech) => (
                        <div key={tech.name} className="right-panel__chart-row">
                            <div className="right-panel__chart-label">
                                <span className="right-panel__chart-icon">{tech.icon}</span>
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
