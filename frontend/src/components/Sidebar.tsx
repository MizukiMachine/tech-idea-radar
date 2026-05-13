import { useState } from 'react';
import './Sidebar.css';

const TECH_GROUPS = [
    {
        id: 'languages',
        label: '言語',
        tags: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin', 'Swift', 'PHP', 'Ruby'],
    },
    {
        id: 'frontend',
        label: 'フロントエンド',
        tags: ['React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'Astro', 'Tailwind', 'UI・UX'],
    },
    {
        id: 'backend',
        label: 'バックエンド/API',
        tags: ['Node.js', 'FastAPI', 'Django', 'Rails', 'GraphQL', 'REST API', 'OpenAPI', '認証'],
    },
    {
        id: 'ai-data',
        label: 'AI・データ',
        tags: ['AI', 'LLM', '機械学習', 'RAG', 'データ分析', 'BI', 'ETL', 'ベクトルDB'],
    },
    {
        id: 'cloud',
        label: 'クラウド/インフラ',
        tags: ['AWS', 'GCP', 'Azure', 'Vercel', 'Docker', 'Kubernetes', 'Supabase', 'Firebase'],
    },
    {
        id: 'product',
        label: 'ジャンル',
        tags: ['SaaS', 'dev-tools', 'B2B', 'B2Cアプリ', 'productivity', 'ブラウザ拡張機能', 'モバイル', 'マーケットプレイス'],
    },
];

const INTEREST_FIELDS = [
    { id: 'business', label: '業務効率化', defaultChecked: true },
    { id: 'ai', label: 'AI・自動化', defaultChecked: true },
    { id: 'finance', label: '金融・お金', defaultChecked: false },
    { id: 'education', label: '学習・教育', defaultChecked: true },
    { id: 'health', label: 'ヘルスケア', defaultChecked: false },
    { id: 'entertainment', label: 'エンタメ', defaultChecked: false },
    { id: 'other', label: 'その他', defaultChecked: false },
];

interface SidebarProps {
    onTechFilter?: (tech: string) => void;
    onInterestChange?: (interests: string[]) => void;
    onRevenueChange?: (value: number | null) => void;
    onTimeframeChange?: (value: number | null) => void;
    onSortChange?: (sort: string) => void;
}

export default function Sidebar({
    onTechFilter,
    onInterestChange,
    onRevenueChange,
    onTimeframeChange,
    onSortChange,
}: SidebarProps): JSX.Element {
    const [activeTech, setActiveTech] = useState('すべて');
    const [interests, setInterests] = useState<Record<string, boolean>>(
        Object.fromEntries(INTEREST_FIELDS.map((f) => [f.id, f.defaultChecked]))
    );
    const [revenue, setRevenue] = useState(70);
    const [timeframe, setTimeframe] = useState(60);
    const [sort, setSort] = useState('おすすめ順');
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        languages: true,
        frontend: true,
        backend: false,
        'ai-data': true,
        cloud: false,
        product: false,
    });

    const handleTechClick = (tag: string) => {
        setActiveTech(tag);
        onTechFilter?.(tag);
    };

    const handleInterestToggle = (id: string) => {
        const updated = { ...interests, [id]: !interests[id] };
        setInterests(updated);
        onInterestChange?.(Object.entries(updated).filter(([, v]) => v).map(([k]) => k));
    };

    const handleRevenueChange = (val: number) => {
        setRevenue(val);
        onRevenueChange?.(val);
    };

    const handleTimeframeChange = (val: number) => {
        setTimeframe(val);
        onTimeframeChange?.(val);
    };

    const handleSortChange = (val: string) => {
        setSort(val);
        onSortChange?.(val);
    };

    const resetAll = () => {
        const clearedInterests = Object.fromEntries(INTEREST_FIELDS.map((f) => [f.id, false]));
        setActiveTech('すべて');
        setInterests(clearedInterests);
        setRevenue(70);
        setTimeframe(60);
        setSort('おすすめ順');
        onTechFilter?.('すべて');
        onInterestChange?.([]);
        onRevenueChange?.(null);
        onTimeframeChange?.(null);
        onSortChange?.('おすすめ順');
    };

    const toggleGroup = (id: string) => {
        setOpenGroups((current) => ({ ...current, [id]: !current[id] }));
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

            {/* 得意技術 */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">得意技術</span>
                    <button type="button" className="sidebar__reset-btn" onClick={() => handleTechClick('すべて')}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__tags">
                    <button
                        type="button"
                        className={`sidebar__tag ${activeTech === 'すべて' ? 'sidebar__tag--active' : ''}`}
                        onClick={() => handleTechClick('すべて')}
                    >
                        すべて
                    </button>
                </div>
                <div className="sidebar__tech-groups">
                    {TECH_GROUPS.map((group) => (
                        <div key={group.id} className="sidebar__tech-group">
                            <button
                                type="button"
                                className="sidebar__tech-group-toggle"
                                onClick={() => toggleGroup(group.id)}
                                aria-expanded={openGroups[group.id]}
                            >
                                <span>{group.label}</span>
                                <span>{openGroups[group.id] ? '−' : '+'}</span>
                            </button>
                            {openGroups[group.id] && (
                                <div className="sidebar__tags sidebar__tags--nested">
                                    {group.tags.map((tag) => (
                                        <button
                                            key={tag}
                                            type="button"
                                            className={`sidebar__tag ${activeTech === tag ? 'sidebar__tag--active' : ''}`}
                                            onClick={() => handleTechClick(tag)}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
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
                    <button type="button" className="sidebar__reset-btn" onClick={() => { setRevenue(70); onRevenueChange?.(null); }}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__slider-group">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={revenue}
                        onChange={(e) => handleRevenueChange(Number(e.target.value))}
                        className="sidebar__slider"
                    />
                    <div className="sidebar__slider-labels">
                        <span>低</span>
                        <span>高</span>
                    </div>
                </div>
            </div>

            {/* 短期開発向け */}
            <div className="sidebar__section">
                <div className="sidebar__section-header">
                    <span className="sidebar__section-title">短期開発向け</span>
                    <button type="button" className="sidebar__reset-btn" onClick={() => { setTimeframe(60); onTimeframeChange?.(null); }}>
                        リセット
                    </button>
                </div>
                <div className="sidebar__slider-group">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={timeframe}
                        onChange={(e) => handleTimeframeChange(Number(e.target.value))}
                        className="sidebar__slider"
                    />
                    <div className="sidebar__slider-labels">
                        <span>じっくり</span>
                        <span>短期間</span>
                    </div>
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
                    <option>開発期間順</option>
                </select>
            </div>

            {/* Profile */}
            <div className="sidebar__profile">
                <div className="sidebar__profile-header">
                    <div className="sidebar__profile-avatar">&lt;/&gt;</div>
                    <div className="sidebar__profile-info">
                        <div className="sidebar__profile-name">あなたのプロフィール</div>
                        <div className="sidebar__profile-role">フルスタックエンジニア</div>
                    </div>
                </div>
                <div className="sidebar__profile-details">
                    データ分析に興味あり<br />
                    SaaS開発の経験あり
                </div>
                <button type="button" className="sidebar__profile-edit-btn">プロフィールを編集</button>
            </div>

            {/* Highlight Card */}
            <div className="sidebar__section" style={{ marginTop: 16 }}>
                <div className="sidebar__highlight-card">
                    <div className="sidebar__highlight-badge">短期開発におすすめ</div>
                    <div className="sidebar__highlight-title">Markdownメモ共有サービス</div>
                    <div className="sidebar__highlight-desc">
                        シンプルにメモを共有できるチーム向けサービス
                    </div>
                    <span className="sidebar__highlight-tag">SaaS・個人開発</span>
                </div>
            </div>
        </aside>
    );
}
