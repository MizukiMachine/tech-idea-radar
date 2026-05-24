import type { KeyboardEvent, MouseEvent } from 'react';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { IdeaTrendSignal } from '../types/idea-trend-signal';
import { formatBatchTimestamp, normalizeBatchTimeJST } from '../utils/batch-time';
import { compactTargetUsers, normalizeTargetUsers } from '../utils/target-users';
import './IdeaCard.css';

const CARD_ICONS = ['AI', 'PR', 'DB', 'UX', 'API', 'SaaS', 'Ops', 'Sc', 'Dev', 'Web', 'Doc', 'Rev', 'Fit', 'CMS', 'BI'];
const ICON_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#0f766e',
    '#6fae2e', '#8b5cf6', '#ec4899', '#14b8a6', '#7c3aed',
    '#d946ef', '#f43f5e', '#65a30d', '#84cc16', '#a855f7',
];
function getIconForIdea(id: string, index: number) {
    const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
        icon: CARD_ICONS[(hash + index) % CARD_ICONS.length],
        color: ICON_COLORS[(hash + index) % ICON_COLORS.length],
    };
}

interface IdeaCardProps {
    idea: IdeaCandidate;
    index: number;
    viewMode?: 'grid' | 'list';
    selected?: boolean;
    trendSignal?: IdeaTrendSignal | null;
    onSelect?: (idea: IdeaCandidate) => void;
}

export default function IdeaCard({
    idea,
    index,
    viewMode = 'grid',
    selected = false,
    onSelect,
}: IdeaCardProps): JSX.Element {
    const { icon, color } = getIconForIdea(idea.id, index);
    const batchTime = normalizeBatchTimeJST(idea.batchTime, idea.generatedAt);
    const targetUsers = normalizeTargetUsers(idea.targetUsers);
    const compactTarget = compactTargetUsers(idea.targetUsers);
    const targetTitle = compactTarget !== targetUsers ? targetUsers : undefined;
    const openIdea = () => onSelect?.(idea);
    const handleClick = (_event: MouseEvent<HTMLElement>) => {
        const selection = window.getSelection()?.toString().trim();
        if (selection) return;
        openIdea();
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openIdea();
    };

    return (
        <article
            role="button"
            tabIndex={0}
            className={`idea-card idea-card--${viewMode} ${selected ? 'idea-card--selected' : ''}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-label={`${idea.title} の詳細を開く`}
        >
            <div className="idea-card__header">
                <div className="idea-card__icon" style={{ backgroundColor: `${color}15`, color }}>
                    {icon}
                </div>
                <h3 className="idea-card__title">{idea.title}</h3>
            </div>
            <p className="idea-card__target">
                <span className="idea-card__target-label">対象ユーザー</span>
                <span className="idea-card__target-text" title={targetTitle}>{compactTarget}</span>
            </p>
            <p className="idea-card__summary">
                <span className="idea-card__summary-label">概要</span>
                <span className="idea-card__tagline" title={idea.tagline}>{idea.tagline}</span>
            </p>
            {batchTime && (
                <time className="idea-card__batch-time" dateTime={batchTime}>
                    {formatBatchTimestamp(batchTime)}
                </time>
            )}
        </article>
    );
}
