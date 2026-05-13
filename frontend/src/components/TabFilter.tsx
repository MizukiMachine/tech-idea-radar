import './TabFilter.css';

const TABS = ['すべて', 'SaaS', 'AI', '個人開発', '業務効率化', 'データ', '学習', 'API・ツール'];

interface TabFilterProps {
    activeTab?: string;
    viewMode?: 'grid' | 'list';
    onTabChange?: (tab: string) => void;
    onViewChange?: (view: 'grid' | 'list') => void;
    sortLabel?: string;
    resultCount?: number;
}

export default function TabFilter({
    activeTab = 'すべて',
    viewMode = 'grid',
    onTabChange,
    onViewChange,
    sortLabel = 'おすすめ順',
    resultCount = 0,
}: TabFilterProps): JSX.Element {
    const handleTabClick = (tab: string) => {
        onTabChange?.(tab);
    };

    const handleViewToggle = (mode: 'grid' | 'list') => {
        onViewChange?.(mode);
    };

    return (
        <div className="tab-filter">
            <div className="tab-filter__left">
                <h3 className="tab-filter__heading">あなたにおすすめのアイデア</h3>
                <div className="tab-filter__tabs">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            className={`tab-filter__tab ${activeTab === tab ? 'tab-filter__tab--active' : ''}`}
                            onClick={() => handleTabClick(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>
            <div className="tab-filter__right">
                <span className="tab-filter__sort-label">{sortLabel}・{resultCount}件</span>
                <div className="tab-filter__view-toggle">
                    <button
                        type="button"
                        className={`tab-filter__view-btn ${viewMode === 'grid' ? 'tab-filter__view-btn--active' : ''}`}
                        onClick={() => handleViewToggle('grid')}
                        aria-label="Grid view"
                    >
                        ▦
                    </button>
                    <button
                        type="button"
                        className={`tab-filter__view-btn ${viewMode === 'list' ? 'tab-filter__view-btn--active' : ''}`}
                        onClick={() => handleViewToggle('list')}
                        aria-label="List view"
                    >
                        ☰
                    </button>
                </div>
            </div>
        </div>
    );
}
