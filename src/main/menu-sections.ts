import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import type { Settings } from '@shared/types';
import { menuSymbol } from './menu-icon';
import { openCollectionBrowser } from './objekt/collection-window';
import { getActiveCount, getCollectionCachedAt, nextObjekt } from './objekt/state';
import { patchSettings } from './settings';
import { SIZE_LABELS, SIZE_PRESETS } from './window';

// Shared by tray.ts (which shows every item) and card-context-menu.ts
// (which picks a handful) so the two can't drift the way they did before
// this was pulled out — each item built once, in one place.
export const OPACITY_STEPS = [1, 0.8, 0.6, 0.4, 0.2] as const;
export const SPIN_SPEED_PRESETS = [15, 30, 60] as const; // seconds per revolution
export const DIRECTION_LABELS: Record<Settings['spin']['direction'], string> = {
  cw: 'Clockwise',
  ccw: 'Counter-clockwise',
};
// §8 Shuffle: "every N minutes (default 15, configurable, 'never' allowed)".
export const SHUFFLE_PRESETS: Array<number | null> = [5, 15, 30, 60, null];
export function shuffleLabel(minutes: number | null): string {
  return minutes === null ? 'Never' : `Every ${minutes} min`;
}

export function buildNextObjektItem(): MenuItemConstructorOptions {
  return {
    label: 'Next objekt',
    icon: menuSymbol('chevron.right.2'),
    enabled: getActiveCount() > 1,
    click: () => nextObjekt(),
  };
}

export function buildPauseSpinningItem(settings: Settings): MenuItemConstructorOptions {
  return {
    label: 'Pause spinning',
    icon: menuSymbol('pause.circle'),
    type: 'checkbox',
    checked: settings.spin.paused,
    click: (item) => {
      patchSettings({ spin: { paused: item.checked } });
    },
  };
}

export function buildSizeItem(settings: Settings): MenuItemConstructorOptions {
  return {
    label: 'Size',
    icon: menuSymbol('arrow.up.left.and.arrow.down.right'),
    submenu: (Object.keys(SIZE_PRESETS) as Array<Settings['window']['sizePreset']>).map(
      (preset): MenuItemConstructorOptions => ({
        label: SIZE_LABELS[preset],
        type: 'radio',
        checked: settings.window.sizePreset === preset,
        click: () => patchSettings({ window: { sizePreset: preset } }),
      }),
    ),
  };
}

export function buildOpacityItem(settings: Settings): MenuItemConstructorOptions {
  return {
    label: 'Opacity',
    icon: menuSymbol('circle.lefthalf.filled'),
    submenu: OPACITY_STEPS.map(
      (value): MenuItemConstructorOptions => ({
        label: `${Math.round(value * 100)}%`,
        type: 'radio',
        checked: settings.display.opacity === value,
        click: () => patchSettings({ display: { opacity: value } }),
      }),
    ),
  };
}

export function buildSpinSpeedItem(settings: Settings): MenuItemConstructorOptions {
  return {
    label: 'Spin speed',
    icon: menuSymbol('speedometer'),
    submenu: SPIN_SPEED_PRESETS.map(
      (seconds): MenuItemConstructorOptions => ({
        label: `${seconds}s`,
        type: 'radio',
        checked: settings.spin.periodSeconds === seconds,
        click: () => patchSettings({ spin: { periodSeconds: seconds } }),
      }),
    ),
  };
}

export function buildSpinDirectionItem(settings: Settings): MenuItemConstructorOptions {
  return {
    label: 'Spin direction',
    icon: menuSymbol('arrow.triangle.2.circlepath'),
    submenu: (Object.keys(DIRECTION_LABELS) as Array<Settings['spin']['direction']>).map(
      (direction): MenuItemConstructorOptions => ({
        label: DIRECTION_LABELS[direction],
        type: 'radio',
        checked: settings.spin.direction === direction,
        click: () => patchSettings({ spin: { direction } }),
      }),
    ),
  };
}

export type RefreshCollectionOptions = {
  win: BrowserWindow;
  // Only the tray tracks this across its own persistent menu — a context
  // menu is rebuilt fresh on every right-click and closes on the click that
  // would change it, so it always passes false/a plain one-shot refresh.
  refreshing: boolean;
  onRefresh: () => void;
};

export function buildRefreshCollectionItem(settings: Settings, options: RefreshCollectionOptions): MenuItemConstructorOptions {
  return {
    label: options.refreshing ? 'Refreshing…' : 'Refresh collection',
    icon: menuSymbol('arrow.clockwise'),
    enabled: !options.refreshing && settings.objekts.cosmoAccount !== null,
    click: options.onRefresh,
  };
}

// Absolute time rather than a relative "5 min ago" string: the tray menu
// only rebuilds on a real state change, not on a timer, so a relative label
// would silently go stale while the menu just sits there closed.
function lastCachedLabel(cachedAt: number | null): string {
  return cachedAt === null ? 'Last cached: never' : `Last cached: ${new Date(cachedAt).toLocaleString()}`;
}

export function buildLastCachedItem(): MenuItemConstructorOptions {
  return { label: lastCachedLabel(getCollectionCachedAt()), icon: menuSymbol('clock'), enabled: false };
}

export function buildChooseObjektsItem(win: BrowserWindow): MenuItemConstructorOptions {
  return {
    label: 'Choose objekts…',
    icon: menuSymbol('square.grid.2x2'),
    click: () => openCollectionBrowser(win),
  };
}

export function buildShuffleItem(settings: Settings): MenuItemConstructorOptions {
  return {
    label: 'Shuffle',
    icon: menuSymbol('shuffle'),
    enabled: getActiveCount() > 1,
    submenu: SHUFFLE_PRESETS.map((minutes) => ({
      label: shuffleLabel(minutes),
      type: 'radio',
      checked: settings.objekts.shuffleMinutes === minutes,
      click: () => patchSettings({ objekts: { shuffleMinutes: minutes } }),
    })),
  };
}

export function buildAppearanceSection(settings: Settings): MenuItemConstructorOptions[] {
  return [buildNextObjektItem(), buildSizeItem(settings), buildOpacityItem(settings)];
}

export function buildSpinningSection(settings: Settings): MenuItemConstructorOptions[] {
  return [buildPauseSpinningItem(settings), buildSpinSpeedItem(settings), buildSpinDirectionItem(settings)];
}

export function buildCollectionSection(settings: Settings, options: RefreshCollectionOptions): MenuItemConstructorOptions[] {
  return [
    buildRefreshCollectionItem(settings, options),
    buildLastCachedItem(),
    buildChooseObjektsItem(options.win),
    buildShuffleItem(settings),
  ];
}
