import { app, ipcMain } from 'electron';
import { IpcChannel } from '@shared/types';
import { configureAboutPanel } from './about';
import { showCardContextMenu } from './card-context-menu';
import { registerClickThrough } from './click-through';
import { applyHotkey, unregisterHotkey } from './hotkey';
import { applyLaunchAtLogin } from './launch-at-login';
import { installCrashLogging } from './logger';
import './locale';
// Imported first (before other ./objekt/* modules) so registerSchemesAsPrivileged
// runs as early as possible — it must happen before app is ready.
import { registerObjektFileProtocol } from './objekt/file-protocol';
import { clearMetadataCache } from './objekt/cache';
import { checkForUpdates } from './updater';
import {
  configureShuffle,
  getAllObjekts,
  getCurrentObjekt,
  nextObjekt,
  primeFromCache,
  refreshCurrentObjekt,
  reloadObjekts,
} from './objekt/state';
import { getSettings, onSettingsChange, patchSettings } from './settings';
import { createTray } from './tray';
import { createPetWindow, SIZE_PRESETS } from './window';
import { registerWindowDrag } from './window-drag';
import { registerDisplayReclamp, restoreWindowPosition } from './window-position';

installCrashLogging();

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // A second instance must not proceed to whenReady() at all — otherwise it
  // races the first instance for the same settings file and tray icon.
  app.quit();
} else {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  app.whenReady().then(async () => {
    registerObjektFileProtocol();
    configureAboutPanel();

    const initialSettings = getSettings();
    // Awaited before the window (and its renderer) exists at all, so the
    // renderer's first getCurrentObjekt() call can't race this — see
    // primeFromCache's own comment for why that race is what causes the
    // dev placeholder to flash on an otherwise-ordinary startup.
    await primeFromCache(initialSettings);
    const win = createPetWindow(initialSettings.window.sizePreset);
    win.setOpacity(initialSettings.display.opacity);
    restoreWindowPosition(win, initialSettings);
    registerClickThrough(win);
    registerWindowDrag(win);
    registerDisplayReclamp(win);
    const trayHandle = createTray(win);
    applyHotkey(win, initialSettings.system.hotkey);
    applyLaunchAtLogin(initialSettings.system.launchAtLogin);

    // Every launch re-derives each objekt's card back from a fresh fetch
    // rather than trusting up to 6h of on-disk metadata staleness — see
    // clearMetadataCache's own comment. Awaited before reloadObjekts so the
    // live fetch it triggers can't win the race and repopulate the cache
    // before this clears it.
    await clearMetadataCache();
    void reloadObjekts(win).then(() => trayHandle.refresh());
    configureShuffle(initialSettings.objekts.shuffleMinutes);
    checkForUpdates();

    ipcMain.handle(IpcChannel.SettingsGet, () => getSettings());
    ipcMain.handle(IpcChannel.SettingsPatch, (_event, patch) => patchSettings(patch));
    ipcMain.handle(IpcChannel.ObjektCurrentGet, () => getCurrentObjekt());
    ipcMain.handle(IpcChannel.ObjektListGet, () => getAllObjekts());
    // Triggered from the collection browser's own "Refresh collection"
    // button — same reload as the tray's, just invoked from a different
    // window and returning the fresh list straight to the caller instead of
    // broadcasting it, since the browser needs it synchronously to re-render.
    ipcMain.handle(IpcChannel.ObjektCollectionRefresh, () =>
      reloadObjekts(win).then(() => {
        trayHandle.refresh();
        return getAllObjekts();
      }),
    );
    ipcMain.on(IpcChannel.ObjektNext, () => nextObjekt());
    ipcMain.on(IpcChannel.CardContextMenu, () => showCardContextMenu(win));

    let lastHotkey = initialSettings.system.hotkey;
    let lastLaunchAtLogin = initialSettings.system.launchAtLogin;
    let lastCosmoAddress = initialSettings.objekts.cosmoAccount?.address ?? null;
    let lastShuffleMinutes = initialSettings.objekts.shuffleMinutes;
    let lastSelectedIds = initialSettings.objekts.selectedIds.join(',');
    onSettingsChange((settings) => {
      const { width, height } = SIZE_PRESETS[settings.window.sizePreset];
      if (win.getSize()[0] !== width || win.getSize()[1] !== height) {
        win.setSize(width, height);
      }
      win.setOpacity(settings.display.opacity);
      if (settings.system.hotkey !== lastHotkey) {
        lastHotkey = settings.system.hotkey;
        applyHotkey(win, lastHotkey);
      }
      if (settings.system.launchAtLogin !== lastLaunchAtLogin) {
        lastLaunchAtLogin = settings.system.launchAtLogin;
        applyLaunchAtLogin(lastLaunchAtLogin);
      }
      const cosmoAddress = settings.objekts.cosmoAccount?.address ?? null;
      if (cosmoAddress !== lastCosmoAddress) {
        lastCosmoAddress = cosmoAddress;
        void reloadObjekts(win).then(() => trayHandle.refresh());
      }
      if (settings.objekts.shuffleMinutes !== lastShuffleMinutes) {
        lastShuffleMinutes = settings.objekts.shuffleMinutes;
        configureShuffle(lastShuffleMinutes);
      }
      const selectedIdsKey = settings.objekts.selectedIds.join(',');
      if (selectedIdsKey !== lastSelectedIds) {
        lastSelectedIds = selectedIdsKey;
        refreshCurrentObjekt();
      }
      win.webContents.send(IpcChannel.SettingsChanged, settings);
    });
  });

  app.on('will-quit', () => {
    unregisterHotkey();
  });

  app.on('window-all-closed', () => {
    // Pulsar is a menubar-only pet; closing its one window must not quit the app.
  });
}
