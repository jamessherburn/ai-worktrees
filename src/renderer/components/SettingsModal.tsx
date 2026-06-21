import { useCallback, useEffect, useId, useState } from 'react';
import type { SessionLabel, Settings, ThemePreference } from '@shared/types';
import { DEFAULT_SESSION_LABELS, normalizeSessionLabels } from '@shared/session-labels';
import { SessionLabelsEditor } from './SessionLabelsEditor';
import { KeyboardShortcutsReference } from './KeyboardShortcutsReference';
import {
  clampModalSize,
  maxExpandedModalSize,
  shouldUseExpandedModalLayout,
  type ModalSize,
} from '../modal-layout';

const SETTINGS_SIZE_KEY = 'settings-modal-size';

const DEFAULT_WIDTH = 820;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 360;

function loadModalSize(): ModalSize {
  try {
    const raw = localStorage.getItem(SETTINGS_SIZE_KEY);
    if (!raw) return clampModalSize(DEFAULT_WIDTH, DEFAULT_HEIGHT, MIN_WIDTH, MIN_HEIGHT);
    const parsed = JSON.parse(raw) as { width?: number; height?: number };
    return clampModalSize(Number(parsed.width), Number(parsed.height), MIN_WIDTH, MIN_HEIGHT);
  } catch {
    return clampModalSize(DEFAULT_WIDTH, DEFAULT_HEIGHT, MIN_WIDTH, MIN_HEIGHT);
  }
}

function persistModalSize(size: ModalSize) {
  localStorage.setItem(SETTINGS_SIZE_KEY, JSON.stringify(size));
}

type SettingsTab = 'general' | 'labels' | 'shortcuts';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'labels', label: 'Labels' },
  { id: 'shortcuts', label: 'Shortcuts' },
];

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
    sessionLabels: normalizeSessionLabels(settings.sessionLabels ?? DEFAULT_SESSION_LABELS),
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
  const [sessionLabels, setSessionLabels] = useState<SessionLabel[]>(() =>
    normalizeSessionLabels(current.sessionLabels ?? DEFAULT_SESSION_LABELS),
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

  useEffect(() => {
    setCodeDir(current.codeDir);
    setTheme(current.theme);
  }, [current.codeDir, current.theme]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) =>
        expanded
          ? maxExpandedModalSize()
          : clampModalSize(prev.width, prev.height, MIN_WIDTH, MIN_HEIGHT),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expanded]);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const pick = async () => {
    const next = await window.api.pickDirectory(codeDir);
    if (next) setCodeDir(next);
  };

  const selectTheme = async (opt: ThemePreference) => {
    if (opt === theme) return;
    const previous = theme;
    setTheme(opt);
    setSaveError(null);
    try {
      const next = await window.api.updateSettings({ theme: opt });
      onSettingsChange?.(next);
    } catch (err) {
      setTheme(previous);
      setSaveError((err as Error).message);
    }
  };

  const applyImportedSettings = (next: Settings) => {
    const form = applySettingsToForm(next);
    setCodeDir(form.codeDir);
    setTheme(form.theme);
    setSessionLabels(form.sessionLabels);
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
      const next = clampModalSize(restore.width, restore.height, MIN_WIDTH, MIN_HEIGHT);
      setSize(next);
      setExpanded(false);
      setSizeBeforeExpand(null);
    } else {
      setSizeBeforeExpand(size);
      setSize(maxExpandedModalSize());
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
        setSize(clampModalSize(start.width + dw, start.height + dh, MIN_WIDTH, MIN_HEIGHT));
      };

      const onUp = (ev: MouseEvent) => {
        document.body.classList.remove('resizing-settings-modal');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const next = clampModalSize(start.width + dw, start.height + dh, MIN_WIDTH, MIN_HEIGHT);
        setSize(next);
        persistModalSize(next);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [expanded, size],
  );

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const next = await window.api.updateSettings({
        codeDir,
        theme,
        sessionLabels: normalizeSessionLabels(sessionLabels),
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
  const fillWindow = shouldUseExpandedModalLayout(size, expanded);

  return (
    <div
      className={`modal-backdrop${fillWindow ? ' modal-backdrop-expanded' : ''}`}
      onClick={onClose}
    >
      <div
        className={`modal settings-modal${fillWindow ? ' settings-modal-expanded resizable-modal-expanded' : ''}`}
        style={fillWindow ? undefined : { width: size.width, height: size.height }}
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
                  {(['system', 'light', 'dark'] as ThemePreference[]).map((opt) => (
                    <button
                      key={opt}
                      className={`theme-option${theme === opt ? ' active' : ''}`}
                      onClick={() => void selectTheme(opt)}
                      type="button"
                    >
                      {opt[0].toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-section">
                <h3 className="settings-section-title">Backup</h3>
                <div className="settings-card">
                  <p className="settings-card-text">
                    Export all settings as JSON, or import a file from another install. Includes labels.
                    Sessions and to-do items are not included.
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
          {tab === 'shortcuts' && (
            <div
              role="tabpanel"
              id={panelId('shortcuts')}
              aria-labelledby={`${baseId}-tab-shortcuts`}
              className="settings-modal-panel"
            >
              <KeyboardShortcutsReference />
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
