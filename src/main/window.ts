import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import type { Settings } from '@shared/types';

// §5 — sizing presets, all 5:8 aspect ratio
export const SIZE_PRESETS = {
  xs: { width: 180, height: 288 },
  s: { width: 240, height: 384 },
  m: { width: 320, height: 512 },
  l: { width: 420, height: 672 },
  xl: { width: 520, height: 832 },
} as const satisfies Record<Settings['window']['sizePreset'], { width: number; height: number }>;

// Menu labels: dimensions aren't meaningful to most users, clothing-style
// names are a more familiar mental model than pixel counts.
export const SIZE_LABELS: Record<Settings['window']['sizePreset'], string> = {
  xs: 'Extra Small',
  s: 'Small',
  m: 'Medium',
  l: 'Large',
  xl: 'Extra Large',
};

export function createPetWindow(sizePreset: Settings['window']['sizePreset'] = 'm'): BrowserWindow {
  const { width, height } = SIZE_PRESETS[sizePreset];

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    acceptFirstMouse: true,
    // Shown explicitly via showInactive() below, not Electron's default
    // auto-show. On Windows, a window that's auto-shown (or ever activated
    // via show()/focus()) still turns up in Alt-Tab regardless of
    // skipTaskbar — that flag alone only affects the taskbar, a separate
    // list from the OS's own tracking of "windows that were activated."
    // Never activating it in the first place is what actually keeps it out.
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true }); // default state, see §6
  win.once('ready-to-show', () => win.showInactive());

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
