import type { AppView } from './app-view';

type Props = {
  view: AppView;
  onChange: (view: AppView) => void;
  compact?: boolean;
};

export function ViewSwitcher({ view, onChange, compact = false }: Props) {
  return (
    <div className={`view-switcher${compact ? ' view-switcher--compact' : ''}`} role="tablist" aria-label="Application view">
      <button
        type="button"
        role="tab"
        className={`view-switcher-btn${view === 'flight-deck' ? ' active' : ''}`}
        aria-selected={view === 'flight-deck'}
        title="Flight Deck"
        onClick={() => onChange('flight-deck')}
      >
        <FlightDeckIcon />
        {!compact && 'Flight Deck'}
      </button>
      <button
        type="button"
        role="tab"
        className={`view-switcher-btn${view === 'workspace' ? ' active' : ''}`}
        aria-selected={view === 'workspace'}
        title="Workspace"
        onClick={() => onChange('workspace')}
      >
        <WorkspaceIcon />
        {!compact && 'Workspace'}
      </button>
    </div>
  );
}

function FlightDeckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function WorkspaceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
