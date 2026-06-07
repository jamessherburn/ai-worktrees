import type { Session, SessionQuickNote } from './types';

export function quickNotesForSession(session: Pick<Session, 'quickNotes' | 'notes' | 'createdAt'>): SessionQuickNote[] {
  if (session.quickNotes?.length) return session.quickNotes;
  const legacy = session.notes?.trim();
  if (legacy) {
    return [{ id: 'legacy', text: legacy, createdAt: session.createdAt }];
  }
  return [];
}

export function formatQuickNoteTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
