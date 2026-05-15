import { useState } from 'react';
import type { IdeaCandidate } from '../types/idea-candidate';
import './Sidebar.css';

const CATEGORY_FILTERS = [
    { id: 'SaaS', label: 'SaaS' },
    { id: 'B2B', label: 'B2B' },
    { id: 'B2Cアプリ', label: 'B2Cアプリ' },
    { id: '開発ツール', label: '開発ツール' },
    { id: 'ブラウザ拡張機能', label: 'ブラウザ拡張' },
    { id: 'モバイル', label: 'モバイル' },
    { id: 'AI・データ', label: 'AI・データ' },
    { id: '業務効率化', label: '業務効率化' },
];

const INTEREST_FIELDS = [
    { id: 'business', label: '業務効率化' },
    { id: 'ai', label: 'AI・自動化' },
    { id: 'finance', label: '金融・お金' },
    { id: 'education', label: '学習・教育' },
    { id: 'health', label: 'ヘルスケア' },
    { id: 'entertainment', label: 'エンタメ' },
];

const SCALE_FILTERS = [
    { value: null, label: 'すべて' },
    { value: 1, label: '★まで' },
    { value: 2, label: '★★まで' },
    { value: 3, label: '★★★まで' },
    { value: 4, label: '★★★★まで' },
];

const REVENUE_FILTERS = [
    { value: null, label: 'すべて' },
    { value: 55, label: '中以上' },
    { value: 78, label: '高以上' },
    { value: 95, label: '最高のみ' },
];

interface SidebarProps {
    onCategoryFilter?: (category: string) => void;
    onInterestChange?: (interests: string[]) => void;
    onRevenueChange?: (value: number | null) => void;
    onScaleChange?: (value: number | null) => void;
    onSortChange?: (sort: string) => void;
    highlightedIdea?: IdeaCandidate;
}

export default function Sidebar({
    onCategoryFilter,
    onInterestChange,
    onRevenueChange,
    onScaleChange,
    onSortChange,
    highlightedIdea,
}: SidebarProps): JSX.Element {
    const [activeCategory, setActiveCategory] = useState('すべて');
    const [interests, setInterests] = useState<Record<string, boolean>>(
        Object.fromEntries(INTEREST_FIELDS.map((field) => [field.id, false]))
    );
    const [revenueMin, setRevenueMin] = useState<number | null>(null);
    const [scaleMax, setScaleMax] = useState<number | null>(null);
    const [sort, setSort] = useState('おすすめ順');

    const handleCategoryClick = (category: string) => {
        setActiveCategory(category);
        onCategoryFilter?.(category);
    };

    const handleInterestToggle = (id: string) => {
        const updated = { ...interests, [id]: !interests[id] };
        setInterests(updated);
        onInterestChange?.(Object.entries(updated).filter(([, v]) => v).map(([k]) => k));
    };

    const handleRevenueChange = (val: number | null) => {
        setRevenueMin(val);
        onRevenueChange?.(val);
    };

    const handleScaleChange = (val: number | null) => {
        setScaleMax(val);
        onScaleChange?.(val);
    };

    const handleSortChange = (val: string) => {
        setSort(val);
        onSortChange?.(val);
    };

    const resetAll = () => {
        const clearedInterests = Object.fromEntries(INTEREST_FIELDS.map((f) => [f.id, false]));
        setActiveCategory('すべて');
        setInterests(clearedInterests);
        setRevenueMin(null);
        setScaleMax(null);
        setSort('おすすめ順');
        onCategoryFilter?.('すべて');
        onInterestChange?.([]);
        onRevenueChange?.(null);
        onScaleChange?.(null);
        onSortChange?.('おすすめ順');
    };

    return (
        <aside className="sidebar">
            {/* Filter Header */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">
                        <span className="sidebar__section-title-icon">☰</span> フィルター
                    </span>
                </div>
            </div>

            {/* ジャンル・テーマ */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">ジャンル・テーマ</span>
                    <button type="button" className="sidebar__reset-btn" onClick={() => handleCategoryClick('すべて')}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__tags">
                    <button
                        type="button"
                        className={`sidebar__tag ${activeCategory === 'すべて' ? 'sidebar__tag--active' : ''}`}
                        onClick={() => handleCategoryClick('すべて')}
                    >
                        すべて
                    </button>
                    {CATEGORY_FILTERS.map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            className={`sidebar__tag ${activeCategory === category.id ? 'sidebar__tag--active' : ''}`}
                            onClick={() => handleCategoryClick(category.id)}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 興味分野 */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">興味分野</span>
                    <button type="button" className="sidebar__reset-btn" onClick={resetAll}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__checkbox-group">
                    {INTEREST_FIELDS.map((field) => (
                        <label key={field.id} className="sidebar__checkbox-label">
                            <input
                                type="checkbox"
                                checked={interests[field.id]}
                                onChange={() => handleInterestToggle(field.id)}
                            />
                            {field.label}
                        </label>
                    ))}
                </div>
            </div>

            {/* 収益化しやすさ */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">収益化しやすさ</span>
                    <button type="button" className="sidebar__reset-btn" onClick={() => handleRevenueChange(null)}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__tags">
                    {REVENUE_FILTERS.map((filter) => (
                        <button
                            key={filter.label}
                            type="button"
                            className={`sidebar__tag ${revenueMin === filter.value ? 'sidebar__tag--active' : ''}`}
                            onClick={() => handleRevenueChange(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 開発規模 */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">開発規模</span>
                    <button type="button" className="sidebar__reset-btn" onClick={() => handleScaleChange(null)}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__tags">
                    {SCALE_FILTERS.map((filter) => (
                        <button
                            key={filter.label}
                            type="button"
                            className={`sidebar__tag ${scaleMax === filter.value ? 'sidebar__tag--active' : ''}`}
                            onClick={() => handleScaleChange(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 並び替え */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">並び替え</span>
                </div>
                <select className="sidebar__select" value={sort} onChange={(e) => handleSortChange(e.target.value)}>
                    <option>おすすめ順</option>
                    <option>トレンドスコア順</option>
                    <option>収益性順</option>
                    <option>開発規模 小さい順</option>
                </select>
            </div>

            {highlightedIdea && (
                <div className="sidebar__section" style={{ marginTop: 16 }}>
                    <div className="sidebar__highlight-card">
                        <div className="sidebar__highlight-badge">トレンド上位</div>
                        <div className="sidebar__highlight-title">{highlightedIdea.title}</div>
                        <div className="sidebar__highlight-desc">
                            {highlightedIdea.tagline || highlightedIdea.coreProblem}
                        </div>
                        <span className="sidebar__highlight-tag">
                            {highlightedIdea.tags.slice(0, 2).join('・') || highlightedIdea.productType}
                        </span>
                    </div>
                </div>
            )}
        </aside>
    );
}
