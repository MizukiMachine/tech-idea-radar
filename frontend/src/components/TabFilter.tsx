import { useState } from 'react';
import './TabFilter.css';

const TABS = ['すべて', 'SaaS', 'AI', '個人開発', '業務効率化', 'データ', '学習', 'API・ツール'];

interface TabFilterProps {
    onTabChange?: (tab: string) => void;
    onViewChange?: (view: 'grid' | 'list') => void;
    sortLabel?: string;
}

export default function TabFilter({ onTabChange, onViewChange, sortLabel = 'おすすめ順' }: TabFilterProps): JSX.Element {
    const [activeTab, setActiveTab] = useState('すべて');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const handleTabClick = (tab: string) => {
        setActiveTab(tab);
        onTabChange?.(tab);
    };

    const handleViewToggle = (mode: 'grid' | 'list') => {
        setViewMode(mode);
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
                <span className="tab-filter__sort-label">{sortLabel}</span>
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
