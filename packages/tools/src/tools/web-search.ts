import * as cheerio from 'cheerio';
import { BaseTool } from '../base.js';
import type { ToolDefinition, ToolResult } from '../base.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

export class WebSearchTool extends BaseTool {
  readonly definition: ToolDefinition = {
    name: 'web_search',
    description: 'Search the web using Google or DuckDuckGo and return structured results (title, URL, snippet). Use for finding information, news, documentation, or any web content.',
    category: 'browser',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'engine', type: 'string', description: 'Search engine: "google" (default) or "duckduckgo"', required: false, default: 'google' },
      { name: 'maxResults', type: 'number', description: 'Max results to return (default: 8, max: 20)', required: false, default: 8 },
      { name: 'language', type: 'string', description: 'Language/region code for results (e.g. "pt-BR", "en-US")', required: false },
    ],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) return { success: false, error: validationError, duration: 0 };

    const query = String(params['query']).trim();
    if (!query) return { success: false, error: 'query is required', duration: 0 };

    const engine = String(params['engine'] || 'google').toLowerCase();
    const maxResults = Math.min(Math.max(Number(params['maxResults']) || 8, 1), 20);
    const language = params['language'] as string | undefined;

    const { result, duration } = await this.timed(async () => {
      if (engine === 'duckduckgo') {
        return this.searchDuckDuckGo(query, maxResults, language);
      }
      // Default: try Google, fallback to DuckDuckGo
      try {
        return await this.searchGoogle(query, maxResults, language);
      } catch (err) {
        this.logger.warn('Google search failed, falling back to DuckDuckGo', { error: err instanceof Error ? err.message : String(err) });
        return this.searchDuckDuckGo(query, maxResults, language);
      }
    });

    this.logger.debug('Web search completed', { query, engine, results: (result as any).results?.length ?? 0, duration });
    return { success: true, data: result, duration };
  }

  private async searchGoogle(query: string, maxResults: number, language?: string): Promise<Record<string, unknown>> {
    const lang = language || 'en';
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}&hl=${lang}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': `${lang},en;q=0.9`,
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      // Google search result selectors
      $('div.g, div[data-sokoban-container]').each((_, el) => {
        if (results.length >= maxResults) return;

        const linkEl = $(el).find('a[href^="http"]').first();
        const href = linkEl.attr('href') || '';
        if (!href || href.includes('google.com/search')) return;

        const title = $(el).find('h3').first().text().trim();
        // Snippet: try multiple selectors Google uses
        const snippet = (
          $(el).find('div[data-sncf], div.VwiC3b, span.aCOpRe, div[style*="-webkit-line-clamp"]').first().text().trim() ||
          $(el).find('div:not(:has(h3)):not(:has(a))').first().text().trim()
        ).slice(0, 300);

        if (title && href) {
          results.push({ title, url: href, snippet });
        }
      });

      // Featured snippet / answer box
      let featuredSnippet = '';
      const featured = $('div.IZ6rdc, div[data-attrid="wa:/description"], div.hgKElc').first();
      if (featured.length) {
        featuredSnippet = featured.text().trim().slice(0, 500);
      }

      return {
        engine: 'google',
        query,
        resultCount: results.length,
        results,
        ...(featuredSnippet ? { featuredSnippet } : {}),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchDuckDuckGo(query: string, maxResults: number, language?: string): Promise<Record<string, unknown>> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${language ? `&kl=${language}` : ''}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      // DuckDuckGo HTML results
      $('div.result, div.web-result').each((_, el) => {
        if (results.length >= maxResults) return;

        const linkEl = $(el).find('a.result__a, a.result__url').first();
        let href = linkEl.attr('href') || '';

        // DDG wraps URLs in redirect — extract actual URL
        if (href.includes('uddg=')) {
          try {
            const parsed = new URL(href, 'https://duckduckgo.com');
            href = decodeURIComponent(parsed.searchParams.get('uddg') || href);
          } catch { /* keep original */ }
        }

        const title = $(el).find('a.result__a, h2').first().text().trim();
        const snippet = $(el).find('a.result__snippet, div.result__snippet').first().text().trim().slice(0, 300);

        if (title && href && href.startsWith('http')) {
          results.push({ title, url: href, snippet });
        }
      });

      return {
        engine: 'duckduckgo',
        query,
        resultCount: results.length,
        results,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
