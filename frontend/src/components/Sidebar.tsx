import { useState } from 'react';
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

interface SidebarProps {
    onCategoryFilter?: (category: string) => void;
    onInterestChange?: (interests: string[]) => void;
    variant?: 'standalone' | 'panel';
}

export default function Sidebar({
    onCategoryFilter,
    onInterestChange,
    variant = 'standalone',
}: SidebarProps): JSX.Element {
    const [activeCategory, setActiveCategory] = useState('すべて');
    const [interests, setInterests] = useState<Record<string, boolean>>(
        Object.fromEntries(INTEREST_FIELDS.map((field) => [field.id, false]))
    );

    const handleCategoryClick = (category: string) => {
        setActiveCategory(category);
        onCategoryFilter?.(category);
    };

    const handleInterestToggle = (id: string) => {
        const updated = { ...interests, [id]: !interests[id] };
        setInterests(updated);
        onInterestChange?.(Object.entries(updated).filter(([, v]) => v).map(([k]) => k));
    };

    const resetAll = () => {
        const clearedInterests = Object.fromEntries(INTEREST_FIELDS.map((f) => [f.id, false]));
        setActiveCategory('すべて');
        setInterests(clearedInterests);
        onCategoryFilter?.('すべて');
        onInterestChange?.([]);
    };

    const Container = variant === 'panel' ? 'section' : 'aside';

    return (
        <Container className={`sidebar ${variant === 'panel' ? 'sidebar--panel' : ''}`} aria-label="アイデアフィルター">
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
        </Container>
    );
}
