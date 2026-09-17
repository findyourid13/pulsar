import Store from 'electron-store';
import type { DeepPartial, Settings } from '@shared/types';

const defaults: Settings = {
  version: 1,
  window: {
    sizePreset: 'm',
    positions: {},
    lastDisplayId: null,
  },
  spin: {
    periodSeconds: 32,
    direction: 'cw',
    paused: false,
  },
  display: {
    opacity: 1,
    parallax: true,
    idleBob: true,
  },
  objekts: {
    selectedIds: [],
    shuffleMinutes: 15,
    cosmoAccount: null,
    cosmoSession: null,
  },
  system: {
    launchAtLogin: false,
    // "Command" has no meaning outside macOS — Electron's accelerator
    // parser won't match any real key on Windows/Linux for it, silently
    // leaving the default hotkey unregistered there (see hotkey.ts).
    hotkey: process.platform === 'darwin' ? 'Command+Alt+Shift+P' : 'Control+Alt+Shift+P',
    throttleOnBattery: true,
    alwaysClickThrough: false,
  },
};

const store = new Store<Settings>({ defaults });

export function getSettings(): Settings {
  return store.store;
}

export function patchSettings(patch: DeepPartial<Settings>): Settings {
  store.store = deepMerge(store.store, patch);
  return store.store;
}

export function onSettingsChange(listener: (settings: Settings) => void): () => void {
  return store.onDidAnyChange((newValue) => {
    if (newValue) listener(newValue);
  });
}

function deepMerge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = (base as Record<string, unknown>)[key];
    result[key] =
      isPlainObject(patchValue) && isPlainObject(baseValue) ? deepMerge(baseValue, patchValue) : patchValue;
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
