import type { WorktreesSkill } from './types';

/** Legacy nested skill shape in stored worktreesSkills. */
type LegacySkillShape = {
  name?: string;
  prompt?: string;
  text?: string;
  title?: string;
  description?: string;
  children?: { name?: string; title?: string; prompt?: string; text?: string; description?: string }[];
};

function normalizeSkill(raw: WorktreesSkill): WorktreesSkill | null {
  const name = raw.name?.trim();
  const prompt = raw.prompt?.trim();
  if (!name || !prompt) return null;
  const description = raw.description?.trim();
  return description ? { name, prompt, description } : { name, prompt };
}

function flattenLegacySkill(raw: LegacySkillShape): WorktreesSkill[] {
  const out: WorktreesSkill[] = [];
  const parentName = (raw.name ?? raw.title)?.trim();
  const parentPrompt = (raw.prompt ?? raw.text)?.trim() ?? '';
  const children = raw.children ?? [];

  if (parentName && parentPrompt) {
    const description = raw.description?.trim();
    out.push(description ? { name: parentName, prompt: parentPrompt, description } : { name: parentName, prompt: parentPrompt });
  }

  for (const child of children) {
    const name = (child.name ?? child.title)?.trim();
    const prompt = (child.prompt ?? child.text)?.trim();
    if (!name || !prompt) continue;
    const description = child.description?.trim();
    out.push(description ? { name, prompt, description } : { name, prompt });
  }

  if (out.length === 0 && parentName && parentPrompt) {
    const description = raw.description?.trim();
    out.push(description ? { name: parentName, prompt: parentPrompt, description } : { name: parentName, prompt: parentPrompt });
  }

  return out;
}

export const DEFAULT_WORKTREES_SKILLS: WorktreesSkill[] = [
  {
    name: 'Summarise Session',
    description: 'Summarise everything done so far in this session.',
    prompt: 'Please summarise everything we have done so far in this session.',
  },
  {
    name: 'Create Pull Request',
    description: 'Open a pull request with a structured description.',
    prompt:
      'Please can you create a pull request for the changes we have made here. The title should be short and clear. The description should include 3 key sections: TLDR, Before/After and Commit History.',
  },
];

export function cloneDefaultWorktreesSkills(): WorktreesSkill[] {
  return DEFAULT_WORKTREES_SKILLS.map((skill) => ({
    name: skill.name,
    prompt: skill.prompt,
    ...(skill.description ? { description: skill.description } : {}),
  }));
}

function flattenStoredSkills(raw: WorktreesSkill[] | LegacySkillShape[]): WorktreesSkill[] {
  const out: WorktreesSkill[] = [];
  for (const item of raw) {
    const legacy = item as LegacySkillShape;
    if (legacy.children?.length) {
      out.push(...flattenLegacySkill(legacy));
      continue;
    }
    const normalized = normalizeSkill(item as WorktreesSkill);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function resolveWorktreesSkills(raw: WorktreesSkill[] | undefined): WorktreesSkill[] {
  if (raw?.length) {
    const out = flattenStoredSkills(raw);
    if (out.length > 0) return out;
  }

  return cloneDefaultWorktreesSkills();
}

export function normalizeWorktreesSkills(raw: WorktreesSkill[] | undefined): WorktreesSkill[] {
  return resolveWorktreesSkills(raw);
}

export function matchWorktreesSkills(query: string, skills: WorktreesSkill[]): WorktreesSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...skills];
  return skills.filter((skill) => skill.name.toLowerCase().includes(q));
}

/** Best single skill match for a slash-command query (text after `/`). */
export function resolveWorktreesSkill(query: string, skills: WorktreesSkill[]): WorktreesSkill | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const matches = matchWorktreesSkills(q, skills);
  if (matches.length === 0) return null;

  const exact = matches.find((skill) => skill.name.toLowerCase() === q);
  if (exact) return exact;

  const prefixMatches = matches.filter((skill) => skill.name.toLowerCase().startsWith(q));
  if (prefixMatches.length === 1) return prefixMatches[0];

  if (matches.length === 1) return matches[0];

  return null;
}

export function combineSkillPromptAndSuffix(prompt: string, suffix: string): string {
  const trimmedSuffix = suffix.trim();
  if (!trimmedSuffix) return prompt;
  return `${prompt}${/\s$/.test(prompt) ? '' : ' '}${trimmedSuffix}`;
}

export function formatSlashSkillDisplay(skill: WorktreesSkill, suffix = ''): string {
  if (suffix === '') return `/${skill.name} `;
  return `/${skill.name} ${suffix}`;
}

/** Parse `/skill-name` with optional trailing text on the same line. */
export function parseSlashSkillCommand(
  input: string,
  skills: WorktreesSkill[],
  highlightedSkill?: WorktreesSkill | null,
): { skill: WorktreesSkill; suffix: string } | null {
  if (!input.startsWith('/')) return null;
  const rest = input.slice(1);

  const byLength = [...skills].sort((a, b) => b.name.length - a.name.length);
  for (const skill of byLength) {
    const nameLower = skill.name.toLowerCase();
    const restLower = rest.toLowerCase();
    if (restLower === nameLower) return { skill, suffix: '' };
    if (restLower.startsWith(`${nameLower} `)) {
      return { skill, suffix: rest.slice(skill.name.length).trimStart() };
    }
  }

  const resolved = resolveWorktreesSkill(rest, skills);
  if (resolved) {
    const nameLower = resolved.name.toLowerCase();
    const restLower = rest.toLowerCase();
    if (restLower === nameLower || restLower.startsWith(`${nameLower} `)) {
      return {
        skill: resolved,
        suffix: restLower === nameLower ? '' : rest.slice(resolved.name.length).trimStart(),
      };
    }
    if (nameLower.startsWith(restLower)) {
      return { skill: resolved, suffix: '' };
    }
  }

  if (highlightedSkill) {
    return { skill: highlightedSkill, suffix: '' };
  }

  return null;
}

/** True when input is `/Skill name` or `/Skill name extra text` (not a partial prefix). */
export function isCompleteSlashSkillReference(input: string, skills: WorktreesSkill[]): boolean {
  const parsed = parseSlashSkillCommand(input, skills);
  if (!parsed) return false;
  const rest = input.slice(1);
  const nameLower = parsed.skill.name.toLowerCase();
  const restLower = rest.toLowerCase();
  return restLower === nameLower || restLower.startsWith(`${nameLower} `);
}

export function findActiveSlashIndex(input: string): number {
  return input.lastIndexOf('/');
}

function slashReferenceLength(segment: string, skills: WorktreesSkill[]): number | null {
  const parsed = parseSlashSkillCommand(segment, skills);
  if (!parsed || !isCompleteSlashSkillReference(segment, skills)) return null;
  const namePart = 1 + parsed.skill.name.length;
  if (!parsed.suffix) return namePart;
  return namePart + 1 + parsed.suffix.length;
}

/** Character length of a committed `/skill-name` token within a slash segment. */
export function getSlashSkillTokenDisplayLength(segment: string, skills: WorktreesSkill[]): number | null {
  const parsed = parseSlashSkillCommand(segment, skills);
  if (!parsed || !isCompleteSlashSkillReference(segment, skills)) return null;
  return 1 + parsed.skill.name.length;
}

/** Expand every complete `/skill` reference embedded in free-form text. */
export function expandSlashSkillsInText(input: string, skills: WorktreesSkill[]): string {
  let result = '';
  let i = 0;
  while (i < input.length) {
    if (input[i] === '/') {
      const segment = input.slice(i);
      const len = slashReferenceLength(segment, skills);
      if (len !== null) {
        const parsed = parseSlashSkillCommand(segment, skills)!;
        result += combineSkillPromptAndSuffix(parsed.skill.prompt, parsed.suffix);
        i += len;
        continue;
      }
    }
    result += input[i];
    i++;
  }
  return result;
}

export function resolveSlashSkillSubmission(
  input: string,
  skills: WorktreesSkill[],
  highlightedSkill?: WorktreesSkill | null,
): string | null {
  const parsed = parseSlashSkillCommand(input, skills, highlightedSkill);
  if (!parsed || !isCompleteSlashSkillReference(input, skills)) return null;
  return combineSkillPromptAndSuffix(parsed.skill.prompt, parsed.suffix);
}

/** Resolve bottom-bar input into the prompt sent to the active session. */
export function resolvePrompterSubmission(input: string, skills: WorktreesSkill[]): string | null {
  if (!input.trim()) return null;
  return expandSlashSkillsInText(input, skills);
}
