import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannel, type LoginResult } from '@shared/types';
import { CosmoLoginError, sendLoginCode, verifyLoginCode, type CosmoCredentials } from './cosmo-auth';
import { resolveAddressByNickname } from './remote-source';
import { patchSettings } from '../settings';

function loginErrorMessage(error: unknown): string {
  return error instanceof CosmoLoginError ? error.message : 'Something went wrong. Try again.';
}

// resolveAddressByNickname's own errors carry the (URL-encoded) nickname in
// their message — harmless to embed in AppleScript since encodeURIComponent
// already escapes quotes/backslashes, but every other error message in this
// file is a fixed literal, and there's no reason for this one to be the
// exception. Never surfaces the underlying error's text.
function nicknameErrorMessage(): string {
  return 'Couldn’t find that Cosmo nickname. Check the spelling and try again.';
}

// Every string interpolated into an AppleScript source below is escaped
// first — even though today's only dynamic value (the login-error message)
// only ever comes from CosmoLoginError's own fixed literals, never from a
// network response or user keystroke, escaping doesn't rely on that staying
// true. Nothing else here is dynamic: email and code are typed directly into
// the dialog by the user, not interpolated into the script that creates it.
function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function appleScriptTextPrompt(message: string, title: string, confirmLabel: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const script =
      `display dialog "${message}" with title "${title}" default answer "" ` +
      `buttons {"Cancel", "${confirmLabel}"} default button "${confirmLabel}" cancel button "Cancel"`;
    execFile('osascript', ['-e', script], (error, stdout) => {
      if (error) {
        // Non-zero exit means the user hit Cancel (or Escape) — nothing to do.
        resolve(undefined);
        return;
      }
      const match = /text returned:(.*)$/.exec(stdout.trim());
      resolve(match?.[1]);
    });
  });
}

function appleScriptRetryAlert(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const script =
      `display alert "${escapeAppleScriptString(message)}" ` +
      'buttons {"Cancel", "Try again"} default button "Try again" cancel button "Cancel"';
    execFile('osascript', ['-e', script], (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(/Try again/.test(stdout));
    });
  });
}

// macOS: two native `display dialog`s in sequence (email, then code) rather
// than a custom window — §13 wants settings surfaces to feel like system UI.
async function loginViaAppleScript(): Promise<void> {
  const email = (
    await appleScriptTextPrompt(
      'Enter your Cosmo email. Pulsar will send a 6-digit code to sign you in — no password.',
      'Sign in to Cosmo',
      'Continue',
    )
  )?.trim();
  if (!email) return;

  for (;;) {
    try {
      await sendLoginCode(email);
      break;
    } catch (error) {
      if (!(await appleScriptRetryAlert(loginErrorMessage(error)))) return;
    }
  }

  let credentials: CosmoCredentials;
  for (;;) {
    const code = (
      await appleScriptTextPrompt('Enter the 6-digit code Cosmo just emailed you.', 'Sign in to Cosmo', 'Sign in')
    )?.trim();
    if (!code) return;

    try {
      ({ credentials } = await verifyLoginCode(email, code));
      break;
    } catch (error) {
      if (!(await appleScriptRetryAlert(loginErrorMessage(error)))) return;
    }
  }

  for (;;) {
    const nickname = (
      await appleScriptTextPrompt(
        'Enter your Cosmo nickname, so Pulsar knows which collection is yours.',
        'Sign in to Cosmo',
        'Finish',
      )
    )?.trim();
    if (!nickname) return;

    try {
      const address = await resolveAddressByNickname(nickname);
      patchSettings({ objekts: { cosmoAccount: { email, nickname, address }, cosmoSession: credentials } });
      return;
    } catch {
      if (!(await appleScriptRetryAlert(nicknameErrorMessage()))) return;
    }
  }
}

let promptWindow: BrowserWindow | null = null;
let resolvePending: (() => void) | null = null;

// The code step mints the Cosmo session, but the flow only commits to
// Settings once the nickname step succeeds — this carries it across the two
// IPC calls in between, and is cleared as soon as it's written or the window
// closes, so a cancelled login leaves no token behind in memory.
let pendingCredentials: CosmoCredentials | null = null;

// Registered once at module load — loginViaPromptWindow() only ever has at
// most one prompt window open at a time, so module-level handlers are enough
// and avoid leaking fresh ipcMain listeners per invocation.
ipcMain.handle(IpcChannel.LoginSendCode, async (_event, email: unknown): Promise<LoginResult> => {
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, error: 'Enter your email.' };
  }
  try {
    await sendLoginCode(email.trim());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: loginErrorMessage(error) };
  }
});

ipcMain.handle(IpcChannel.LoginVerifyCode, async (_event, payload: unknown): Promise<LoginResult> => {
  const { email, code } = (payload as { email?: unknown; code?: unknown } | null) ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof code !== 'string' || !code.trim()) {
    return { ok: false, error: 'Enter the code.' };
  }
  try {
    ({ credentials: pendingCredentials } = await verifyLoginCode(email.trim(), code.trim()));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: loginErrorMessage(error) };
  }
});

ipcMain.handle(IpcChannel.LoginResolveNickname, async (_event, payload: unknown): Promise<LoginResult> => {
  const { email, nickname } = (payload as { email?: unknown; nickname?: unknown } | null) ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof nickname !== 'string' || !nickname.trim()) {
    return { ok: false, error: 'Enter your nickname.' };
  }
  try {
    const address = await resolveAddressByNickname(nickname.trim());
    patchSettings({
      objekts: {
        cosmoAccount: { email: email.trim(), nickname: nickname.trim(), address },
        cosmoSession: pendingCredentials,
      },
    });
    pendingCredentials = null;
    promptWindow?.close();
    return { ok: true };
  } catch {
    return { ok: false, error: nicknameErrorMessage() };
  }
});

ipcMain.on(IpcChannel.LoginCancel, () => {
  promptWindow?.close();
});

// Non-macOS fallback: Electron has no cross-platform native text-input
// dialog, so this is a small native-styled window standing in for one — a
// stopgap until M4's real settings window subsumes it. macOS gets the
// genuine system dialogs instead (see loginViaAppleScript above); Windows is
// a secondary target that must not be architecturally excluded (per the
// design doc's stack table), so it keeps this window rather than losing the
// feature outright.
function loginViaPromptWindow(parent: BrowserWindow): Promise<void> {
  if (promptWindow) {
    promptWindow.focus();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    resolvePending = resolve;

    promptWindow = new BrowserWindow({
      width: 380,
      height: 240,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      parent,
      modal: true,
      show: false,
      title: 'Sign in to Cosmo',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    promptWindow.setMenuBarVisibility(false);
    promptWindow.once('ready-to-show', () => promptWindow?.show());
    promptWindow.on('closed', () => {
      promptWindow = null;
      pendingCredentials = null;
      resolvePending?.();
      resolvePending = null;
    });

    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    if (rendererUrl) {
      void promptWindow.loadURL(`${rendererUrl}/login/index.html`);
    } else {
      void promptWindow.loadFile(join(__dirname, '../renderer/login/index.html'));
    }
  });
}

export function loginToCosmoAccount(parent: BrowserWindow): Promise<void> {
  return process.platform === 'darwin' ? loginViaAppleScript() : loginViaPromptWindow(parent);
}
