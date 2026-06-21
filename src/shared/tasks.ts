import type { TaskItem } from './types';

export const TASK_SECTION_TODO = 'todo';
export const TASK_SECTION_DOING = 'doing';
export const TASK_SECTION_DONE = 'done';

/** @deprecated Migrated to `doing` on read. */
export const TASK_SECTION_IN_PROGRESS = 'in-progress';

export const TASK_SECTIONS = [
  { id: TASK_SECTION_TODO, name: 'To Do' },
  { id: TASK_SECTION_DOING, name: 'Doing' },
  { id: TASK_SECTION_DONE, name: 'Done' },
] as const;

export type TaskSectionId =
  | typeof TASK_SECTION_TODO
  | typeof TASK_SECTION_DOING
  | typeof TASK_SECTION_DONE;

export function normalizeTaskSectionId(sectionId: string): TaskSectionId {
  if (sectionId === TASK_SECTION_IN_PROGRESS) return TASK_SECTION_DOING;
  if (
    sectionId === TASK_SECTION_TODO ||
    sectionId === TASK_SECTION_DOING ||
    sectionId === TASK_SECTION_DONE
  ) {
    return sectionId;
  }
  return TASK_SECTION_TODO;
}

export function isoLocalDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Match tasks against optional label and date filters (both must pass when set). */
export function taskMatchesFilters(
  item: Pick<TaskItem, 'labelIds' | 'createdAt' | 'doneAt'>,
  labelFilter: string[],
  dateFilter: string | null,
): boolean {
  if (labelFilter.length > 0) {
    const ids = item.labelIds ?? [];
    if (!labelFilter.some((id) => ids.includes(id))) return false;
  }
  if (dateFilter) {
    const day = isoLocalDate(item.doneAt ?? item.createdAt);
    if (day !== dateFilter) return false;
  }
  return true;
}

export function toggleTaskLabelIds(labelIds: string[] | undefined, labelId: string): string[] {
  const set = new Set(labelIds ?? []);
  if (set.has(labelId)) set.delete(labelId);
  else set.add(labelId);
  return Array.from(set);
}
