import { BrowserWindow, app, nativeTheme } from 'electron';
import { join } from 'node:path';
import { nativeThemeSource, windowBackgroundColor } from '@shared/theme';
import type { ThemePreference } from '@shared/types';
import { registerIpc } from './ipc.js';
import { migrateLegacyUserData } from './migrate.js';
import { gracefulShutdown, registerWebContents } from './pty-manager.js';
import { gracefulShellShutdown, registerShellPtyWebContents } from './shell-pty-manager.js';
import {
  registerKeyboardShortcutHandler,
  setKeyboardShortcuts,
} from './keyboard-shortcuts-handler.js';
import { getSettings } from './settings.js';

const isDev = !app.isPackaged;

function createMainWindow(theme: ThemePreference): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    title: 'AI Worktrees',
    backgroundColor: windowBackgroundColor(theme),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 16 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  registerWebContents(win.webContents);
  registerShellPtyWebContents(win.webContents);
  registerKeyboardShortcutHandler(win.webContents);
  return win;
}

app.whenReady().then(async () => {
  await migrateLegacyUserData();
  const settings = await getSettings();
  setKeyboardShortcuts(settings.keyboardShortcuts ?? {});
  nativeTheme.themeSource = nativeThemeSource(settings.theme);
  registerIpc();
  createMainWindow(settings.theme);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void getSettings().then((s) => createMainWindow(s.theme));
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let isQuitting = false;
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  await Promise.all([gracefulShutdown(), gracefulShellShutdown()]);
  app.quit();
});
