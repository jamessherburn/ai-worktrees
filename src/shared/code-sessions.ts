import type { Session, SessionKind } from './types';

/** Directory prefix under the configured code directory for code sessions. */
export const CODE_SESSION_DIR_PREFIX = 'ai-worktrees-session-';

export const CODE_SESSION_REPO_NAME = 'Code';

export function codeSessionSlug(name: string): string {
  return name.replace(/\//g, '-');
}

export function codeSessionDirName(name: string): string {
  return `${CODE_SESSION_DIR_PREFIX}${codeSessionSlug(name)}`;
}

function joinPath(parent: string, child: string): string {
  const base = parent.replace(/\/+$/, '');
  const segment = child.replace(/^\/+/, '');
  return segment ? `${base}/${segment}` : base;
}

function pathBasename(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function deriveCodeSessionPath(codeDir: string, name: string): string {
  return joinPath(codeDir, codeSessionDirName(name));
}

export function sessionKindFor(session: Pick<Session, 'kind' | 'worktreePath'>): SessionKind {
  if (session.kind === 'code' || session.kind === 'repo') return session.kind;
  const base = pathBasename(session.worktreePath);
  return base.startsWith(CODE_SESSION_DIR_PREFIX) ? 'code' : 'repo';
}

export function isCodeSession(session: Pick<Session, 'kind' | 'worktreePath'>): boolean {
  return sessionKindFor(session) === 'code';
}
