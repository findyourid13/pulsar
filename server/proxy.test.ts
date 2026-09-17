import { request as httpRequest } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// requireEnv() calls process.exit(1) on a missing var, and the whole module
// binds PORT/listen() at import time — both have to be satisfied before the
// dynamic import below, and PORT=0 lets the OS pick a free port instead of
// risking a clash with a real proxy instance running locally on 8788.
process.env['AUTH_APP_ID'] = 'test-app-id';
process.env['AUTH_CLIENT_ID'] = 'test-client-id';
process.env['AUTH_CA_ID'] = 'test-ca-id';
process.env['APP_SECRET'] = Buffer.alloc(32, 7).toString('base64');
process.env['PLATFORM_API_URL'] = 'https://example.invalid';
process.env['AUTH_PROVIDER_ENDPOINT'] = 'https://auth.example.invalid';
process.env['ENCRYPTED_HEADER_NAME'] = 'x-test-encrypted';
process.env['LOGIN_EXCHANGE_PATH'] = '/test/login';
process.env['REFRESH_PATH'] = '/test/refresh';
process.env['AUTH_PROVIDER_HEADERS_JSON'] = JSON.stringify({
  'app-id': '$APP_ID',
  'client-id': '$CLIENT_ID',
  'ca-id': '$CA_ID',
});
process.env['PLATFORM_CLIENT_HEADERS_JSON'] = JSON.stringify({ 'User-Agent': 'test-client' });
process.env['PORT'] = '0';

const { EMAIL_RE, CODE_RE, encryptBody, decryptBody, checkRateLimit, server } = await import('./proxy');

const KEY = process.env['APP_SECRET']!;

describe('encryptBody / decryptBody', () => {
  it('round-trips a JSON payload', () => {
    const plaintext = JSON.stringify({ token: 'abc123' });
    expect(decryptBody(encryptBody(plaintext, KEY), KEY)).toBe(plaintext);
  });

  it('produces a different ciphertext each call (random IV) for the same plaintext', () => {
    const plaintext = 'same input';
    expect(encryptBody(plaintext, KEY)).not.toBe(encryptBody(plaintext, KEY));
  });

  it('rejects a key that is not 16/24/32 bytes once decoded', () => {
    const badKey = Buffer.alloc(10).toString('base64');
    expect(() => encryptBody('x', badKey)).toThrow(/expected 16, 24, or 32/);
  });

  it('fails closed on a tampered ciphertext rather than silently returning garbage as valid JSON', () => {
    const wire = Buffer.from(encryptBody('{"token":"abc123"}', KEY), 'base64');
    wire[wire.length - 1] = (wire[wire.length - 1]! ^ 0xff) & 0xff; // flip the last ciphertext byte
    expect(() => decryptBody(wire.toString('base64'), KEY)).toThrow();
  });
});

describe('EMAIL_RE / CODE_RE', () => {
  it.each(['a@b.com', 'first.last+tag@sub.example.co'])('accepts a plausible email: %s', (email) => {
    expect(EMAIL_RE.test(email)).toBe(true);
  });

  it.each(['not-an-email', 'missing-domain@', '@missing-local.com', ''])('rejects %s', (email) => {
    expect(EMAIL_RE.test(email)).toBe(false);
  });

  it('accepts exactly 6 digits', () => {
    expect(CODE_RE.test('123456')).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', ''])('rejects %s', (code) => {
    expect(CODE_RE.test(code)).toBe(false);
  });
});

describe('checkRateLimit', () => {
  it('allows up to `max` calls inside the window, then rejects the next one', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 10_000)).toBe(true);
    expect(checkRateLimit(key, 3, 10_000)).toBe(false);
  });

  it('tracks distinct keys independently', () => {
    expect(checkRateLimit('key-a', 1, 10_000)).toBe(true);
    expect(checkRateLimit('key-b', 1, 10_000)).toBe(true);
  });
});

// A plain node:http client for hitting the test server, deliberately not
// the global `fetch` — tests below stub global fetch to intercept the
// server's own outbound calls, and using fetch for both ends of the same
// process would make the client requests intercept themselves.
function post(port: number, path: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

describe('HTTP server', () => {
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      if (server.listening) return resolve();
      server.once('listening', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('expected a bound TCP port');
    port = address.port;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    server.close();
  });

  it('returns 404 for an unknown route', async () => {
    const res = await post(port, '/nope', '');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid email on /request-otp without ever calling upstream', async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal('fetch', upstreamFetch);
    const res = await post(port, '/request-otp', JSON.stringify({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('relays the auth provider\'s status verbatim on /request-otp for a valid email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    const res = await post(port, '/request-otp', JSON.stringify({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('returns 400 for malformed JSON instead of crashing the server', async () => {
    const res = await post(port, '/refresh', 'not json');
    expect(res.status).toBe(400);
  });
});
