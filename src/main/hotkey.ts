import { globalShortcut, type BrowserWindow } from 'electron';

let currentAccelerator: string | null = null;

function toggleVisibility(win: BrowserWindow): void {
  if (win.isVisible()) {
    win.hide();
  } else {
    // Not show() — activating the window here would re-add it to Windows'
    // Alt-Tab list (see window.ts) on every single toggle.
    win.showInactive();
  }
}

// §8: global hotkey toggles visibility, default Cmd/Ctrl+Shift+P.
export function applyHotkey(win: BrowserWindow, hotkey: string | null): void {
  if (currentAccelerator !== null) {
    globalShortcut.unregister(currentAccelerator);
    currentAccelerator = null;
  }
  if (hotkey === null) return;

  const registered = globalShortcut.register(hotkey, () => toggleVisibility(win));
  if (registered) {
    currentAccelerator = hotkey;
  }
}

// Electron requires unregistering global shortcuts before quit, otherwise
// they can linger registered to a dead process.
export function unregisterHotkey(): void {
  if (currentAccelerator !== null) {
    globalShortcut.unregister(currentAccelerator);
    currentAccelerator = null;
  }
}
