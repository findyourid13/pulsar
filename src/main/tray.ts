import { join } from 'node:path';
import { app, Menu, nativeImage, shell, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { Settings } from '@shared/types';
import { t, traySignedInAs, trayOfflineCached, trayVersionLabel } from '@shared/i18n';
import { showAboutPanel } from './about';
import { getLocale } from './locale';
import { logFilePath } from './logger';
import { menuSymbol } from './menu-icon';
import { buildAppearanceSection, buildCollectionSection, buildSpinningSection } from './menu-sections';
import { loginToCosmoAccount } from './objekt/login-window';
import { getSourceStatus, reloadObjekts } from './objekt/state';
import type { SourceStatus } from './objekt/provider';
import { getSettings, onSettingsChange, patchSettings } from './settings';
import { checkForUpdatesManually } from './updater';
import { centerWindowOnPrimaryDisplay } from './window-position';

// §14 M3: "clear tray-level status" for the graceful-degradation chain.
function sourceStatusLabel(status: SourceStatus, nickname: string | null): string {
  const locale = getLocale();
  switch (status) {
    case 'remote':
      return traySignedInAs(nickname ?? '', locale);
    case 'remote-cached':
      return trayOfflineCached(nickname ?? '', locale);
    case 'remote-unavailable':
      return t('trayUnavailable', locale);
    case 'not-connected':
      return t('trayNotSignedIn', locale);
  }
}

// §12 — the tray menu is the app's only chrome. Related items are grouped
// into submenus (Spin, Appearance) to keep the top level scannable. No
// general settings window exists or is planned — everything configurable
// lives here; the collection browser (nominally M4) was built early — see
// collection-window.ts.
export function createTray(win: BrowserWindow): { tray: Tray; refresh: () => void } {
  const icon = nativeImage.createFromPath(join(__dirname, '../../build/icons/trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Pulsar');

  // reloadObjekts only ever runs on launch or reconnect (see state.ts) — a
  // manual refresh is the only way to pick up something minted/traded since.
  let refreshing = false;

  function rebuildMenu(settings: Settings): void {
    const locale = getLocale();
    const template: MenuItemConstructorOptions[] = [
      { label: trayVersionLabel(app.getVersion()), enabled: false },
      { type: 'separator' },
      { label: t('trayAppearance', locale), enabled: false },
      ...buildAppearanceSection(settings),
      { type: 'separator' },
      { label: t('traySpinning', locale), enabled: false },
      ...buildSpinningSection(settings),
      { type: 'separator' },
      { label: t('trayCollection', locale), enabled: false },
      ...buildCollectionSection(settings, {
        win,
        refreshing,
        onRefresh: () => {
          if (refreshing) return;
          refreshing = true;
          rebuildMenu(settings);
          void reloadObjekts(win).finally(() => {
            refreshing = false;
            rebuildMenu(getSettings());
          });
        },
      }),
      { type: 'separator' },
      { label: t('trayConnection', locale), enabled: false },
      settings.objekts.cosmoAccount
        ? {
          label: t('traySignOut', locale),
          icon: menuSymbol('person.crop.circle.badge.xmark'),
          click: () => {
            patchSettings({ objekts: { cosmoAccount: null, cosmoSession: null } });
          },
        }
        : {
          label: t('traySignIn', locale),
          icon: menuSymbol('person.crop.circle.badge.plus'),
          click: () => {
            void loginToCosmoAccount(win);
          },
        },
      {
        label: sourceStatusLabel(getSourceStatus(), settings.objekts.cosmoAccount?.nickname ?? null),
        icon: menuSymbol('dot.radiowaves.left.and.right'),
        enabled: false,
      },
      { type: 'separator' },
      { label: t('trayUtilities', locale), enabled: false },
      {
        label: t('trayClickThroughCard', locale),
        icon: menuSymbol('hand.tap'),
        checked: settings.system.alwaysClickThrough,
        type: 'checkbox',
        click: (item) => {
          patchSettings({ system: { alwaysClickThrough: item.checked } });
        },
      },
      {
        label: t('trayCenterOnScreen', locale),
        icon: menuSymbol('viewfinder'),
        click: () => {
          // Not show() — see window.ts's showInactive() comment.
          win.showInactive();
          centerWindowOnPrimaryDisplay(win);
        },
      },
      { type: 'separator' },
      { label: t('traySystem', locale), enabled: false },
      {
        label: t('trayLaunchAtLogin', locale),
        icon: menuSymbol('power'),
        type: 'checkbox',
        checked: settings.system.launchAtLogin,
        click: (item) => {
          patchSettings({ system: { launchAtLogin: item.checked } });
        },
      },
      {
        label: t('trayCheckForUpdates', locale),
        icon: menuSymbol('arrow.down.circle'),
        click: () => checkForUpdatesManually(),
      },
      {
        label: t('trayAboutPulsar', locale),
        icon: menuSymbol('info.circle'),
        click: () => showAboutPanel(),
      },
      {
        label: t('trayRevealLog', locale),
        icon: menuSymbol('doc.text.magnifyingglass'),
        click: () => shell.showItemInFolder(logFilePath()),
      },
      { label: t('trayQuit', locale), icon: menuSymbol('rectangle.portrait.and.arrow.right'), click: () => app.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  rebuildMenu(getSettings());
  onSettingsChange(rebuildMenu);

  return { tray, refresh: () => rebuildMenu(getSettings()) };
}
