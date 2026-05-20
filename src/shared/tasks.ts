import type { TasksConfig, TaskSectionConfig } from './types';

export const TASK_SECTION_TODO = 'todo';
export const TASK_SECTION_IN_PROGRESS = 'in-progress';
export const TASK_SECTION_DONE = 'done';

export const DEFAULT_TASKS_CONFIG: TasksConfig = {
  sections: [
    { id: TASK_SECTION_TODO, name: 'To Do' },
    { id: TASK_SECTION_IN_PROGRESS, name: 'In Progress' },
    { id: TASK_SECTION_DONE, name: 'Done' },
  ],
  whatDidIDoSectionId: TASK_SECTION_DONE,
};

export function normalizeTasksConfig(raw: TasksConfig | undefined): TasksConfig {
  if (!raw?.sections?.length) return { ...DEFAULT_TASKS_CONFIG };

  const sections: TaskSectionConfig[] = raw.sections
    .filter((s) => s.id && s.name)
    .map((s) => ({
      id: s.id.trim(),
      name: s.name.trim(),
      hidden: s.hidden === true,
    }));

  if (sections.length === 0) return { ...DEFAULT_TASKS_CONFIG };

  const sectionIds = new Set(sections.map((s) => s.id));
  const whatDidIDoSectionId = sectionIds.has(raw.whatDidIDoSectionId)
    ? raw.whatDidIDoSectionId
    : sections.find((s) => s.id === TASK_SECTION_DONE)?.id ?? sections[0].id;

  return { sections, whatDidIDoSectionId };
}

export function visibleSectionIds(config: TasksConfig): string[] {
  return config.sections.filter((s) => !s.hidden).map((s) => s.id);
}

export function sectionName(config: TasksConfig, sectionId: string): string {
  return config.sections.find((s) => s.id === sectionId)?.name ?? sectionId;
}
