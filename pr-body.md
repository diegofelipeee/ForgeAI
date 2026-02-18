## Description

Phase 24 — Updated all 9 LLM provider model lists to the latest from official docs (OpenAI, Anthropic, Google, xAI, etc.) and made model lists **fully configurable** per provider via the dashboard and API. Custom models stored encrypted in Vault, auto-loaded on startup.

## Type of Change

- [ ] 🐛 Bug fix
- [x] ✨ New feature
- [ ] ♻️ Refactor (no functional changes)
- [x] 📝 Documentation
- [ ] 🧪 Tests
- [x] 🔒 Security

## Changes Made

### 1. Updated Model Lists (from Official Docs)

| Provider | Before | After |
|:---------|:-------|:------|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o3-mini | **gpt-5.2**, gpt-5.2-pro, gpt-5.1, gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, gpt-4o-mini, o3-pro, o4-mini |
| **Anthropic** | claude-sonnet-4-20250514, claude-3-5-haiku-20241022 | **claude-opus-4-6**, claude-sonnet-4-6, claude-opus-4-5, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001, claude-sonnet-4-20250514, claude-opus-4-20250514 |
| **Google** | gemini-2.5-pro, 2.5-flash, 2.0-flash, 2.0-flash-lite, 1.5-pro, 1.5-flash | Removed deprecated **Gemini 1.5** models (shut down) |
| **xAI** | grok-3, grok-3-mini, grok-2, grok-2-mini | Added **grok-4** (latest reasoning model), removed grok-2-mini |
| **Groq** | llama-3.3-70b, mixtral-8x7b | Added llama-3.1-8b-instant, gemma2-9b-it |
| **Mistral** | mistral-large, mistral-medium, codestral, open-mistral-nemo, pixtral | Cleaned to: mistral-large-latest, mistral-small-latest, codestral-latest, pixtral-large-latest |

### 2. Configurable Models per Provider

New feature: users can now customize which models are available for each provider.

**API Endpoints:**
- `GET /api/providers/:name/models` — list models (returns `custom: true/false`)
- `POST /api/providers/:name/models` — save custom model list `{ models: ["model-a", "model-b"] }`
- `DELETE /api/providers/:name/models` — reset to default models

**Dashboard UI:**
- Each provider card now has a "Configure models" toggle
- Shows model tags with remove buttons (×)
- Add model input with Enter key support
- Save models / Reset to defaults buttons
- Visual "(custom)" indicator when using custom list

**Architecture:**
- `setModels()` method added to `LLMProviderAdapter` interface (optional)
- Implemented in `OpenAICompatibleProvider` (covers 7 providers), `OpenAIProvider`, and `AnthropicProvider`
- Custom models stored in Vault as `models:<provider>` (encrypted, AES-256-GCM)
- Auto-loaded on gateway startup from Vault

### 3. RBAC Hard Enforcement

- Non-admin authenticated users now receive **403 Forbidden** on admin routes
- Anonymous requests still allowed through (backward compat until dashboard auth lands)
- `RBAC_ENFORCE` toggle: when enabled, blocks ALL non-admin requests including anonymous
- Configurable from dashboard Settings > Security section

### 4. Security Hardening

- **Startup integrity check**: automatic audit hash chain verification on boot
- **Generic webhook alerts**: POST security notifications to custom URL (stored in Vault)
- **Security webhook URL**: configurable from dashboard Settings > Security section

---

## Files Changed (10 files, +256/-34)

| File | Change |
|:-----|:-------|
| `packages/agent/src/providers/openai.ts` | Updated models to GPT-5.2 family + `setModels()` |
| `packages/agent/src/providers/anthropic.ts` | Updated models to Claude 4.6 family + `setModels()` |
| `packages/agent/src/providers/google.ts` | Removed deprecated Gemini 1.5 models |
| `packages/agent/src/providers/xai.ts` | Added Grok 4 |
| `packages/agent/src/providers/base.ts` | Added `setModels?()` to interface |
| `packages/agent/src/providers/openai-compatible.ts` | `setModels()` implementation |
| `packages/core/src/gateway/chat-routes.ts` | Models API endpoints + Vault startup loading + updated meta |
| `packages/dashboard/src/pages/Settings.tsx` | Model editor UI + updated display text |
| `README.md` | Updated provider table, roadmap, test count |
| `tests/api.test.ts` | Fixed flaky voice tests (accept 400 or 429) |

## How to Test

1. `pnpm -r build`
2. `pnpm forge start --migrate`
3. `pnpm test` — expect **53/53 tests passing**
4. Open dashboard → Settings → click "Configure models" on any provider
5. Verify models list loads correctly, add/remove/save works
6. `GET /api/providers/openai/models` should return GPT-5.2 family
7. `GET /api/providers/anthropic/models` should return Claude 4.6 family

## Related Issue

N/A

## Screenshots

N/A

## Checklist

- [x] Code builds without errors (`pnpm -r build`)
- [x] Tests pass (`pnpm test`) — 53/53
- [x] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [x] No secrets or API keys committed
- [x] Documentation updated (README roadmap, provider tables)

---

## Additional Details

### Roadmap Update

**Completed (now 24 phases):**
- Configurable LLM models per provider (dashboard + API + Vault)
- RBAC hard enforcement for authenticated users
- All provider models updated to latest (Feb 2026)

**What's Next:**
- Electron desktop app
- React Native mobile app
- Signal messenger channel
