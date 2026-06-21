import { randomUUID } from 'node:crypto';
import type { TaskItem } from '@shared/types';
import {
  normalizeTaskSectionId,
  TASK_SECTION_DONE,
  TASK_SECTION_TODO,
} from '@shared/tasks';
import { JsonStore } from './store.js';

type DiaryFile = { items: TaskItem[] };

const store = new JsonStore<DiaryFile>('diary.json', { items: [] });

function migrateItem(raw: TaskItem & { sectionId?: string }): TaskItem {
  const sectionId = normalizeTaskSectionId(raw.sectionId ?? (raw.doneAt ? TASK_SECTION_DONE : TASK_SECTION_TODO));
  return {
    id: raw.id,
    text: raw.text,
    createdAt: raw.createdAt,
    sectionId,
    labelIds: raw.labelIds?.length ? raw.labelIds : undefined,
    doneAt: raw.doneAt,
  };
}

function normalizeItems(items: TaskItem[]): TaskItem[] {
  return items.map((item) => migrateItem(item));
}

export async function listItems(): Promise<TaskItem[]> {
  const data = await store.read();
  const items = normalizeItems(data.items);
  const needsPersist = data.items.some((item, i) => {
    const migrated = items[i];
    return item.sectionId !== migrated.sectionId || item.labelIds !== migrated.labelIds;
  });
  if (needsPersist) {
    await store.write({ items });
  }
  return items;
}

export async function addItem(
  text: string,
  sectionId: string,
  labelIds?: string[],
): Promise<TaskItem> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Item text is required.');
  const sid = normalizeTaskSectionId(sectionId);
  const now = new Date().toISOString();
  const item: TaskItem = {
    id: randomUUID(),
    text: trimmed,
    createdAt: now,
    sectionId: sid,
    labelIds: labelIds?.length ? labelIds : undefined,
    doneAt: sid === TASK_SECTION_DONE ? now : null,
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

export async function setItemLabels(id: string, labelIds: string[]): Promise<void> {
  await store.update((current) => ({
    items: normalizeItems(current.items).map((item) =>
      item.id === id ? { ...item, labelIds: labelIds.length ? labelIds : undefined } : item,
    ),
  }));
}

export async function moveToSection(id: string, sectionId: string): Promise<void> {
  const sid = normalizeTaskSectionId(sectionId);
  const now = new Date().toISOString();
  await store.update((current) => ({
    items: normalizeItems(current.items).map((item) => {
      if (item.id !== id) return item;
      const enteringDone = sid === TASK_SECTION_DONE;
      const leavingDone = item.sectionId === TASK_SECTION_DONE && sid !== TASK_SECTION_DONE;
      return {
        ...item,
        sectionId: sid,
        doneAt: enteringDone && !item.doneAt ? now : leavingDone ? null : item.doneAt,
      };
    }),
  }));
}

export async function removeItem(id: string): Promise<void> {
  await store.update((current) => ({
    items: normalizeItems(current.items).filter((item) => item.id !== id),
  }));
}
