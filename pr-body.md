## Description

New `app_register` tool: internal tool for the agent to register and start dynamic apps without relying on HTTP API authentication. Replaces the fragile `curl POST /api/apps/register` pattern.

## Type of Change

- [x] Bug fix
- [x] New feature
- [ ] Refactor (no functional changes)
- [ ] Documentation
- [ ] Tests
- [ ] Security

## Changes Made

### New: `app_register` tool
- **`packages/tools/src/tools/app-register.ts`** — New tool that directly manipulates `appRegistry` + `AppManager`, bypassing HTTP auth
- **Managed mode** (preferred): Provide `name`, `port`, `cwd`, `command`, `args` → AppManager spawns process with auto-restart + health checks
- **Unmanaged mode**: Provide `name`, `port` → registers for proxy routing only
- Validates app name, port range, reserved ports (18800/3306)
- Persists registry to vault
- Returns the public URL for the app

### Wiring & Integration
- **`packages/tools/src/index.ts`** — Exported and registered `AppRegisterTool` (21 tools total)
- **`packages/core/src/gateway/chat-routes.ts`** — `setAppRegisterRefs()` wired with appRegistry, appManager, vault, publicUrl, getSiteUrl
- **`packages/agent/src/runtime.ts`** — System prompt updated to instruct agent to use `app_register` tool instead of curl; added APP LIFECYCLE section

### Test Update
- **`tests/api.test.ts`** — Expected tool count updated from 20 → 21

## How to Test

1. `pnpm -r build`
2. `pnpm forge start --migrate`
3. `pnpm test` — expect 21 tools registered
4. Ask the agent to create a web app (e.g. "create a portfolio site with Express") → verify it uses `app_register` instead of `curl`
5. Verify the app URL works and the app appears in `/api/apps/managed`

## Related Issue

Fixes: Agent fails to register apps because `curl POST /api/apps/register` is blocked by gateway authentication middleware.

## Screenshots

N/A

## Checklist

- [x] Code builds without errors (`pnpm -r build`)
- [x] Tests pass (`pnpm test`)
- [x] Commit messages follow Conventional Commits
- [x] No secrets or API keys committed
- [x] Documentation updated (if needed)
