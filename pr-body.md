## Description

Major release combining new features, security hardening, and CI/CD security pipeline. Highlights: **3-factor authentication** (access token + Admin PIN + TOTP), **critical localhost bypass fix**, **ForgeCanvas** artifact system, **Session Recording & Replay**, **Electron Desktop App** scaffold, **Browser Profiles** with file upload and DOM snapshots, **CronScheduler** proactive delivery, and a comprehensive **CI/CD Security Gate** to protect against malicious PRs.

## Type of Change

- [x] Bug fix
- [x] New feature
- [ ] Refactor (no functional changes)
- [x] Documentation
- [ ] Tests
- [x] Security

## Changes Made

### 🔒 Security (Critical)

- **3-Factor Authentication** — Access token (CLI-generated, 5min TTL) + Admin PIN (`FORGEAI_ADMIN_PIN` env var) + TOTP (Google Authenticator). All three required to access the dashboard.
- **Localhost Bypass Fix** — Replaced `request.ip` (forged via `X-Forwarded-For`) with `request.socket.remoteAddress` (raw TCP, unforgeable). Set `trustProxy: false`.
- **Gateway/MySQL bind 127.0.0.1** — Services only accessible via localhost or SSH tunnel by default.
- **SSH Tunnel Helper** — `scripts/forge-tunnel.ps1` for secure remote dashboard access.
- **CI/CD Security Gate** — 6-job pipeline: CodeQL, Gitleaks, backdoor pattern scanner, dependency audit, lockfile integrity, file safety checks.
- **Gitleaks Config** — `.gitleaks.toml` with false positive reduction.
- **PR Security Checklist** — Updated PR template with security-specific checklist.

### ✨ Features

- **ForgeCanvas** — Agent-driven visual artifact system (HTML, React, SVG, Mermaid, Charts, Markdown, Code) with sandboxed iframe rendering, 8 API endpoints, real-time WebSocket updates.
- **Session Recording & Replay** — Record and replay agent sessions with full tool call history.
- **Browser Profiles** — Puppeteer browser with file upload, DOM snapshots, anti-bot stealth.
- **Electron Desktop App** — `packages/desktop` scaffold with system tray, global hotkeys, auto-update.
- **CronScheduler Proactive Delivery** — Cron tasks now deliver results to user's active channel (Telegram/WhatsApp).
- **Docker --migrate flag** — Auto table creation on container start.

### 🐛 Fixes

- Docker bridge IP detection for localhost-only auth endpoints.
- System Chrome fallback for Puppeteer browser tool.
- Canvas page layout padding consistency.
- Dockerfile include desktop package + Chat/Recordings lint fixes.

## How to Test

1. `pnpm install && pnpm -r build` — all packages build
2. `pnpm forge start --migrate` — start gateway
3. **Auth flow**: `curl -X POST http://127.0.0.1:18800/api/auth/generate-access` → open URL → scan QR → enter TOTP + PIN
4. **Exploit blocked**: `curl -X POST http://<VPS_IP>:18800/api/auth/generate-access -H "X-Forwarded-For: 127.0.0.1"` → returns 403
5. **Canvas**: Dashboard → Canvas → New Artifact → test all 7 types
6. **Recordings**: Dashboard → Recordings → view session recordings
7. **Security Gate**: Open a PR to main → verify all 6 security jobs pass

## Checklist

- [x] Code builds without errors (`pnpm -r build`)
- [x] Tests pass (`pnpm test`)
- [x] Commit messages follow Conventional Commits
- [x] No secrets or API keys committed
- [x] Documentation updated (if needed)

## Security Checklist

- [x] No `eval()` or `new Function()` usage
- [x] No hardcoded credentials, IPs, or tokens
- [x] No new `child_process` usage outside approved tool files
- [x] No obfuscated or minified code committed to source
- [x] Dependencies added are well-known and actively maintained
- [x] `pnpm-lock.yaml` changes correspond to `package.json` changes
- [x] No `.env` files or secrets in the PR

---

### Files Changed (43 files, +6216 lines)

| Area | Files | Summary |
|:-----|:------|:--------|
| **Security** | `server.ts`, `access-token.ts`, `security.ts` | 3-factor auth, localhost bypass fix, access token system |
| **CI/CD** | `security.yml`, `.gitleaks.toml`, `PR_TEMPLATE.md` | 6-job security gate pipeline |
| **Canvas** | `artifact-manager.ts`, `ArtifactRenderer.tsx`, `Canvas.tsx`, `artifact.ts` | Full artifact system |
| **Recording** | `session-recorder.ts`, `Recordings.tsx`, `recording.ts` | Session recording & replay |
| **Desktop** | `packages/desktop/*` (6 files) | Electron app scaffold |
| **Browser** | `puppeteer-browser.ts` | Profiles, file upload, DOM snapshots |
| **Infra** | `docker-compose.yml`, `Dockerfile`, `forge-tunnel.ps1` | Docker fixes, SSH tunnel |
| **Core** | `chat-routes.ts`, `cron-scheduler.ts`, `registry.ts` | Proactive delivery, tool wiring |
