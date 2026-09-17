#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && !(match[1] in process.env)) {
      process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} (env var or server/.env).`);
    process.exit(1);
  }
  return value;
}

const PORT = Number(process.env['PORT'] ?? 8788);
const AUTH_APP_ID = requireEnv('AUTH_APP_ID');
const AUTH_CLIENT_ID = requireEnv('AUTH_CLIENT_ID');
const AUTH_CA_ID = requireEnv('AUTH_CA_ID');
const APP_SECRET = requireEnv('APP_SECRET');
const PLATFORM_API_URL = requireEnv('PLATFORM_API_URL');
const AUTH_PROVIDER_ENDPOINT = requireEnv('AUTH_PROVIDER_ENDPOINT');
const ENCRYPTED_HEADER_NAME = requireEnv('ENCRYPTED_HEADER_NAME');
const LOGIN_EXCHANGE_PATH = requireEnv('LOGIN_EXCHANGE_PATH');
const REFRESH_PATH = requireEnv('REFRESH_PATH');

const AUTH_PROVIDER_HEADERS_TEMPLATE = JSON.parse(requireEnv('AUTH_PROVIDER_HEADERS_JSON')) as Record<string, string>;
const PLATFORM_CLIENT_HEADERS = JSON.parse(requireEnv('PLATFORM_CLIENT_HEADERS_JSON')) as Record<string, string>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_RE = /^\d{6}$/;

function authProviderHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(AUTH_PROVIDER_HEADERS_TEMPLATE)) {
    headers[key] = value.replace('$APP_ID', AUTH_APP_ID).replace('$CLIENT_ID', AUTH_CLIENT_ID).replace('$CA_ID', AUTH_CA_ID);
  }
  return headers;
}

function cipherAlgorithm(key: Buffer): string {
  const algorithm = { 16: 'aes-128-cbc', 24: 'aes-192-cbc', 32: 'aes-256-cbc' }[key.length];
  if (!algorithm) throw new Error(`APP_SECRET decodes to ${key.length} bytes; expected 16, 24, or 32.`);
  return algorithm;
}

export function encryptBody(plaintext: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(16);
  const cipher = createCipheriv(cipherAlgorithm(key), key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ciphertext]).toString('base64');
}

export function decryptBody(payloadB64: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const wire = Buffer.from(payloadB64, 'base64');
  const decipher = createDecipheriv(cipherAlgorithm(key), key, wire.subarray(0, 16));
  return Buffer.concat([decipher.update(wire.subarray(16)), decipher.final()]).toString('utf8');
}

class ProxyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function platformEncryptedPost<T>(pathName: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    ...PLATFORM_CLIENT_HEADERS,
    'x-client-trace-id': randomUUID(),
    'Content-Type': 'text/plain',
    [ENCRYPTED_HEADER_NAME]: '1',
  };
  const res = await fetch(`${PLATFORM_API_URL}${pathName}`, {
    method: 'POST',
    headers,
    body: encryptBody(JSON.stringify(body), APP_SECRET),
  });
  let text = await res.text();
  if (res.headers.has(ENCRYPTED_HEADER_NAME) && text) text = decryptBody(text, APP_SECRET);
  if (!res.ok) throw new ProxyError(res.status, `upstream ${pathName} failed`);
  return JSON.parse(text) as T;
}

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= max;
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ProxyError(400, 'Invalid JSON body');
  }
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === 'string' ? value : '';
}

type PlatformUser = { id: number; email: string; nickname: string };
type PlatformCredentials = { accessToken: string; refreshToken: string };

async function handleRequestOtp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkRateLimit(`otp:${clientIp(req)}`, 5, 10 * 60 * 1000)) return sendJson(res, 429, { ok: false });

  const email = stringField(await readJsonBody(req), 'email');
  if (!EMAIL_RE.test(email)) return sendJson(res, 400, { ok: false });

  const authRes = await fetch(`${AUTH_PROVIDER_ENDPOINT}/passwordless/init`, {
    method: 'POST',
    headers: authProviderHeaders(),
    body: JSON.stringify({ email }),
  });
  await authRes.text();
  sendJson(res, authRes.status, { ok: authRes.ok });
}

async function handleVerifyOtp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkRateLimit(`verify:${clientIp(req)}`, 10, 10 * 60 * 1000)) return sendJson(res, 429, { ok: false });

  const body = await readJsonBody(req);
  const email = stringField(body, 'email');
  const code = stringField(body, 'code');
  if (!EMAIL_RE.test(email) || !CODE_RE.test(code)) return sendJson(res, 400, { ok: false });

  const authRes = await fetch(`${AUTH_PROVIDER_ENDPOINT}/passwordless/authenticate`, {
    method: 'POST',
    headers: authProviderHeaders(),
    body: JSON.stringify({ email, code, mode: 'login-or-sign-up' }),
  });
  const authText = await authRes.text();
  if (!authRes.ok) return sendJson(res, authRes.status, { ok: false });

  const { token: authSessionToken } = JSON.parse(authText) as { token: string };

  const { user, credentials } = await platformEncryptedPost<{ user: PlatformUser; credentials: PlatformCredentials }>(
    LOGIN_EXCHANGE_PATH,
    { token: authSessionToken },
  );

  sendJson(res, 200, {
    user: { id: user.id, email: user.email, nickname: user.nickname },
    credentials,
  });
}

async function handleRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkRateLimit(`refresh:${clientIp(req)}`, 20, 10 * 60 * 1000)) return sendJson(res, 429, { ok: false });

  const refreshToken = stringField(await readJsonBody(req), 'refreshToken');
  if (!refreshToken) return sendJson(res, 400, { ok: false });

  const { credentials } = await platformEncryptedPost<{ credentials: PlatformCredentials }>(REFRESH_PATH, { refreshToken });
  sendJson(res, 200, { credentials });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  console.log(`${req.method} ${url.pathname}`);

  try {
    if (req.method === 'POST' && url.pathname === '/request-otp') return await handleRequestOtp(req, res);
    if (req.method === 'POST' && url.pathname === '/verify-otp') return await handleVerifyOtp(req, res);
    if (req.method === 'POST' && url.pathname === '/refresh') return await handleRefresh(req, res);
    sendJson(res, 404, { ok: false });
  } catch (error) {
    if (error instanceof ProxyError) {
      console.error(`Upstream failed (${error.status}): ${error.message}`);
      return sendJson(res, error.status, { ok: false });
    }
    const cause = error instanceof Error && error.cause instanceof Error ? ` — ${error.cause.message}` : '';
    console.error('Request failed:', `${error instanceof Error ? error.message : String(error)}${cause}`);
    sendJson(res, 500, { ok: false });
  }
});

server.listen(PORT, () => {
  console.log(`Proxy listening on :${PORT} — upstream ${PLATFORM_API_URL}`);
});
