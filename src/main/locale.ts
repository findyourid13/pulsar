import { app, ipcMain } from 'electron';
import { IpcChannel } from '@shared/types';
import { normalizeLocale, type Locale } from '@shared/i18n';

// Detected once from the OS at startup, not a user-facing setting — no
// manual language picker in v1 (see i18n.ts). app.getLocale() needs the
// app to be ready, so this is computed lazily and cached rather than at
// module load time.
let cached: Locale | null = null;

export function getLocale(): Locale {
  if (cached === null) cached = normalizeLocale(app.getLocale());
  return cached;
}

// Renderer windows (login, collection) can't call app.getLocale() directly
// — this is the one IPC round-trip they need at startup to match main's
// locale exactly, rather than guessing from navigator.language.
ipcMain.handle(IpcChannel.LocaleGet, (): Locale => getLocale());
