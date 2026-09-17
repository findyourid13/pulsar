import type { BrowserWindow, IpcMainEvent } from 'electron';
import { ipcMain } from 'electron';
import { IpcChannel } from '@shared/types';

export function registerClickThrough(win: BrowserWindow): () => void {
  const handler = (_event: IpcMainEvent, over: boolean): void => {
    win.setIgnoreMouseEvents(!over, { forward: true });
  };
  ipcMain.on(IpcChannel.HitPointerOverCard, handler);
  return () => ipcMain.off(IpcChannel.HitPointerOverCard, handler);
}
