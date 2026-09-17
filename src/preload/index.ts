import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannel,
  type CardFace,
  type DeepPartial,
  type LoginResult,
  type Objekt,
  type RenderThrottlePayload,
  type Settings,
} from '@shared/types';
import type { Locale } from '@shared/i18n';

const pulsar = {
  getLocale(): Promise<Locale> {
    return ipcRenderer.invoke(IpcChannel.LocaleGet);
  },
  reportPointerOverCard(over: boolean): void {
    ipcRenderer.send(IpcChannel.HitPointerOverCard, over);
  },
  dragWindow(dx: number, dy: number): void {
    ipcRenderer.send(IpcChannel.WindowDrag, { dx, dy });
  },
  endDragWindow(): void {
    ipcRenderer.send(IpcChannel.WindowDragEnd);
  },
  getSettings(): Promise<Settings> {
    return ipcRenderer.invoke(IpcChannel.SettingsGet);
  },
  patchSettings(patch: DeepPartial<Settings>): Promise<Settings> {
    return ipcRenderer.invoke(IpcChannel.SettingsPatch, patch);
  },
  onSettingsChanged(listener: (settings: Settings) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, settings: Settings) => listener(settings);
    ipcRenderer.on(IpcChannel.SettingsChanged, handler);
    return () => ipcRenderer.off(IpcChannel.SettingsChanged, handler);
  },
  getCurrentObjekt(): Promise<Objekt | null> {
    return ipcRenderer.invoke(IpcChannel.ObjektCurrentGet);
  },
  onObjektCurrent(listener: (objekt: Objekt | null) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, objekt: Objekt | null) => listener(objekt);
    ipcRenderer.on(IpcChannel.ObjektCurrent, handler);
    return () => ipcRenderer.off(IpcChannel.ObjektCurrent, handler);
  },
  requestNextObjekt(): void {
    ipcRenderer.send(IpcChannel.ObjektNext);
  },
  onObjektShuffle(listener: (objekt: Objekt | null) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, objekt: Objekt | null) => listener(objekt);
    ipcRenderer.on(IpcChannel.ObjektShuffle, handler);
    return () => ipcRenderer.off(IpcChannel.ObjektShuffle, handler);
  },
  requestContextMenu(): void {
    ipcRenderer.send(IpcChannel.CardContextMenu);
  },
  onCardFace(listener: (face: CardFace) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, face: CardFace) => listener(face);
    ipcRenderer.on(IpcChannel.CardFace, handler);
    return () => ipcRenderer.off(IpcChannel.CardFace, handler);
  },
  getObjektList(): Promise<Objekt[]> {
    return ipcRenderer.invoke(IpcChannel.ObjektListGet);
  },
  refreshCollection(): Promise<Objekt[]> {
    return ipcRenderer.invoke(IpcChannel.ObjektCollectionRefresh);
  },
  onRenderThrottle(listener: (payload: RenderThrottlePayload) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: RenderThrottlePayload) => listener(payload);
    ipcRenderer.on(IpcChannel.RenderThrottle, handler);
    return () => ipcRenderer.off(IpcChannel.RenderThrottle, handler);
  },
  // Used only by the "Sign in to Cosmo" prompt window (§9 login, M3) —
  // harmless no-ops from the pet window's perspective, which never calls
  // them. Kept on this same bridge rather than a second preload entry:
  // Electron's sandboxed preload loader can't load a code-split bundle, and
  // a second entry that shares @shared/types with this one forces Vite to
  // split out a shared chunk.
  sendLoginCode(email: string): Promise<LoginResult> {
    return ipcRenderer.invoke(IpcChannel.LoginSendCode, email);
  },
  verifyLoginCode(email: string, code: string): Promise<LoginResult> {
    return ipcRenderer.invoke(IpcChannel.LoginVerifyCode, { email, code });
  },
  resolveCosmoNickname(email: string, nickname: string): Promise<LoginResult> {
    return ipcRenderer.invoke(IpcChannel.LoginResolveNickname, { email, nickname });
  },
  cancelLogin(): void {
    ipcRenderer.send(IpcChannel.LoginCancel);
  },
};

export type PulsarBridge = typeof pulsar;

contextBridge.exposeInMainWorld('pulsar', pulsar);
