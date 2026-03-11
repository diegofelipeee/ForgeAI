## Description

**Security Audit: 11 critical/high/medium vulnerabilities fixed on forgecore.cloud gateway**

Full security audit of the ForgeAI gateway layer, identifying and systematically fixing 11 vulnerabilities across authentication, authorization, session management, CORS, and HTTP security headers. Includes 48 regression tests covering every fix.

## Type of Change

- [x] Bug fix (11 security vulnerabilities patched)
- [ ] New feature
- [ ] Refactor
- [x] Tests (48 new regression tests)
- [x] Security

## Vulnerabilities Fixed

| Priority | Vulnerability | Risk | Fix |
|:---------|:-------------|:-----|:----|
| **P0** | `generate-access` bypass via Caddy reverse proxy | **Critical** — External users could generate admin tokens because `socket.remoteAddress` is always `127.0.0.1` behind Caddy | Check `X-Forwarded-For`/`X-Real-IP` headers to detect proxied external requests |
| **P0** | CORS `origin: true` reflects any origin | **Critical** — Any website could make authenticated cross-origin requests with cookies | Restrict to `PUBLIC_URL` + `localhost` origins only |
| **P1** | RBAC soft enforcement (anonymous allowed) | **High** — Admin routes accessible without authentication | Hard enforcement by default (`RBAC_ENFORCE=false` for backward compat) |
| **P1** | Private IP range `172.*` too broad | **High** — Public IPs like `172.217.14.206` (Google) treated as private/trusted | Fixed to RFC 1918 range `172.16.0.0/12` only |
| **P1** | Admin PIN stored/compared as plaintext | **High** — PIN visible in Vault storage, no brute-force resistance | bcrypt hash via `JWTAuth.hashPassword`/`verifyPassword`; env var fallback for first login |
| **P1** | JWT sessions not bound to IP | **High** — Stolen JWT usable from any IP | `ipAddress` embedded in JWT payload; middleware rejects IP mismatches |
| **P1** | No CSRF protection on auth forms | **High** — TOTP, email OTP, PIN change, 2FA setup forms vulnerable to CSRF | Per-session CSRF tokens in hidden fields; verified on all POST handlers |
| **P1** | No security headers | **Medium** — Missing CSP, HSTS, X-Frame-Options, Permissions-Policy | Fastify `onSend` hook adds all helmet-style headers |
| **P2** | SMTP `rejectUnauthorized: false` hardcoded | **Medium** — TLS cert validation disabled for all SMTP connections | Configurable via `SMTP_TLS_REJECT_UNAUTHORIZED` env var; defaults to `true` |
| **P2** | `/health` and `/info` leak internal details | **Medium** — Exposes security module list, vault status, uptime, Node version | Stripped to `name` + `version` only; detailed info behind auth on `/api/health/detailed` |
| **P2** | `Access-Control-Allow-Origin: *` in subdomain routing | **Medium** — Subdomain proxy and static files served with wildcard CORS | Origin-validated CORS matching `PUBLIC_URL` + localhost |

## Files Changed

### Modified
- **`packages/core/src/gateway/server.ts`** — 9 fixes: localhost detection, CORS, RBAC enforcement, IP range, PIN hashing, JWT IP binding, CSRF protection, security headers, info disclosure, subdomain CORS
- **`packages/security/src/jwt-auth.ts`** — Export `JWTPayload` interface; add optional `ipAddress` field
- **`packages/security/src/email-otp.ts`** — Configurable `rejectUnauthorized` in `SMTPConfig` + `SMTP_TLS_REJECT_UNAUTHORIZED` env var
- **`packages/shared/src/types/security.ts`** — New `AuditAction` types: `auth.ip_mismatch`, `auth.csrf_failed`

### New
- **`tests/security-audit-fixes.test.ts`** — 48 regression tests covering all 11 fixes

## How to Test

```bash
# Build all packages (zero errors)
pnpm -r run build

# Run security audit regression tests (48/48 pass)
npx vitest run tests/security-audit-fixes.test.ts

# Run all tests
npx vitest run
```

## Environment Variables (new)

| Variable | Default | Description |
|:---------|:--------|:------------|
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | Set to `false` for self-signed SMTP certs |
| `RBAC_ENFORCE` | `true` | Set to `false` to restore soft RBAC (not recommended) |

## Checklist

- [x] Code builds without errors (`pnpm -r run build` — shared, security, core, agent, tools all pass)
- [x] Commit messages follow Conventional Commits
- [x] No secrets or API keys committed
- [x] Backward compatible (env var fallbacks for PIN, RBAC, legacy JWT tokens without IP)
- [x] 48 new regression tests pass
- [x] No breaking changes to API contracts
