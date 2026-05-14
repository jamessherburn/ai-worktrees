import { randomUUID } from 'node:crypto';
import type { DiaryItem } from '@shared/types';
import { JsonStore } from './store.js';

type DiaryFile = { items: DiaryItem[] };

const store = new JsonStore<DiaryFile>('diary.json', { items: [] });

export async function listItems(): Promise<DiaryItem[]> {
  const data = await store.read();
  return data.items;
}

export async function addItem(text: string): Promise<DiaryItem> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Item text is required.');
  const item: DiaryItem = {
    id: randomUUID(),
    text: trimmed,
    createdAt: new Date().toISOString(),
    doneAt: null,
  };
  await store.update((current) => ({ items: [...current.items, item] }));
  return item;
}

export async function toggleDone(id: string): Promise<void> {
  const now = new Date().toISOString();
  await store.update((current) => ({
    items: current.items.map((item) =>
      item.id === id ? { ...item, doneAt: item.doneAt ? null : now } : item,
    ),
  }));
}

export async function removeItem(id: string): Promise<void> {
  await store.update((current) => ({
    items: current.items.filter((item) => item.id !== id),
  }));
}

export async function clearDoneBefore(cutoffISO: string): Promise<number> {
  const cutoff = new Date(cutoffISO).getTime();
  if (Number.isNaN(cutoff)) throw new Error('Invalid cutoff date.');
  let removed = 0;
  await store.update((current) => {
    const next = current.items.filter((item) => {
      if (!item.doneAt) return true;
      const keep = new Date(item.doneAt).getTime() > cutoff;
      if (!keep) removed += 1;
      return keep;
    });
    return { items: next };
  });
  return removed;
}
