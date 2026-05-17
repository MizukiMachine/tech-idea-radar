import type { IdeaCandidate } from '../types/idea-candidate';
import './IdeaCard.css';

const CARD_ICONS = ['AI', 'PR', 'DB', 'UX', 'API', 'SaaS', 'Ops', 'Sc', 'Dev', 'Web', 'Doc', 'Rev', 'Fit', 'CMS', 'BI'];
const ICON_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1',
    '#d946ef', '#f43f5e', '#0ea5e9', '#84cc16', '#a855f7',
];

function getIconForIdea(id: string, index: number) {
    const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
        icon: CARD_ICONS[(hash + index) % CARD_ICONS.length],
        color: ICON_COLORS[(hash + index) % ICON_COLORS.length],
    };
}

function formatGeneratedAtLabel(generatedAt: string) {
    try {
        const date = new Date(generatedAt);
        if (Number.isNaN(date.getTime())) return generatedAt;
        return date.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    } catch {
        return generatedAt;
    }
}

interface IdeaCardProps {
    idea: IdeaCandidate;
    index: number;
    viewMode?: 'grid' | 'list';
    selected?: boolean;
    onSelect?: (idea: IdeaCandidate) => void;
}

export default function IdeaCard({ idea, index, viewMode = 'grid', selected = false, onSelect }: IdeaCardProps): JSX.Element {
    const { icon, color } = getIconForIdea(idea.id, index);

    return (
        <button
            type="button"
            className={`idea-card idea-card--${viewMode} ${selected ? 'idea-card--selected' : ''}`}
            onClick={() => onSelect?.(idea)}
            aria-label={`${idea.title} の詳細を開く`}
        >
            <div className="idea-card__header">
                <div className="idea-card__icon" style={{ backgroundColor: `${color}15`, color }}>
                    {icon}
                </div>
                <h3 className="idea-card__title">{idea.title}</h3>
            </div>
            <p className="idea-card__tagline">{idea.tagline}</p>
            {idea.batchTime && (
                <span className="idea-card__batch">生成 {formatGeneratedAtLabel(idea.batchTime)}</span>
            )}
        </button>
    );
}
