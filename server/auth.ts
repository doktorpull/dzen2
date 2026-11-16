import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'dzen_admin_session';
const DEFAULT_SECRET = crypto.createHash('sha256').update(process.cwd() + ':dzen-studio').digest('hex');

function getSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

export function getAdminCredentials(): { username: string; password: string; usingDefaults: boolean } {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'dzen2026';
  const usingDefaults = !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD;
  return { username, password, usingDefaults };
}

function signPayload(payloadB64: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

export function createSessionToken(username: string): string {
  const payload = {
    sub: username,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined): { valid: boolean; username?: string } {
  if (!token || !token.includes('.')) {
    return { valid: false };
  }
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return { valid: false };
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub: string;
      exp: number;
    };
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false };
    }
    return { valid: true, username: payload.sub };
  } catch {
    return { valid: false };
  }
}

function isHttpsRequest(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim() === 'https';
  }
  return Boolean(req.secure);
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const https = isHttpsRequest(req);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    sameSite: https ? 'none' : 'lax',
    secure: https,
  });
}

export function getSessionFromRequest(req: Request): { authenticated: boolean; username?: string } {
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;
  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;

  const token = bearerToken || queryToken || cookieToken;
  const result = verifySessionToken(token);
  if (!result.valid) {
    return { authenticated: false };
  }
  return { authenticated: true, username: result.username };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = getSessionFromRequest(req);
  if (!session.authenticated) {
    res.status(401).json({ error: 'Требуется авторизация администратора.' });
    return;
  }
  next();
}
