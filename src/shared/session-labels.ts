import type { Session, SessionLabel, SessionWithStatus } from './types';

export const WAITING_ON_REVIEW_LABEL_ID = 'waiting-on-review';

export const DEFAULT_SESSION_LABELS: SessionLabel[] = [
  { id: WAITING_ON_REVIEW_LABEL_ID, name: 'Waiting On Review', color: '#007acc' },
];

const LABEL_COLORS = [
  '#007acc',
  '#3fb950',
  '#cca700',
  '#f14c4c',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ec4899',
];

export function normalizeSessionLabels(labels: SessionLabel[] | undefined): SessionLabel[] {
  const map = new Map<string, SessionLabel>();
  for (const label of DEFAULT_SESSION_LABELS) {
    map.set(label.id, { ...label });
  }
  if (labels) {
    for (const label of labels) {
      if (!label.id || !label.name?.trim() || !label.color) continue;
      map.set(label.id, {
        id: label.id,
        name: label.name.trim(),
        color: label.color,
      });
    }
  }
  return Array.from(map.values());
}

export function normalizeSessionLabelIds(labelIds: string[] | undefined): string[] {
  if (!labelIds?.length) return [];
  return [...new Set(labelIds.filter((id) => typeof id === 'string' && id.length > 0))];
}

/** Migrate legacy `waitingOnReview` flag into `labelIds`. */
export function normalizeSession(session: Session): Session {
  const agentId = session.agentId;
  let labelIds = normalizeSessionLabelIds(session.labelIds);
  if (session.waitingOnReview && !labelIds.includes(WAITING_ON_REVIEW_LABEL_ID)) {
    labelIds = [...labelIds, WAITING_ON_REVIEW_LABEL_ID];
  }
  const { waitingOnReview: _legacy, ...rest } = session;
  return {
    ...rest,
    agentId,
    labelIds: labelIds.length ? labelIds : undefined,
  };
}

export function sessionLabelMap(labels: SessionLabel[]): Map<string, SessionLabel> {
  return new Map(labels.map((l) => [l.id, l]));
}

export function labelsForSession(
  session: Session,
  labelMap: Map<string, SessionLabel>,
): SessionLabel[] {
  const ids = normalizeSessionLabelIds(session.labelIds);
  return ids.map((id) => labelMap.get(id)).filter((l): l is SessionLabel => l !== undefined);
}

export function toggleSessionLabel(session: Session, labelId: string): string[] {
  const current = normalizeSessionLabelIds(session.labelIds);
  if (current.includes(labelId)) {
    return current.filter((id) => id !== labelId);
  }
  return [...current, labelId];
}

export function nextLabelColor(existing: SessionLabel[]): string {
  const used = new Set(existing.map((l) => l.color.toLowerCase()));
  const available = LABEL_COLORS.find((c) => !used.has(c.toLowerCase()));
  return available ?? LABEL_COLORS[existing.length % LABEL_COLORS.length];
}

export type ActivityKind = 'working' | 'idle' | 'stopped' | 'orphaned';

export function activityKindFor(session: SessionWithStatus): ActivityKind {
  if (session.status === 'orphaned') return 'orphaned';
  if (session.status !== 'running') return 'stopped';
  if (session.muted && session.activity !== 'working') return 'stopped';
  return session.activity === 'working' ? 'working' : 'idle';
}

export function activityLabel(kind: ActivityKind): string {
  switch (kind) {
    case 'working':
      return 'Working';
    case 'idle':
      return 'Idle';
    case 'orphaned':
      return 'Orphaned';
    case 'stopped':
      return 'Stopped';
  }
}

export function activityLabelFor(session: SessionWithStatus): string {
  const kind = activityKindFor(session);
  if (session.muted && session.status === 'running' && kind === 'stopped') return 'Muted';
  return activityLabel(kind);
}

export function statusDotClass(session: SessionWithStatus): string {
  const kind = activityKindFor(session);
  if (kind === 'orphaned') return 'orphaned';
  if (kind === 'stopped') return 'stopped';
  return kind;
}
