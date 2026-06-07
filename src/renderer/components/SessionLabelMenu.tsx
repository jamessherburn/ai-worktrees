import type { SessionLabel, SessionWithStatus } from '@shared/types';
import { toggleSessionLabel } from '@shared/session-labels';

type Props = {
  session: SessionWithStatus;
  labels: SessionLabel[];
  x: number;
  y: number;
  onToggleLabel: (session: SessionWithStatus, labelIds: string[]) => void;
  onToggleMuted?: (session: SessionWithStatus, muted: boolean) => void;
  onRevealInFinder?: (session: SessionWithStatus) => void;
  onOpenInVSCode?: (session: SessionWithStatus) => void;
  onManageLabels?: () => void;
};

export function SessionLabelMenu({
  session,
  labels,
  x,
  y,
  onToggleLabel,
  onToggleMuted,
  onRevealInFinder,
  onOpenInVSCode,
  onManageLabels,
}: Props) {
  const applied = new Set(session.labelIds ?? []);
  const isMuted = session.muted === true;
  const showWorktreeActions =
    !session.global && Boolean(session.worktreePath) && (onRevealInFinder || onOpenInVSCode);

  return (
    <div
      className="context-menu session-label-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showWorktreeActions && (
        <>
          {onRevealInFinder && (
            <button className="context-menu-item" onClick={() => onRevealInFinder(session)}>
              Open in Finder
            </button>
          )}
          {onOpenInVSCode && (
            <button className="context-menu-item" onClick={() => onOpenInVSCode(session)}>
              Open in VS Code
            </button>
          )}
          <div className="context-menu-divider" />
        </>
      )}
      {onToggleMuted && (
        <>
          <button
            className="context-menu-item"
            onClick={() => onToggleMuted(session, !isMuted)}
          >
            {isMuted ? 'Unmute Session' : 'Mute Session'}
          </button>
          <div className="context-menu-divider" />
        </>
      )}
      <div className="context-menu-heading">Labels</div>
      {labels.map((label) => {
        const checked = applied.has(label.id);
        return (
          <button
            key={label.id}
            className="context-menu-item context-menu-item--check"
            onClick={() => onToggleLabel(session, toggleSessionLabel(session, label.id))}
          >
            <span
              className="context-menu-check"
              style={{ ['--label-color' as string]: label.color }}
              aria-hidden
            >
              {checked ? '✓' : ''}
            </span>
            <span className="session-label-menu-name">{label.name}</span>
          </button>
        );
      })}
      {onManageLabels && (
        <>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={onManageLabels}>
            Manage Labels…
          </button>
        </>
      )}
    </div>
  );
}
