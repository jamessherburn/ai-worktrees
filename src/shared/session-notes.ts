import type { Session } from './types';

/** Single session notes text, migrating legacy quickNotes on read. */
export function sessionNotesText(session: Pick<Session, 'notes' | 'quickNotes'>): string {
  const direct = session.notes?.trim();
  if (direct) return direct;
  if (session.quickNotes?.length) {
    return session.quickNotes
      .map((note) => note.text.trim())
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

export function sessionNotesPreview(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
