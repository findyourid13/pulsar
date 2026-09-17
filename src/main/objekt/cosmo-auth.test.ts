import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
// cosmo-auth.ts imports ../locale for error-message localization, which
// calls ipcMain.handle() at module load and app.getLocale() lazily on first
// use — both need a stub outside the real Electron runtime.
vi.mock('electron', () => ({
  net: { fetch: fetchMock },
  ipcMain: { handle: vi.fn() },
  app: { getLocale: () => 'en-US' },
}));

const { sendLoginCode, verifyLoginCode, refreshCosmoSession, CosmoLoginError, CosmoSessionExpiredError } =
  await import('./cosmo-auth');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('sendLoginCode', () => {
  it('resolves silently on a 200 from the proxy', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(sendLoginCode('a@b.com')).resolves.toBeUndefined();
  });

  it('maps a 400 to a friendly "invalid email" message, not the raw status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { ok: false }));
    await expect(sendLoginCode('not-an-email')).rejects.toThrow(/valid email/);
  });

  it('maps a 429 to a rate-limit message regardless of the call context', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { ok: false }));
    await expect(sendLoginCode('a@b.com')).rejects.toThrow(/Too many attempts/);
  });

  it('turns a network-level failure into the generic connectivity error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(sendLoginCode('a@b.com')).rejects.toThrow(/Could not reach Cosmo/);
  });
});

describe('verifyLoginCode', () => {
  it('maps a 401 to "code is incorrect or expired" — this is the authenticate-context mapping, not init', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { ok: false }));
    await expect(verifyLoginCode('a@b.com', '000000')).rejects.toThrow(/code is incorrect or expired/);
  });

  it('returns the parsed {user, credentials} on success', async () => {
    const payload = { user: { id: 1, email: 'a@b.com', nickname: 'n' }, credentials: { accessToken: 'a', refreshToken: 'r' } };
    fetchMock.mockResolvedValue(jsonResponse(200, payload));
    await expect(verifyLoginCode('a@b.com', '123456')).resolves.toEqual(payload);
  });

  it('rejects with CosmoLoginError (not a generic Error) on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { ok: false }));
    await expect(verifyLoginCode('a@b.com', '123456')).rejects.toBeInstanceOf(CosmoLoginError);
  });
});

describe('refreshCosmoSession', () => {
  it('returns fresh credentials on 200', async () => {
    const credentials = { accessToken: 'new-a', refreshToken: 'new-r' };
    fetchMock.mockResolvedValue(jsonResponse(200, { credentials }));
    await expect(refreshCosmoSession('old-r')).resolves.toEqual(credentials);
  });

  it('throws CosmoSessionExpiredError specifically on 401 — callers branch on this to drop the dead session', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { ok: false }));
    await expect(refreshCosmoSession('dead-token')).rejects.toBeInstanceOf(CosmoSessionExpiredError);
  });

  it('throws CosmoSessionExpiredError on 400 too', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { ok: false }));
    await expect(refreshCosmoSession('dead-token')).rejects.toBeInstanceOf(CosmoSessionExpiredError);
  });

  it('throws the generic CosmoLoginError (not CosmoSessionExpiredError) on a 500 — that is not "sign in again"', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { ok: false }));
    const error = await refreshCosmoSession('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CosmoLoginError);
    expect(error).not.toBeInstanceOf(CosmoSessionExpiredError);
  });
});
