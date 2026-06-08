import type { SessionWithStatus } from './types';
import { activityKindFor } from './session-labels';

type ActivityGroup = 'working' | 'idle' | 'stopped';

const GROUP_ORDER: ActivityGroup[] = ['working', 'idle', 'stopped'];

function activityGroupFor(session: SessionWithStatus): ActivityGroup {
  const kind = activityKindFor(session);
  if (kind === 'working') return 'working';
  if (kind === 'idle') return 'idle';
  return 'stopped';
}

/** Session order as shown in the Workspace sidebar (activity → repo → name). */
export function sessionsInSidebarOrder(sessions: SessionWithStatus[]): SessionWithStatus[] {
  const buckets: Record<ActivityGroup, SessionWithStatus[]> = {
    working: [],
    idle: [],
    stopped: [],
  };
  for (const session of sessions) buckets[activityGroupFor(session)].push(session);

  const ordered: SessionWithStatus[] = [];
  for (const group of GROUP_ORDER) {
    const byRepo = new Map<string, SessionWithStatus[]>();
    for (const session of buckets[group]) {
      const list = byRepo.get(session.repoName) ?? [];
      list.push(session);
      byRepo.set(session.repoName, list);
    }
    const repos = Array.from(byRepo.entries())
      .map(
        ([repo, items]) =>
          [repo, items.sort((a, b) => a.name.localeCompare(b.name))] as [string, SessionWithStatus[]],
      )
      .sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, items] of repos) ordered.push(...items);
  }
  return ordered;
}
