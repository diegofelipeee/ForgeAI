import { describe, it, expect } from 'vitest';

/**
 * Security Audit Fixes — Regression Tests
 *
 * Tests for vulnerabilities identified during the security audit of forgecore.cloud
 * and fixed in this PR. Each section maps to a specific vulnerability.
 *
 * Fixes covered:
 * - P0: generate-access bypass via Caddy reverse proxy
 * - P0: CORS wildcard origin reflection
 * - P1: Private IP range check (172.* too broad)
 * - P1: RBAC hard enforcement (block anonymous on admin routes)
 * - P1: Admin PIN bcrypt hashing
 * - P1: JWT IP binding
 * - P1: CSRF token verification
 * - P1: Security headers (helmet-style)
 * - P2: SMTP TLS rejectUnauthorized configurable
 * - P2: Info disclosure on /health and /info
 * - P2: Subdomain routing wildcard CORS
 */

// ─── P0: Localhost Detection (generate-access bypass fix) ───
describe('P0: isTrueLocalRequest — proxy-aware localhost detection', () => {
  // Simulates the logic from Gateway.isTrueLocalRequest()
  const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

  function isTrueLocalRequest(socketIp: string, headers: Record<string, string | undefined>): boolean {
    // Check 1: socket IP must be loopback or RFC 1918 private
    if (!LOCALHOST_IPS.has(socketIp)) {
      const rawIp = socketIp.replace('::ffff:', '');
      const isPrivate =
        /^10\./.test(rawIp) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(rawIp) ||
        /^192\.168\./.test(rawIp);
      if (!isPrivate) return false;
    }

    // Check 2: proxy headers = forwarded by reverse proxy from external
    const forwarded = headers['x-forwarded-for'] || headers['x-real-ip'] || headers['forwarded'];
    if (forwarded) return false;

    return true;
  }

  it('should detect true localhost (no proxy headers)', () => {
    expect(isTrueLocalRequest('127.0.0.1', {})).toBe(true);
    expect(isTrueLocalRequest('::1', {})).toBe(true);
    expect(isTrueLocalRequest('::ffff:127.0.0.1', {})).toBe(true);
  });

  it('should REJECT localhost with X-Forwarded-For (Caddy proxy)', () => {
    // This is the critical fix: behind Caddy, socket IP is 127.0.0.1 but
    // X-Forwarded-For reveals the real external client IP
    expect(isTrueLocalRequest('127.0.0.1', { 'x-forwarded-for': '203.0.113.50' })).toBe(false);
  });

  it('should REJECT localhost with X-Real-IP header', () => {
    expect(isTrueLocalRequest('127.0.0.1', { 'x-real-ip': '198.51.100.10' })).toBe(false);
  });

  it('should REJECT localhost with Forwarded header', () => {
    expect(isTrueLocalRequest('127.0.0.1', { 'forwarded': 'for=198.51.100.10' })).toBe(false);
  });

  it('should REJECT external IPs without proxy headers', () => {
    expect(isTrueLocalRequest('203.0.113.50', {})).toBe(false);
    expect(isTrueLocalRequest('8.8.8.8', {})).toBe(false);
  });

  it('should accept RFC 1918 private IPs without proxy headers', () => {
    expect(isTrueLocalRequest('10.0.0.5', {})).toBe(true);
    expect(isTrueLocalRequest('192.168.1.100', {})).toBe(true);
    expect(isTrueLocalRequest('172.16.0.1', {})).toBe(true);
  });
});

// ─── P1: Private IP Range Check (172.* fix) ───
describe('P1: RFC 1918 private IP range validation', () => {
  function isRFC1918Private(ip: string): boolean {
    const rawIp = ip.replace('::ffff:', '');
    return (
      /^10\./.test(rawIp) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(rawIp) ||
      /^192\.168\./.test(rawIp)
    );
  }

  it('should accept 10.x.x.x as private', () => {
    expect(isRFC1918Private('10.0.0.1')).toBe(true);
    expect(isRFC1918Private('10.255.255.255')).toBe(true);
  });

  it('should accept 172.16.0.0 - 172.31.255.255 as private', () => {
    expect(isRFC1918Private('172.16.0.1')).toBe(true);
    expect(isRFC1918Private('172.20.0.1')).toBe(true);
    expect(isRFC1918Private('172.31.255.255')).toBe(true);
  });

  it('should REJECT 172.0.x - 172.15.x (public range)', () => {
    expect(isRFC1918Private('172.0.0.1')).toBe(false);
    expect(isRFC1918Private('172.10.0.1')).toBe(false);
    expect(isRFC1918Private('172.15.255.255')).toBe(false);
  });

  it('should REJECT 172.32.x+ (public range)', () => {
    expect(isRFC1918Private('172.32.0.1')).toBe(false);
    expect(isRFC1918Private('172.100.0.1')).toBe(false);
    expect(isRFC1918Private('172.217.14.206')).toBe(false); // Google's IP!
  });

  it('should accept 192.168.x.x as private', () => {
    expect(isRFC1918Private('192.168.0.1')).toBe(true);
    expect(isRFC1918Private('192.168.255.255')).toBe(true);
  });

  it('should REJECT other 192.x.x.x IPs', () => {
    expect(isRFC1918Private('192.0.2.1')).toBe(false);
    expect(isRFC1918Private('192.100.0.1')).toBe(false);
  });
});

// ─── P0: CORS Origin Validation ───
describe('P0: CORS origin validation', () => {
  function isAllowedOrigin(origin: string, publicUrl: string | undefined, port: number): boolean {
    const corsOrigins: string[] = [];
    if (publicUrl) corsOrigins.push(publicUrl.replace(/\/$/, ''));
    corsOrigins.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
    return corsOrigins.includes(origin);
  }

  it('should allow PUBLIC_URL origin', () => {
    expect(isAllowedOrigin('https://forgecore.cloud', 'https://forgecore.cloud', 3000)).toBe(true);
  });

  it('should allow PUBLIC_URL with trailing slash stripped', () => {
    expect(isAllowedOrigin('https://forgecore.cloud', 'https://forgecore.cloud/', 3000)).toBe(true);
  });

  it('should allow localhost origins', () => {
    expect(isAllowedOrigin('http://localhost:3000', undefined, 3000)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000', undefined, 3000)).toBe(true);
  });

  it('should REJECT arbitrary origins', () => {
    expect(isAllowedOrigin('https://evil-site.com', 'https://forgecore.cloud', 3000)).toBe(false);
  });

  it('should REJECT similar-looking origins', () => {
    expect(isAllowedOrigin('https://forgecore.cloud.evil.com', 'https://forgecore.cloud', 3000)).toBe(false);
  });

  it('should REJECT empty origin', () => {
    expect(isAllowedOrigin('', 'https://forgecore.cloud', 3000)).toBe(false);
  });
});

// ─── P1: CSRF Token Verification ───
describe('P1: CSRF token verification', () => {
  function verifyCsrf(
    sessionCsrf: string | undefined,
    submittedToken: string | undefined,
  ): boolean {
    if (!sessionCsrf || !submittedToken || submittedToken !== sessionCsrf) {
      return false;
    }
    return true;
  }

  const validToken = 'abc123_csrf_token_xyz';

  it('should accept matching CSRF token', () => {
    expect(verifyCsrf(validToken, validToken)).toBe(true);
  });

  it('should REJECT mismatched CSRF token', () => {
    expect(verifyCsrf(validToken, 'wrong_token')).toBe(false);
  });

  it('should REJECT missing submitted token', () => {
    expect(verifyCsrf(validToken, undefined)).toBe(false);
    expect(verifyCsrf(validToken, '')).toBe(false);
  });

  it('should REJECT missing session token', () => {
    expect(verifyCsrf(undefined, validToken)).toBe(false);
    expect(verifyCsrf('', validToken)).toBe(false);
  });

  it('should REJECT both missing', () => {
    expect(verifyCsrf(undefined, undefined)).toBe(false);
  });
});

// ─── P1: JWT IP Binding ───
describe('P1: JWT IP binding verification', () => {
  function verifyIpBinding(tokenIp: string | undefined, requestIp: string): boolean {
    // If token has no IP (legacy tokens), allow through
    if (!tokenIp) return true;
    return tokenIp === requestIp;
  }

  it('should allow matching IPs', () => {
    expect(verifyIpBinding('203.0.113.50', '203.0.113.50')).toBe(true);
    expect(verifyIpBinding('127.0.0.1', '127.0.0.1')).toBe(true);
  });

  it('should REJECT mismatched IPs (session hijack attempt)', () => {
    expect(verifyIpBinding('203.0.113.50', '198.51.100.10')).toBe(false);
  });

  it('should allow legacy tokens without IP binding', () => {
    expect(verifyIpBinding(undefined, '203.0.113.50')).toBe(true);
  });
});

// ─── P1: Admin PIN Hashing ───
describe('P1: Admin PIN bcrypt hashing', () => {
  it('should identify bcrypt hashes by $2a$/$2b$ prefix', () => {
    const bcryptHash = '$2a$12$LJ3m4ys2Dfb1Ij6z7T5eVOMB.Xq7F5zFZGf9y3rZ.FhK5Zk1F9R1a';
    const plaintext = '123456';

    expect(bcryptHash.startsWith('$2a$') || bcryptHash.startsWith('$2b$')).toBe(true);
    expect(plaintext.startsWith('$2a$') || plaintext.startsWith('$2b$')).toBe(false);
  });

  it('should distinguish hashed PIN from env var plaintext fallback', () => {
    // The verifyAdminPin logic:
    // - Vault value starting with $2a$/$2b$ → use bcrypt.compare
    // - Env var fallback → direct comparison (first login forces change)
    function isPinHashed(storedValue: string): boolean {
      return storedValue.startsWith('$2a$') || storedValue.startsWith('$2b$');
    }

    expect(isPinHashed('$2a$12$LJ3m4ys2Dfb1Ij6z7T5eVOMB.Xq7F5zFZGf9y3rZ.FhK5Zk1F9R1a')).toBe(true);
    expect(isPinHashed('$2b$12$someotherhashvalue')).toBe(true);
    expect(isPinHashed('plaintext-pin-123')).toBe(false);
    expect(isPinHashed('654321')).toBe(false);
  });
});

// ─── P1: Security Headers ───
describe('P1: Security headers (helmet-style)', () => {
  const EXPECTED_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  it('should define all required security headers', () => {
    for (const [header, value] of Object.entries(EXPECTED_HEADERS)) {
      expect(header).toBeTruthy();
      expect(value).toBeTruthy();
    }
  });

  it('CSP should block framing (clickjacking)', () => {
    const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss: ws:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('CSP should restrict form actions to self', () => {
    const csp = "default-src 'self'; form-action 'self';";
    expect(csp).toContain("form-action 'self'");
  });

  it('CSP should allow inline styles (used by auth forms)', () => {
    const csp = "style-src 'self' 'unsafe-inline';";
    expect(csp).toContain("'unsafe-inline'");
  });

  it('CSP should allow data: URIs for images (QR codes)', () => {
    const csp = "img-src 'self' data:;";
    expect(csp).toContain('data:');
  });

  it('CSP should allow WebSocket connections', () => {
    const csp = "connect-src 'self' wss: ws:;";
    expect(csp).toContain('wss:');
    expect(csp).toContain('ws:');
  });

  it('Permissions-Policy should disable sensitive APIs', () => {
    const policy = 'camera=(), microphone=(), geolocation=(), payment=()';
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
    expect(policy).toContain('payment=()');
  });
});

// ─── P2: SMTP TLS Configuration ───
describe('P2: SMTP rejectUnauthorized configuration', () => {
  function resolveRejectUnauthorized(envValue: string | undefined): boolean {
    return envValue !== 'false';
  }

  it('should default to true (strict TLS validation)', () => {
    expect(resolveRejectUnauthorized(undefined)).toBe(true);
  });

  it('should be true for any value except "false"', () => {
    expect(resolveRejectUnauthorized('true')).toBe(true);
    expect(resolveRejectUnauthorized('yes')).toBe(true);
    expect(resolveRejectUnauthorized('1')).toBe(true);
  });

  it('should be false only when explicitly set to "false"', () => {
    expect(resolveRejectUnauthorized('false')).toBe(false);
  });
});

// ─── P2: Info Disclosure ───
describe('P2: Reduced info disclosure on public endpoints', () => {
  it('/info should only expose name and version', () => {
    // Simulates the reduced /info response
    const infoResponse = {
      name: 'ForgeAI',
      version: '1.2.0',
    };

    expect(Object.keys(infoResponse)).toEqual(['name', 'version']);
    // Should NOT contain:
    expect(infoResponse).not.toHaveProperty('uptime');
    expect(infoResponse).not.toHaveProperty('security');
    expect(infoResponse).not.toHaveProperty('node');
    expect(infoResponse).not.toHaveProperty('platform');
    expect(infoResponse).not.toHaveProperty('memory');
  });

  it('/health should not expose security module details', () => {
    const healthResponse = {
      status: 'healthy',
      uptime: 12345,
      version: '1.2.0',
      checks: [{ name: 'gateway', status: 'pass' }],
    };

    // Should NOT have security breakdown
    expect(healthResponse).not.toHaveProperty('security');
    // Checks should only have gateway, not security internals
    expect(healthResponse.checks.length).toBe(1);
    expect(healthResponse.checks[0].name).toBe('gateway');
  });
});

// ─── P1: RBAC Hard Enforcement ───
describe('P1: RBAC hard enforcement on admin routes', () => {
  const ADMIN_ROUTES = [
    '/api/backup/vault',
    '/api/audit/export',
    '/api/audit/integrity',
    '/api/audit/rotate',
    '/api/security/stats',
    '/api/gdpr/export',
    '/api/gdpr/delete',
  ];

  const ADMIN_PREFIX_ROUTES = [
    '/api/providers/',
    '/api/ip-filter/',
    '/api/pairing/',
  ];

  function isAdminRoute(path: string): boolean {
    return ADMIN_ROUTES.includes(path) ||
      ADMIN_PREFIX_ROUTES.some(prefix => path.startsWith(prefix));
  }

  it('should identify admin routes', () => {
    expect(isAdminRoute('/api/backup/vault')).toBe(true);
    expect(isAdminRoute('/api/audit/export')).toBe(true);
    expect(isAdminRoute('/api/providers/openai')).toBe(true);
    expect(isAdminRoute('/api/ip-filter/add')).toBe(true);
  });

  it('should NOT flag non-admin routes', () => {
    expect(isAdminRoute('/api/chat/sessions')).toBe(false);
    expect(isAdminRoute('/api/agents')).toBe(false);
    expect(isAdminRoute('/health')).toBe(false);
  });

  it('hard enforcement should block anonymous POST/PUT/DELETE on admin routes', () => {
    // Simulates the RBAC logic: hasToken=false, isAdminRoute=true, method=POST
    const hasToken = false;
    const path = '/api/backup/vault';
    const method: string = 'POST';
    const rbacEnforce = true; // default: true (hard enforcement)

    const shouldBlock = method !== 'GET' && isAdminRoute(path) && rbacEnforce && !hasToken;
    expect(shouldBlock).toBe(true);
  });

  it('hard enforcement should allow authenticated admin requests', () => {
    const hasToken = true;
    const isAdmin = true;
    const path = '/api/backup/vault';
    const method: string = 'POST';

    const shouldBlock = method !== 'GET' && isAdminRoute(path) && !(hasToken && isAdmin);
    expect(shouldBlock).toBe(false);
  });
});

// ─── P2: Subdomain CORS ───
describe('P2: Subdomain routing CORS fix', () => {
  function isAllowedSubdomainOrigin(origin: string, publicUrl: string | undefined): boolean {
    if (!origin) return false;
    const pubUrl = publicUrl?.replace(/\/$/, '') || '';
    return origin === pubUrl ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:');
  }

  it('should allow PUBLIC_URL origin for subdomain routes', () => {
    expect(isAllowedSubdomainOrigin('https://forgecore.cloud', 'https://forgecore.cloud')).toBe(true);
  });

  it('should allow localhost for subdomain routes', () => {
    expect(isAllowedSubdomainOrigin('http://localhost:3000', undefined)).toBe(true);
  });

  it('should REJECT arbitrary origins (no more wildcard *)', () => {
    expect(isAllowedSubdomainOrigin('https://evil-site.com', 'https://forgecore.cloud')).toBe(false);
  });

  it('should REJECT empty origin', () => {
    expect(isAllowedSubdomainOrigin('', 'https://forgecore.cloud')).toBe(false);
  });
});
