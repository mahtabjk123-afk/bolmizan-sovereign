import crypto from 'node:crypto';
import type { SovereignSystemState } from '../src/types/sovereign.ts';

export const TENANT_SESSION_COOKIE = 'bolmizan_tenant_session';
export const TENANT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface TenantSessionClaims {
  tenantId: string;
  issuedAt: number;
  expiresAt: number;
}

export function parseTrustedProxyHops(value: string | undefined): number | false {
  if (value === undefined || value.trim() === '') return false;
  if (!/^\d+$/.test(value.trim())) return false;
  const hops = Number(value);
  return Number.isSafeInteger(hops) ? hops : false;
}

export function constantTimeBufferEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function isSovereignMutationDisabledInProduction(
  method: string,
  routePath: string,
  production: boolean,
): boolean {
  if (!production || method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD') return false;
  void routePath;
  return true;
}

export function sanitizeSovereignStateForProduction(state: SovereignSystemState): SovereignSystemState {
  return {
    ...state,
    deals: [],
    mukasaEdges: [],
    lastMukasaReport: null,
    maalGuard: [],
    wages: [],
    recentIntentSeals: [],
    totals: {
      activeDealsPkr: 0,
      sadaqahReservePkr: 0,
      wagesPaidPkr: 0,
      mukasaClearedTotalPkr: 0,
      goldEquivalentGrams: 0,
    },
  };
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signature(payload: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

export function validateSessionSecret(secret: string | undefined, production: boolean): string {
  const normalized = secret?.trim();
  if (!normalized || normalized === 'replace_with_64_char_random_hex_secret') {
    if (production) throw new Error('Production requires AUTH_SESSION_SECRET with at least 32 characters.');
    return 'local-development-only-session-secret-not-for-production';
  }
  if (production && normalized.length < 32) {
    throw new Error('Production AUTH_SESSION_SECRET must contain at least 32 characters.');
  }
  return normalized;
}

export function createTenantSessionToken(tenantId: string, secret: string, now = Date.now()): string {
  const claims: TenantSessionClaims = {
    tenantId,
    issuedAt: Math.floor(now / 1000),
    expiresAt: Math.floor(now / 1000) + TENANT_SESSION_TTL_SECONDS,
  };
  const payload = encode(JSON.stringify(claims));
  const signedContent = `v1.${payload}`;
  return `${signedContent}.${signature(signedContent, secret).toString('base64url')}`;
}

export function verifyTenantSessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): TenantSessionClaims | null {
  if (token.length > 2048) return null;
  const [version, payload, suppliedSignature, extra] = token.split('.');
  if (
    version !== 'v1' ||
    !payload ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !suppliedSignature ||
    !/^[A-Za-z0-9_-]+$/.test(suppliedSignature) ||
    extra !== undefined
  ) return null;

  const signedContent = `${version}.${payload}`;
  const expectedSignature = signature(signedContent, secret);
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (!constantTimeBufferEqual(actualSignature, expectedSignature)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<TenantSessionClaims>;
    const nowSeconds = Math.floor(now / 1000);
    if (
      typeof claims.tenantId !== 'string' ||
      !/^tn_[a-f0-9]{32}$/.test(claims.tenantId) ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      (claims.issuedAt as number) > nowSeconds + 60 ||
      (claims.expiresAt as number) <= nowSeconds ||
      (claims.expiresAt as number) - (claims.issuedAt as number) > TENANT_SESSION_TTL_SECONDS
    ) {
      return null;
    }
    return claims as TenantSessionClaims;
  } catch {
    return null;
  }
}

export function serializeTenantSessionCookie(token: string, production: boolean): string {
  const attributes = [
    `${TENANT_SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${TENANT_SESSION_TTL_SECONDS}`,
  ];
  if (production) attributes.push('Secure');
  return attributes.join('; ');
}

export function serializeClearedTenantSessionCookie(production: boolean): string {
  const attributes = [`${TENANT_SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (production) attributes.push('Secure');
  return attributes.join('; ');
}

export function readTenantSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...parts] = cookie.trim().split('=');
    if (name === TENANT_SESSION_COOKIE) return parts.join('=') || null;
  }
  return null;
}

export function isSameOriginRequest(
  origin: string | undefined,
  host: string | undefined,
  production = false,
): boolean {
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const secure = originUrl.protocol === 'https:';
    const localDevelopment = !production && originUrl.protocol === 'http:' &&
      (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1');
    return originUrl.host.toLowerCase() === host.toLowerCase() && (secure || localDevelopment);
  } catch {
    return false;
  }
}
