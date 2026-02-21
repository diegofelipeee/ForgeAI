import { resolve } from 'node:path';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import type { Artifact, CreateArtifactRequest, UpdateArtifactRequest, ArtifactEvent } from '@forgeai/shared';

const ARTIFACTS_DIR = resolve(process.cwd(), '.forgeai', 'artifacts');

function generateId(): string {
  return `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ArtifactManager {
  private artifacts: Map<string, Artifact> = new Map();
  private listeners: Array<(event: ArtifactEvent) => void> = [];

  constructor() {
    if (!existsSync(ARTIFACTS_DIR)) {
      mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    this.loadFromDisk();
  }

  // ─── CRUD ───────────────────────────────────────────

  create(req: CreateArtifactRequest): Artifact {
    const now = new Date().toISOString();
    const artifact: Artifact = {
      id: generateId(),
      sessionId: req.sessionId,
      messageId: req.messageId,
      type: req.type,
      title: req.title,
      content: req.content,
      language: req.language,
      chartConfig: req.chartConfig,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.artifacts.set(artifact.id, artifact);
    this.saveToDisk(artifact);
    this.emit({ type: 'artifact_created', artifact, artifactId: artifact.id, sessionId: artifact.sessionId });
    return artifact;
  }

  get(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  update(id: string, req: UpdateArtifactRequest): Artifact | undefined {
    const artifact = this.artifacts.get(id);
    if (!artifact) return undefined;

    if (req.title !== undefined) artifact.title = req.title;
    if (req.content !== undefined) artifact.content = req.content;
    if (req.language !== undefined) artifact.language = req.language;
    if (req.chartConfig !== undefined) artifact.chartConfig = req.chartConfig;
    artifact.version += 1;
    artifact.updatedAt = new Date().toISOString();

    this.artifacts.set(id, artifact);
    this.saveToDisk(artifact);
    this.emit({ type: 'artifact_updated', artifact, artifactId: id, sessionId: artifact.sessionId });
    return artifact;
  }

  delete(id: string): boolean {
    const artifact = this.artifacts.get(id);
    if (!artifact) return false;

    this.artifacts.delete(id);
    this.removeFromDisk(id);
    this.emit({ type: 'artifact_deleted', artifactId: id, sessionId: artifact.sessionId });
    return true;
  }

  // ─── Queries ────────────────────────────────────────

  listBySession(sessionId: string): Artifact[] {
    return Array.from(this.artifacts.values())
      .filter(a => a.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  listAll(): Artifact[] {
    return Array.from(this.artifacts.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  count(): number {
    return this.artifacts.size;
  }

  // ─── Events ─────────────────────────────────────────

  onEvent(listener: (event: ArtifactEvent) => void): void {
    this.listeners.push(listener);
  }

  offEvent(listener: (event: ArtifactEvent) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private emit(event: ArtifactEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  // ─── Interaction (from iframe postMessage) ──────────

  handleInteraction(artifactId: string, action: string, data?: Record<string, unknown>): void {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return;

    this.emit({
      type: 'artifact_interaction',
      artifactId,
      sessionId: artifact.sessionId,
      interaction: { action, data },
    });
  }

  // ─── Persistence ────────────────────────────────────

  private saveToDisk(artifact: Artifact): void {
    try {
      const filepath = resolve(ARTIFACTS_DIR, `${artifact.id}.json`);
      writeFileSync(filepath, JSON.stringify(artifact, null, 2), 'utf-8');
    } catch { /* ignore write errors */ }
  }

  private removeFromDisk(id: string): void {
    try {
      const filepath = resolve(ARTIFACTS_DIR, `${id}.json`);
      if (existsSync(filepath)) unlinkSync(filepath);
    } catch { /* ignore */ }
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(ARTIFACTS_DIR)) return;
      const files = readdirSync(ARTIFACTS_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = readFileSync(resolve(ARTIFACTS_DIR, file), 'utf-8');
          const artifact = JSON.parse(content) as Artifact;
          if (artifact.id) this.artifacts.set(artifact.id, artifact);
        } catch { /* skip corrupt files */ }
      }
    } catch { /* ignore */ }
  }

  // ─── HTML Renderer ──────────────────────────────────

  /** Build a complete sandboxed HTML document for rendering an artifact */
  renderToHTML(artifact: Artifact): string {
    switch (artifact.type) {
      case 'html':
        return this.wrapHTML(artifact.title, artifact.content);
      case 'react':
        return this.wrapReact(artifact.title, artifact.content);
      case 'svg':
        return this.wrapHTML(artifact.title, artifact.content);
      case 'mermaid':
        return this.wrapMermaid(artifact.title, artifact.content);
      case 'chart':
        return this.wrapChart(artifact.title, artifact.chartConfig);
      case 'markdown':
        return this.wrapMarkdown(artifact.title, artifact.content);
      case 'code':
        return this.wrapCode(artifact.title, artifact.content, artifact.language);
      default:
        return this.wrapHTML(artifact.title, `<pre>${this.escapeHtml(artifact.content)}</pre>`);
    }
  }

  private wrapHTML(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #e4e4e7; }
    a { color: #a78bfa; }
  </style>
  <script>
    function sendToAgent(action, data) {
      window.parent.postMessage({ type: 'artifact_interaction', action, data }, '*');
    }
  <\/script>
</head>
<body class="bg-zinc-950 text-zinc-200">
  ${body}
</body>
</html>`;
  }

  private wrapReact(title: string, jsxCode: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #e4e4e7; }
  </style>
  <script>
    function sendToAgent(action, data) {
      window.parent.postMessage({ type: 'artifact_interaction', action, data }, '*');
    }
  <\/script>
</head>
<body class="bg-zinc-950 text-zinc-200">
  <div id="root"></div>
  <script type="text/babel">
    ${jsxCode}
    const rootEl = document.getElementById('root');
    if (typeof App !== 'undefined') {
      ReactDOM.createRoot(rootEl).render(React.createElement(App));
    }
  <\/script>
</body>
</html>`;
  }

  private wrapMermaid(title: string, mermaidCode: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #e4e4e7; display: flex; justify-content: center; }
    .mermaid { max-width: 100%; }
  </style>
</head>
<body>
  <div class="mermaid">
${mermaidCode}
  </div>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });<\/script>
</body>
</html>`;
  }

  private wrapChart(title: string, config?: Artifact['chartConfig']): string {
    if (!config) return this.wrapHTML(title, '<p>No chart config provided</p>');

    const chartType = config.chartType || 'bar';
    const labels = config.data.map((d: any) => d[config.xKey || 'label'] || '');
    const yKeys = config.yKeys || Object.keys(config.data[0] || {}).filter(k => k !== (config.xKey || 'label'));
    const colors = config.colors || ['#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6'];

    const datasets = yKeys.map((key: string, i: number) => ({
      label: key,
      data: config.data.map((d: any) => d[key] ?? 0),
      backgroundColor: colors[i % colors.length],
      borderColor: colors[i % colors.length],
      fill: chartType === 'area',
    }));

    const chartJsType = chartType === 'area' ? 'line' : chartType;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #e4e4e7; }
    canvas { max-width: 100%; max-height: 400px; }
  </style>
</head>
<body>
  <canvas id="chart"></canvas>
  <script>
    new Chart(document.getElementById('chart'), {
      type: '${chartJsType}',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: ${JSON.stringify(datasets)},
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#a1a1aa' } } },
        scales: {
          x: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
          y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
        },
      },
    });
  <\/script>
</body>
</html>`;
  }

  private wrapMarkdown(title: string, mdContent: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-dark.min.css">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #e4e4e7; }
    .markdown-body { background: transparent; }
  </style>
</head>
<body>
  <div id="content" class="markdown-body"></div>
  <script>
    document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(mdContent)});
  <\/script>
</body>
</html>`;
  }

  private wrapCode(title: string, code: string, language?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css">
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1/prism.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1/plugins/autoloader/prism-autoloader.min.js"><\/script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #09090b; color: #e4e4e7; }
    pre { border-radius: 8px; font-size: 13px; }
    .copy-btn { position: fixed; top: 8px; right: 8px; padding: 4px 12px; background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .copy-btn:hover { background: #3f3f46; color: #e4e4e7; }
  </style>
</head>
<body>
  <button class="copy-btn" onclick="navigator.clipboard.writeText(document.querySelector('code').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
  <pre><code class="language-${language || 'text'}">${this.escapeHtml(code)}</code></pre>
  <script>Prism.highlightAll();<\/script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export function createArtifactManager(): ArtifactManager {
  return new ArtifactManager();
}
