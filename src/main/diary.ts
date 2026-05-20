import { randomUUID } from 'node:crypto';
import type { TaskItem } from '@shared/types';
import { TASK_SECTION_DONE, TASK_SECTION_TODO } from '@shared/tasks';
import { JsonStore } from './store.js';

type DiaryFile = { items: TaskItem[] };

const store = new JsonStore<DiaryFile>('diary.json', { items: [] });

function migrateItem(raw: TaskItem & { sectionId?: string }): TaskItem {
  const sectionId = raw.sectionId ?? (raw.doneAt ? TASK_SECTION_DONE : TASK_SECTION_TODO);
  return {
    id: raw.id,
    text: raw.text,
    createdAt: raw.createdAt,
    sectionId,
    doneAt: raw.doneAt,
  };
}

function normalizeItems(items: TaskItem[]): TaskItem[] {
  return items.map((item) => migrateItem(item));
}

export async function listItems(): Promise<TaskItem[]> {
  const data = await store.read();
  const items = normalizeItems(data.items);
  const needsPersist = data.items.some((item) => {
    const migrated = migrateItem(item);
    return item.sectionId !== migrated.sectionId;
  });
  if (needsPersist) {
    await store.write({ items });
  }
  return items;
}

export async function addItem(text: string, sectionId: string): Promise<TaskItem> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Item text is required.');
  if (!sectionId.trim()) throw new Error('Section is required.');
  const item: TaskItem = {
    id: randomUUID(),
    text: trimmed,
    createdAt: new Date().toISOString(),
    sectionId: sectionId.trim(),
    doneAt: null,
  };
  await store.update((current) => ({
    items: [...normalizeItems(current.items), item],
  }));
  return item;
}

export async function updateItem(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Item text is required.');
  await store.update((current) => ({
    items: normalizeItems(current.items).map((item) =>
      item.id === id ? { ...item, text: trimmed } : item,
    ),
  }));
}

export async function moveToSection(
  id: string,
  sectionId: string,
  whatDidIDoSectionId: string,
): Promise<void> {
  const sid = sectionId.trim();
  if (!sid) throw new Error('Section is required.');
  const now = new Date().toISOString();
  await store.update((current) => ({
    items: normalizeItems(current.items).map((item) => {
      if (item.id !== id) return item;
      const enteringDone = sid === whatDidIDoSectionId;
      const leavingDone = item.sectionId === whatDidIDoSectionId && sid !== whatDidIDoSectionId;
      return {
        ...item,
        sectionId: sid,
        doneAt: enteringDone && !item.doneAt
          ? now
          : leavingDone
            ? null
            : item.doneAt,
      };
    }),
  }));
}

export async function removeItem(id: string): Promise<void> {
  await store.update((current) => ({
    items: normalizeItems(current.items).filter((item) => item.id !== id),
  }));
}

export async function clearDoneBefore(cutoffISO: string): Promise<number> {
  const cutoff = new Date(cutoffISO).getTime();
  if (Number.isNaN(cutoff)) throw new Error('Invalid cutoff date.');
  let removed = 0;
  await store.update((current) => {
    const next = normalizeItems(current.items).filter((item) => {
      if (!item.doneAt) return true;
      const keep = new Date(item.doneAt).getTime() > cutoff;
      if (!keep) removed += 1;
      return keep;
    });
    return { items: next };
  });
  return removed;
}
