import type { SessionLabel } from '@shared/types';

type Props = {
  labels: SessionLabel[];
  compact?: boolean;
};

export function SessionLabelChips({ labels, compact }: Props) {
  if (labels.length === 0) return null;
  return (
    <div className={`session-label-chips${compact ? ' session-label-chips--compact' : ''}`}>
      {labels.map((label) => (
        <span
          key={label.id}
          className="session-label-chip"
          style={{ ['--label-color' as string]: label.color }}
          title={label.name}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
}
