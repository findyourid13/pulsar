import { join } from 'node:path';
import { app, Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { Settings } from '@shared/types';
import { showAboutPanel } from './about';
import { menuSymbol } from './menu-icon';
import { buildAppearanceSection, buildCollectionSection, buildSpinningSection } from './menu-sections';
import { loginToCosmoAccount } from './objekt/login-window';
import { getSourceStatus, reloadObjekts } from './objekt/state';
import type { SourceStatus } from './objekt/provider';
import { getSettings, onSettingsChange, patchSettings } from './settings';
import { centerWindowOnPrimaryDisplay } from './window-position';

// §14 M3: "clear tray-level status" for the graceful-degradation chain.
function sourceStatusLabel(status: SourceStatus, nickname: string | null): string {
  switch (status) {
    case 'remote':
      return `Source: Signed in as ${nickname ?? ''}`;
    case 'remote-cached':
      return `Source: ${nickname ?? 'Cosmo'} (offline, showing cached)`;
    case 'remote-unavailable':
      return 'Source: Cosmo unavailable and nothing cached yet';
    case 'not-connected':
      return 'Source: Not signed in';
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
    const template: MenuItemConstructorOptions[] = [
      { label: 'Pulsar v' + app.getVersion(), enabled: false },
      { type: 'separator' },
      { label: 'Appearance', enabled: false },
      ...buildAppearanceSection(settings),
      { type: 'separator' },
      { label: 'Spinning', enabled: false },
      ...buildSpinningSection(settings),
      { type: 'separator' },
      { label: 'Collection', enabled: false },
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
      { label: 'Connection', enabled: false },
      settings.objekts.cosmoAccount
        ? {
          label: 'Sign out of Cosmo',
          icon: menuSymbol('person.crop.circle.badge.xmark'),
          click: () => {
            patchSettings({ objekts: { cosmoAccount: null, cosmoSession: null } });
          },
        }
        : {
          label: 'Sign in to Cosmo…',
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
      { label: 'Utilities', enabled: false },
      {
        label: 'Click through card',
        icon: menuSymbol('hand.tap'),
        checked: settings.system.alwaysClickThrough,
        type: 'checkbox',
        click: (item) => {
          patchSettings({ system: { alwaysClickThrough: item.checked } });
        },
      },
      {
        label: 'Center on screen',
        icon: menuSymbol('viewfinder'),
        click: () => {
          // Not show() — see window.ts's showInactive() comment.
          win.showInactive();
          centerWindowOnPrimaryDisplay(win);
        },
      },
      { type: 'separator' },
      { label: 'System', enabled: false },
      {
        label: 'Launch at login',
        icon: menuSymbol('power'),
        type: 'checkbox',
        checked: settings.system.launchAtLogin,
        click: (item) => {
          patchSettings({ system: { launchAtLogin: item.checked } });
        },
      },
      {
        label: 'About Pulsar',
        icon: menuSymbol('info.circle'),
        click: () => showAboutPanel(),
      },
      { label: 'Quit', icon: menuSymbol('rectangle.portrait.and.arrow.right'), click: () => app.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  rebuildMenu(getSettings());
  onSettingsChange(rebuildMenu);

  return { tray, refresh: () => rebuildMenu(getSettings()) };
}
