## Description

Phase 25 — Massively upgraded the browser/navigation tools. Puppeteer browser now has 21 actions (was 8). web_browse now supports HTTP methods, custom headers, and 7 extraction modes. Added a brand new `web_search` tool for Google/DuckDuckGo search with structured results. **13 built-in tools** total (was 12).

## Type of Change

- [ ] 🐛 Bug fix
- [x] ✨ New feature
- [ ] ♻️ Refactor (no functional changes)
- [x] 📝 Documentation
- [x] 🧪 Tests
- [ ] 🔒 Security

## Changes Made

### 1. Browser (Puppeteer) — 13 new actions (8 → 21 total)

| Action | What it does |
|:-------|:-------------|
| `scroll` | Scroll page: down/up/left/right/top/bottom with pixel amount |
| `hover` | Hover over element by CSS selector (triggers tooltips, menus) |
| `select` | Select dropdown option by value |
| `back` | Navigate back in browser history |
| `forward` | Navigate forward in browser history |
| `reload` | Reload current page |
| `wait` | Wait for CSS selector to appear or fixed time (ms) |
| `cookies` | Get all cookies for current page |
| `set_cookie` | Set a cookie {name, value, domain, path} |
| `clear_cookies` | Clear all cookies |
| `extract_table` | Extract structured tables → {headers, rows} |
| `new_tab` | Open new tab (optionally navigate to URL) |
| `switch_tab` / `close_tab` | Multi-tab management |

### 2. web_browse (Cheerio) — upgraded

- **HTTP methods**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Custom headers**: pass any headers as key-value pairs
- **Request body**: for POST/PUT requests (auto Content-Type: application/json)
- **New extraction modes**: `tables` (structured), `metadata` (Open Graph, meta tags, canonical), `json` (API responses parsed directly)

### 3. web_search — NEW tool

- Search **Google** or **DuckDuckGo** with structured results `{title, url, snippet}`
- Auto-fallback: if Google fails → DuckDuckGo
- Google featured snippet extraction (answer box)
- Language/region support (`pt-BR`, `en-US`, etc.)
- Configurable max results (default 8, max 20)

---

## Files Changed (7 files, +508/-22)

| File | Change |
|:-----|:-------|
| `packages/tools/src/tools/puppeteer-browser.ts` | 13 new actions: scroll, hover, select, back/forward/reload, wait, cookies, extract_table, multi-tab |
| `packages/tools/src/tools/web-browser.ts` | HTTP methods, custom headers, body, tables/metadata/json extraction |
| `packages/tools/src/tools/web-search.ts` | **NEW** — Google/DuckDuckGo search with structured results |
| `packages/tools/src/index.ts` | Register + export WebSearchTool |
| `packages/agent/src/runtime.ts` | Updated system prompt with all new browser actions + web_search |
| `README.md` | 13 tools, updated browser/web_browse descriptions, added web_search |
| `tests/api.test.ts` | Added web_search + tool count (13) tests |

## How to Test

1. `pnpm -r build`
2. `pnpm forge start --migrate`
3. `pnpm test` — expect **55/55 tests passing**
4. Verify `GET /api/tools` returns 13 tools including `web_search`
5. Test via chat: ask the agent to "search Google for Node.js 22 features"
6. Test browser scroll: ask agent to navigate to a page and scroll down

## Related Issue

N/A

## Screenshots

N/A

## Checklist

- [x] Code builds without errors (`pnpm -r build`)
- [x] Tests pass (`pnpm test`) — 55/55
- [x] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [x] No secrets or API keys committed
- [x] Documentation updated (README tool table, system prompt)
