## Description

**ForgeCanvas** — Agent-driven visual artifact system. The agent can generate live, interactive visual content (HTML, React, SVG, Mermaid diagrams, Charts, Markdown, Code) rendered in sandboxed iframes inside the Dashboard. More powerful than OpenClaw's Canvas/A2UI: works in any browser (not just macOS), no custom protocol needed (LLM generates standard HTML/React), and supports bidirectional artifact↔agent communication via postMessage.

## Type of Change

- [ ] Bug fix
- [x] New feature
- [ ] Refactor (no functional changes)
- [x] Documentation
- [ ] Tests
- [ ] Security

## Changes Made

- **`packages/shared/src/types/artifact.ts`** — NEW: Artifact types (ArtifactType, Artifact, CreateArtifactRequest, UpdateArtifactRequest, ArtifactEvent, ArtifactChartConfig)
- **`packages/core/src/artifact/artifact-manager.ts`** — NEW: ArtifactManager with CRUD, file persistence (.forgeai/artifacts/), event system, and HTML renderers for 7 artifact types:
  - HTML: Tailwind CDN + dark theme
  - React: React 18 + Babel standalone + Tailwind
  - SVG: inline rendering
  - Mermaid: mermaid.js CDN with dark theme
  - Chart: Chart.js CDN (bar, line, pie, area, scatter, radar)
  - Markdown: marked.js + github-markdown-css dark
  - Code: Prism.js with autoloader + copy button
- **`packages/core/src/gateway/chat-routes.ts`** — 8 API endpoints: GET /api/artifacts, GET /api/artifacts/:id, GET /api/artifacts/:id/render, POST /api/artifacts, PUT /api/artifacts/:id, DELETE /api/artifacts/:id, POST /api/artifacts/:id/interact. WebSocket event broadcasting on create/update/delete.
- **`packages/dashboard/src/components/ArtifactRenderer.tsx`** — NEW: Sandboxed iframe renderer with header (type badge, title, version), toolbar (copy source, view source, refresh, open in new tab, expand/minimize, delete), and postMessage listener for bidirectional interaction.
- **`packages/dashboard/src/pages/Canvas.tsx`** — NEW: Dashboard page #18 with artifact creation form (7 type selector, title, content editor with placeholders, language picker for code), search/filter, WebSocket real-time updates, and artifact grid with ArtifactRenderer.
- **`packages/dashboard/src/App.tsx`** — Route: /canvas
- **`packages/dashboard/src/components/Layout.tsx`** — Sidebar: Canvas nav item with Layers icon
- **`packages/dashboard/src/lib/i18n.ts`** — nav.canvas key for en/pt-br/es
- **`README.md`** — 18 dashboard pages, Canvas description in dashboard table

## How to Test

1. `pnpm -r build` — all packages build successfully
2. `pnpm forge start --migrate`
3. Dashboard → Canvas → "New Artifact" → select type → enter title + content → Create
4. Test each type: HTML, React (counter app), SVG, Mermaid, Chart, Markdown, Code
5. Expand/minimize, view source, copy, open in new tab, refresh, delete
6. API: `POST /api/artifacts` with `{ sessionId: "test", type: "html", title: "Test", content: "<h1>Hello</h1>" }`
7. `GET /api/artifacts/ART_ID/render` returns full HTML page for iframe

## Checklist

- [x] Code builds without errors (`pnpm -r build`)
- [x] Tests pass (`pnpm test`)
- [x] Commit messages follow Conventional Commits
- [x] No secrets or API keys committed
- [x] Documentation updated (if needed)

---

### Files Changed (11 files, +953 lines)

| File | Change |
|:-----|:-------|
| `packages/shared/src/types/artifact.ts` | **NEW** — Artifact types (+67 lines) |
| `packages/shared/src/types/index.ts` | Export artifact types |
| `packages/core/src/artifact/artifact-manager.ts` | **NEW** — ArtifactManager + 7 HTML renderers (+340 lines) |
| `packages/core/src/index.ts` | Export ArtifactManager |
| `packages/core/src/gateway/chat-routes.ts` | 8 API endpoints + init + WS events (+108 lines) |
| `packages/dashboard/src/components/ArtifactRenderer.tsx` | **NEW** — Sandboxed iframe renderer (+135 lines) |
| `packages/dashboard/src/pages/Canvas.tsx` | **NEW** — Canvas dashboard page (+265 lines) |
| `packages/dashboard/src/App.tsx` | Route /canvas |
| `packages/dashboard/src/components/Layout.tsx` | Sidebar Canvas entry |
| `packages/dashboard/src/lib/i18n.ts` | nav.canvas i18n keys |
| `README.md` | 18 pages, Canvas description |
