import type { BrowserWindow, IpcMainEvent } from 'electron';
import { ipcMain } from 'electron';
import { IpcChannel } from '@shared/types';
import { persistWindowPosition } from './window-position';

export function registerWindowDrag(win: BrowserWindow): () => void {
  const onDrag = (_event: IpcMainEvent, delta: { dx: number; dy: number }): void => {
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + delta.dx), Math.round(y + delta.dy));
  };
  // Resolves the display fresh, from wherever the drag actually ended —
  // dragging onto a different monitor must land there, not get clamped
  // back to whichever one the drag started on (see persistWindowPosition).
  const onDragEnd = (): void => {
    persistWindowPosition(win);
  };

  ipcMain.on(IpcChannel.WindowDrag, onDrag);
  ipcMain.on(IpcChannel.WindowDragEnd, onDragEnd);
  return () => {
    ipcMain.off(IpcChannel.WindowDrag, onDrag);
    ipcMain.off(IpcChannel.WindowDragEnd, onDragEnd);
  };
}
