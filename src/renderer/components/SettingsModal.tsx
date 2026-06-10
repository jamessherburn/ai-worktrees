import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SessionLabel, Settings, SessionPromptPreset, TasksConfig, ThemePreference } from '@shared/types';
import { resolveSessionPrompts } from '@shared/session-prompts';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from '@shared/session-labels';
import { DEFAULT_TASKS_CONFIG, normalizeTasksConfig } from '@shared/tasks';
import { SessionLabelsEditor } from './SessionLabelsEditor';
import type { WizardConfig } from '@shared/wizard';
import { parseWizardConfigJson, wizardConfigToJson } from '@shared/wizard';
import { SessionPromptsSettingsEditor } from './SessionPromptsSettingsEditor';
import { TasksSettingsEditor } from './TasksSettingsEditor';
import { WizardSettingsEditor } from './WizardSettingsEditor';
import { NvimConfigSettingsEditor } from './NvimConfigSettingsEditor';
import { DEFAULT_NVIM_CONFIG, normalizeNvimConfig } from '@shared/nvim-config';

const SETTINGS_SIZE_KEY = 'settings-modal-size';

const DEFAULT_WIDTH = 820;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 360;
const VIEWPORT_MARGIN = 24;

type SettingsTab = 'general' | 'editor' | 'labels' | 'prompts' | 'wizard' | 'tasks';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
  { id: 'labels', label: 'Labels' },
  { id: 'prompts', label: 'Quick Prompts' },
  { id: 'wizard', label: 'Wizard' },
  { id: 'tasks', label: 'Tasks' },
];

type ModalSize = { width: number; height: number };

function maxModalSize(): ModalSize {
  if (typeof window === 'undefined') {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  return {
    width: window.innerWidth - VIEWPORT_MARGIN,
    height: window.innerHeight - VIEWPORT_MARGIN,
  };
}

function clampModalSize(width: number, height: number): ModalSize {
  const max = maxModalSize();
  return {
    width: Math.min(max.width, Math.max(MIN_WIDTH, width)),
    height: Math.min(max.height, Math.max(MIN_HEIGHT, height)),
  };
}

function loadModalSize(): ModalSize {
  try {
    const raw = localStorage.getItem(SETTINGS_SIZE_KEY);
    if (!raw) return clampModalSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    const parsed = JSON.parse(raw) as { width?: number; height?: number };
    return clampModalSize(Number(parsed.width), Number(parsed.height));
  } catch {
    return clampModalSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  }
}

function persistModalSize(size: ModalSize) {
  localStorage.setItem(SETTINGS_SIZE_KEY, JSON.stringify(size));
}

type Props = {
  current: Settings;
  initialTab?: SettingsTab;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
  onSettingsChange?: (settings: Settings) => void;
};

function applySettingsToForm(settings: Settings) {
  return {
    codeDir: settings.codeDir,
    theme: settings.theme,
    wizard: settings.wizard,
    tasks: normalizeTasksConfig(settings.tasks ?? DEFAULT_TASKS_CONFIG),
    sessionPrompts: resolveSessionPrompts(settings.sessionPrompts),
    sessionLabels: normalizeSessionLabels(settings.sessionLabels ?? DEFAULT_SESSION_LABELS),
    nvimConfig: normalizeNvimConfig(settings.nvimConfig ?? DEFAULT_NVIM_CONFIG),
  };
}

export function SettingsModal({
  current,
  initialTab,
  onClose,
  onSaved,
  onSettingsChange,
}: Props) {
  const [codeDir, setCodeDir] = useState(current.codeDir);
  const [theme, setTheme] = useState<ThemePreference>(current.theme);
  const [wizard, setWizard] = useState<WizardConfig>(current.wizard);
  const [tasks, setTasks] = useState<TasksConfig>(
    () => normalizeTasksConfig(current.tasks ?? DEFAULT_TASKS_CONFIG),
  );
  const [sessionPrompts, setSessionPrompts] = useState<SessionPromptPreset[]>(() =>
    resolveSessionPrompts(current.sessionPrompts),
  );
  const [sessionLabels, setSessionLabels] = useState<SessionLabel[]>(() =>
    normalizeSessionLabels(current.sessionLabels ?? DEFAULT_SESSION_LABELS),
  );
  const [nvimConfig, setNvimConfig] = useState(() =>
    normalizeNvimConfig(current.nvimConfig ?? DEFAULT_NVIM_CONFIG),
  );
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'general');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [size, setSize] = useState<ModalSize>(() => loadModalSize());
  const [sizeBeforeExpand, setSizeBeforeExpand] = useState<ModalSize | null>(null);
  const baseId = useId();
  const initialSectionIdsRef = useRef(
    new Set((current.tasks ?? DEFAULT_TASKS_CONFIG).sections.map((s) => s.id)),
  );

  useEffect(() => {
    setCodeDir(current.codeDir);
    setTheme(current.theme);
    setWizard(current.wizard);
    setTasks(normalizeTasksConfig(current.tasks ?? DEFAULT_TASKS_CONFIG));
  }, [current.codeDir, current.theme, current.wizard, current.tasks]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) => clampModalSize(prev.width, prev.height));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pick = async () => {
    const next = await window.api.pickDirectory(codeDir);
    if (next) setCodeDir(next);
  };

  const applyImportedSettings = (next: Settings) => {
    const form = applySettingsToForm(next);
    setCodeDir(form.codeDir);
    setTheme(form.theme);
    setWizard(form.wizard);
    setTasks(form.tasks);
    setSessionPrompts(form.sessionPrompts);
    setSessionLabels(form.sessionLabels);
    setNvimConfig(form.nvimConfig);
    initialSectionIdsRef.current = new Set(form.tasks.sections.map((s) => s.id));
    onSettingsChange?.(next);
  };

  const exportSettings = async () => {
    setTransferBusy(true);
    setTransferMessage(null);
    setSaveError(null);
    try {
      const result = await window.api.exportSettings();
      if (!result.ok) {
        if ('error' in result) setTransferMessage(result.error);
        return;
      }
      setTransferMessage(`Settings exported to ${result.path}`);
    } catch (err) {
      setTransferMessage((err as Error).message);
    } finally {
      setTransferBusy(false);
    }
  };

  const importSettings = async () => {
    const confirmed = window.confirm(
      'Replace all settings with the imported file? Unsaved changes in this dialog will be lost.',
    );
    if (!confirmed) return;

    setTransferBusy(true);
    setTransferMessage(null);
    setSaveError(null);
    try {
      const result = await window.api.importSettings();
      if (!result.ok) {
        if ('error' in result) setTransferMessage(result.error);
        return;
      }
      applyImportedSettings(result.settings);
      setTransferMessage('Settings imported successfully.');
    } catch (err) {
      setTransferMessage((err as Error).message);
    } finally {
      setTransferBusy(false);
    }
  };

  const toggleExpanded = () => {
    if (expanded) {
      const restore = sizeBeforeExpand ?? loadModalSize();
      const next = clampModalSize(restore.width, restore.height);
      setSize(next);
      setExpanded(false);
      setSizeBeforeExpand(null);
    } else {
      setSizeBeforeExpand(size);
      setSize(maxModalSize());
      setExpanded(true);
    }
  };

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (expanded) {
        setExpanded(false);
        setSizeBeforeExpand(null);
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const start = size;
      document.body.classList.add('resizing-settings-modal');

      const onMove = (ev: MouseEvent) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        setSize(clampModalSize(start.width + dw, start.height + dh));
      };

      const onUp = (ev: MouseEvent) => {
        document.body.classList.remove('resizing-settings-modal');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const next = clampModalSize(start.width + dw, start.height + dh);
        setSize(next);
        persistModalSize(next);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [expanded, size],
  );

  const save = async () => {
    const wizardParsed = parseWizardConfigJson(wizardConfigToJson(wizard));
    if (!wizardParsed.ok) {
      setSaveError(wizardParsed.error);
      setTab('wizard');
      return;
    }

    setBusy(true);
    setSaveError(null);
    try {
      const finalSectionIds = new Set(tasks.sections.map((s) => s.id));
      const removedSectionIds = [...initialSectionIdsRef.current].filter((id) => !finalSectionIds.has(id));
      if (removedSectionIds.length > 0) {
        const items = await window.api.tasks.list();
        for (const item of items) {
          if (removedSectionIds.includes(item.sectionId)) {
            await window.api.tasks.remove(item.id);
          }
        }
      }
      const next = await window.api.updateSettings({
        codeDir,
        theme,
        wizard: wizardParsed.value,
        tasks,
        sessionPrompts: resolveSessionPrompts(sessionPrompts),
        sessionLabels: normalizeSessionLabels(sessionLabels),
        nvimConfig: normalizeNvimConfig(nvimConfig),
      });
      persistModalSize(size);
      onSaved(next);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const panelId = (id: SettingsTab) => `${baseId}-panel-${id}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal settings-modal${expanded ? ' settings-modal-expanded' : ''}`}
        style={{ width: size.width, height: size.height }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header settings-modal-header">
          <div className="settings-modal-title-row">
            <div className="modal-title">Settings</div>
            <button
              type="button"
              className="btn btn-ghost btn-small settings-modal-expand"
              onClick={toggleExpanded}
              title={expanded ? 'Restore previous size' : 'Expand to fill the window'}
            >
              {expanded ? 'Restore size' : 'Expand'}
            </button>
          </div>
          <div className="settings-modal-tabs" role="tablist" aria-label="Settings sections">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${id}`}
                className={`settings-modal-tab${tab === id ? ' active' : ''}`}
                aria-selected={tab === id}
                aria-controls={panelId(id)}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-body settings-modal-body">
          {tab === 'general' && (
            <div
              role="tabpanel"
              id={panelId('general')}
              aria-labelledby={`${baseId}-tab-general`}
              className="settings-modal-panel"
            >
              <div className="field">
                <label className="field-label" htmlFor={`${baseId}-code-dir`}>
                  Code directory
                </label>
                <div className="settings-path-row">
                  <input
                    id={`${baseId}-code-dir`}
                    value={codeDir}
                    onChange={(e) => setCodeDir(e.target.value)}
                  />
                  <button type="button" className="btn btn-ghost" onClick={pick}>
                    Browse…
                  </button>
                </div>
                <p className="settings-field-hint">
                  Where the &ldquo;New Session&rdquo; picker scans for git repositories.
                </p>
              </div>
              <div className="field">
                <span className="field-label">Appearance</span>
                <div className="theme-toggle">
                  {(['system', 'light', 'dark', 'monokai'] as ThemePreference[]).map((opt) => (
                    <button
                      key={opt}
                      className={`theme-option${theme === opt ? ' active' : ''}`}
                      onClick={() => setTheme(opt)}
                      type="button"
                    >
                      {opt === 'monokai' ? 'Monokai' : opt[0].toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-section">
                <h3 className="settings-section-title">Backup</h3>
                <div className="settings-card">
                  <p className="settings-card-text">
                    Export all settings as JSON, or import a file from another install. Includes labels,
                    quick prompts, editor config, wizard, and tasks. Sessions and
                    task cards are not included.
                  </p>
                  <div className="settings-transfer-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={exportSettings}
                      disabled={busy || transferBusy}
                    >
                      Export settings…
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={importSettings}
                      disabled={busy || transferBusy}
                    >
                      Import settings…
                    </button>
                  </div>
                  {transferMessage && (
                    <p
                      className={`settings-transfer-message${
                        transferMessage.endsWith('successfully.') ||
                        transferMessage.startsWith('Settings exported')
                          ? ' settings-transfer-message-ok'
                          : ''
                      }`}
                    >
                      {transferMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {tab === 'editor' && (
            <div
              role="tabpanel"
              id={panelId('editor')}
              aria-labelledby={`${baseId}-tab-editor`}
              className="settings-modal-panel"
            >
              <NvimConfigSettingsEditor value={nvimConfig} onChange={setNvimConfig} />
            </div>
          )}
          {tab === 'labels' && (
            <div
              role="tabpanel"
              id={panelId('labels')}
              aria-labelledby={`${baseId}-tab-labels`}
              className="settings-modal-panel"
            >
              <SessionLabelsEditor labels={sessionLabels} onChange={setSessionLabels} />
            </div>
          )}
          {tab === 'prompts' && (
            <div
              role="tabpanel"
              id={panelId('prompts')}
              aria-labelledby={`${baseId}-tab-prompts`}
              className="settings-modal-panel"
            >
              <SessionPromptsSettingsEditor value={sessionPrompts} onChange={setSessionPrompts} />
            </div>
          )}
          {tab === 'wizard' && (
            <div
              role="tabpanel"
              id={panelId('wizard')}
              aria-labelledby={`${baseId}-tab-wizard`}
              className="settings-modal-panel settings-modal-panel-wizard"
            >
              <WizardSettingsEditor value={wizard} onChange={setWizard} />
            </div>
          )}
          {tab === 'tasks' && (
            <div
              role="tabpanel"
              id={panelId('tasks')}
              aria-labelledby={`${baseId}-tab-tasks`}
              className="settings-modal-panel"
            >
              <TasksSettingsEditor value={tasks} onChange={setTasks} />
            </div>
          )}
        </div>
        <div className="modal-footer settings-modal-footer">
          {saveError && <div className="modal-error settings-modal-save-error">{saveError}</div>}
          <div className="settings-modal-footer-actions">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !codeDir}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <div
          className="settings-modal-resize-handle"
          onMouseDown={onResizeMouseDown}
          title="Drag to resize"
          aria-hidden
        />
      </div>
    </div>
  );
}
