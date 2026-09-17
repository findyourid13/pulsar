import { net } from 'electron';

// §9 login (revised 2026-09-15): Cosmo delegates sign-in to a third-party
// auth provider — email + 6-digit code, "passwordless" in that provider's
// own terms. Pulsar no longer talks to it directly, and no longer carries
// Cosmo's app identifiers for it or the `x-cosmo-encrypted` AES key: those
// live on the project owner's own proxy instead (see ../../server/), so a
// publicly distributed Pulsar binary doesn't hand every install the means to
// identify itself as "the Cosmo app".
//
// The proxy is stateless — it relays three one-shot calls and forgets them.
// The per-user session it returns is held here, by this install, and
// persisted alongside the rest of Settings (electron-store). That is a
// deliberate reversal of §9's earlier "no standing session" rule, made
// because a real Cosmo accessToken is what unlocks /bff/v3/objekt-summaries
// and with it the user's own real front/back artwork.
try {
  process.loadEnvFile();
} catch {
  // No .env file — e.g. a packaged build. PROXY_URL's default covers it.
}

// Not a secret — it's a public endpoint address, same as COSMO_API_URL in
// remote-source.ts, not an access-granting credential like the auth-provider
// identifiers/AES key the proxy itself holds. It has to be a real, committed
// default:
// a packaged build has no .env to read (loadEnvFile above just no-ops), so
// without one, every downloaded copy of Pulsar would silently fall back to
// localhost and fail for anyone who isn't the developer. Override locally
// via PULSAR_PROXY_URL in a gitignored .env to point at a local `node
// proxy.ts` instead.
const PROXY_URL = process.env['PULSAR_PROXY_URL'] ?? 'https://pulsar.r-e.kr';

export class CosmoLoginError extends Error {}

// A dead/revoked refresh token is not a network problem and retrying won't
// fix it — the user has to sign in again. Callers distinguish the two so
// they can say so rather than reporting a generic outage (see
// remote-source.ts's authenticated path).
export class CosmoSessionExpiredError extends CosmoLoginError {}

export type CosmoCredentials = { accessToken: string; refreshToken: string };
export type CosmoLogin = {
  user: { id: number; email: string; nickname: string };
  credentials: CosmoCredentials;
};

// Every string handed to the login-window's AppleScript dialogs (mac path)
// is one of these fixed literals — never raw text from a network response —
// so a hostile/garbled reply can't inject AppleScript. See login-window.ts.
// The proxy relays the auth provider's own status code verbatim, so this
// mapping reads exactly as it did when Pulsar called it directly.
function statusError(status: number, context: 'init' | 'authenticate'): CosmoLoginError {
  if (status === 429) return new CosmoLoginError('Too many attempts — wait a bit and try again.');
  if (context === 'authenticate' && (status === 400 || status === 401 || status === 422)) {
    return new CosmoLoginError('That code is incorrect or expired.');
  }
  if (context === 'init' && (status === 400 || status === 422)) {
    return new CosmoLoginError('That doesn’t look like a valid email address.');
  }
  return new CosmoLoginError('Could not reach Cosmo. Check your connection and try again.');
}

async function proxyPost(path: string, body: unknown): Promise<Response> {
  try {
    return await net.fetch(`${PROXY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // The proxy itself is unreachable (not running, wrong PULSAR_PROXY_URL,
    // no network). Same user-facing message as any other transport failure.
    throw new CosmoLoginError('Could not reach Cosmo. Check your connection and try again.');
  }
}

export async function sendLoginCode(email: string): Promise<void> {
  const response = await proxyPost('/request-otp', { email });
  if (!response.ok) throw statusError(response.status, 'init');
}

// Completes the login: the proxy exchanges the code with the auth provider,
// hands the resulting token to Cosmo's own server-side exchange, and returns
// the Cosmo session it minted. Unlike the pre-2026-09-15 flow, that session is kept —
// login-window.ts writes it into Settings, and remote-source.ts fetches the
// user's own collection with it.
export async function verifyLoginCode(email: string, code: string): Promise<CosmoLogin> {
  const response = await proxyPost('/verify-otp', { email, code });
  if (!response.ok) throw statusError(response.status, 'authenticate');
  return (await response.json()) as CosmoLogin;
}

// Cosmo access tokens are short-lived; the refresh token outlives them and
// buys a fresh pair. A 400/401 means that refresh token is dead too, which
// only signing in again fixes — hence the distinct error type.
export async function refreshCosmoSession(refreshToken: string): Promise<CosmoCredentials> {
  const response = await proxyPost('/refresh', { refreshToken });
  if (response.status === 400 || response.status === 401) {
    throw new CosmoSessionExpiredError('Your Cosmo sign-in expired. Sign in again to keep your collection updating.');
  }
  if (!response.ok) throw new CosmoLoginError('Could not reach Cosmo. Check your connection and try again.');
  const { credentials } = (await response.json()) as { credentials: CosmoCredentials };
  return credentials;
}
