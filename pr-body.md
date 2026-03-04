## Description

Agents page: dynamic provider/model selection from configured LLMs. Providers configured in Settings now appear automatically in Agents. Model dropdown loads available models per provider via API. System prompt field clearly indicates it's optional (uses default if empty).

## Type of Change

- [x] Bug fix
- [x] New feature
- [ ] Refactor (no functional changes)
- [ ] Documentation
- [ ] Tests
- [ ] Security

## Changes Made

- **Dynamic provider list** (`packages/dashboard/src/pages/Agents.tsx`):
  - Fetches configured providers from `/api/providers` on mount (only `configured: true`)
  - Provider dropdown in create and edit forms shows only configured LLMs
  - Warning message when no providers are configured

- **Dynamic model loading**:
  - When a provider is selected, models are fetched from `/api/providers/:name/models`
  - Model field changed from free-text `<input>` to `<select>` dropdown
  - Models are cached per provider to avoid redundant API calls
  - Model resets when provider changes

- **Edit mode improvements**:
  - Edit form now includes provider and model dropdowns (previously only name/persona)
  - `handleUpdate` sends model and provider changes to API
  - Pre-loads models for agent's current provider when entering edit mode

- **UX: Optional system prompt**:
  - Label shows "(opcional — se vazio, usa o prompt padrão do ForgeAI)"
  - Placeholder explains it's optional and defaults to the standard prompt

## How to Test

1. `pnpm -r build`
2. Configure a provider API key in Settings
3. Go to Agents → click "+ Novo Agente"
4. Provider dropdown should list only configured providers
5. Select a provider → Model dropdown should populate with that provider's models
6. Leave Persona empty → confirm placeholder indicates it's optional
7. Edit an existing agent → confirm provider/model dropdowns work

## Checklist

- [x] Code builds without errors (`pnpm -r build`)
- [x] Commit messages follow Conventional Commits
- [x] No secrets or API keys committed
- [x] Backward compatible
