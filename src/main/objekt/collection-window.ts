import { join } from 'node:path';
import { BrowserWindow } from 'electron';

let browserWindow: BrowserWindow | null = null;

// M4's collection browser, built early (per §14, normally an M4 item) —
// a normal, framed, non-transparent window, unlike the pet window. §13:
// "should feel like a preferences pane, not a web page," so plain native-
// styled HTML/CSS, no design system.
export function openCollectionBrowser(parent: BrowserWindow): void {
  if (browserWindow) {
    browserWindow.focus();
    return;
  }

  browserWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    parent,
    title: 'Choose objekts',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  browserWindow.on('closed', () => {
    browserWindow = null;
  });

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    void browserWindow.loadURL(`${rendererUrl}/collection/index.html`);
  } else {
    void browserWindow.loadFile(join(__dirname, '../renderer/collection/index.html'));
  }
}
