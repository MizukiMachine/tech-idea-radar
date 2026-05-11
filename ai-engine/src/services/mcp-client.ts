import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpToolResult {
  content: { type: string; text: string }[];
}

export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(command: string, args: string[] = [], timeoutMs = 10000): Promise<void> {
    this.transport = new StdioClientTransport({ command, args });
    this.client = new Client({ name: 'builder-agent-chain', version: '1.0.0' });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const connectPromise = this.client.connect(this.transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('MCP connection timeout')), timeoutMs);
    });

    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!this.client) throw new Error('MCP client not connected');
    return this.client.callTool({ name, arguments: args }) as Promise<McpToolResult>;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close?.();
      this.transport = null;
    }
    this.client = null;
  }
}

export interface RssTrendItem {
  word: string;
  count: number;
}

export interface RssArticle {
  title: string;
  link: string;
  published: string;
  summary: string;
  source: string;
}

export interface RssContext {
  trendingKeywords: RssTrendItem[];
  relatedArticles: RssArticle[];
}

const MCP_RSS_SCOUT_PATH = process.env.MCP_RSS_SCOUT_PATH ?? '';
const MCP_TIMEOUT = 5000;

export async function fetchRssContext(keywords: string[]): Promise<RssContext> {
  if (!MCP_RSS_SCOUT_PATH) {
    console.warn('[MCP] MCP_RSS_SCOUT_PATH not set — skipping RSS enrichment');
    return { trendingKeywords: [], relatedArticles: [] };
  }

  const client = new McpClient();
  try {
    await client.connect('node', [MCP_RSS_SCOUT_PATH], MCP_TIMEOUT);

    const trendingResult = await client.callTool('rss_trending', { hours: 72 });
    const trendingText = trendingResult.content?.[0]?.text ?? '{}';
    const trendingData = JSON.parse(trendingText);
    const trendingKeywords: RssTrendItem[] = trendingData.trending ?? [];

    const relatedArticles: RssArticle[] = [];
    for (const kw of keywords.slice(0, 3)) {
      try {
        const searchResult = await client.callTool('rss_search', { keyword: kw, limit: 5 });
        const searchText = searchResult.content?.[0]?.text ?? '{}';
        const searchData = JSON.parse(searchText);
        for (const article of (searchData.articles ?? [])) {
          relatedArticles.push({
            title: article.title ?? '',
            link: article.link ?? '',
            published: article.published ?? '',
            summary: article.summary ?? '',
            source: article.source ?? '',
          });
        }
      } catch {
        // skip failed search for individual keyword
      }
    }

    return { trendingKeywords, relatedArticles };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[MCP] RSS enrichment failed: ${msg}`);
    return { trendingKeywords: [], relatedArticles: [] };
  } finally {
    await client.disconnect();
  }
}
