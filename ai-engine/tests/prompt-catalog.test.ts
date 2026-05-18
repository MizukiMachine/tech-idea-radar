import { describe, expect, it } from 'vitest';
import { listPromptTemplateKeys, renderPromptRole } from '../src/services/prompt-catalog';

describe('prompt catalog', () => {
  it('loads all managed prompt templates from YAML', () => {
    expect(listPromptTemplateKeys()).toEqual([
      'idea_generation',
      'semantic_filter',
      'rss_article_summary',
      'featured_idea_selection',
      'featured_trend_selection',
    ]);
  });

  it('renders the idea generation prompt with structured materials and runtime inputs', () => {
    const systemPrompt = renderPromptRole('idea_generation', 'system');
    const userPrompt = renderPromptRole('idea_generation', 'user', {
      rss_context: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{ title: 'AI Ops article', url: 'https://example.com/ai-ops' }],
      },
      focus_keywords: 'AI, SaaS',
      requested_idea_count: '3',
    });

    expect(systemPrompt).toContain('## 出力ルール');
    expect(systemPrompt).toContain('"generatedAt": "ISO 8601形式のタイムスタンプ"');
    expect(systemPrompt).not.toContain('${');
    expect(userPrompt).toContain('### RSSコンテキスト');
    expect(userPrompt).toContain('"AI Ops article"');
    expect(userPrompt).toContain('最大 3 件');
    expect(userPrompt).not.toContain('${');
  });

  it('rejects missing required runtime inputs', () => {
    expect(() => renderPromptRole('semantic_filter', 'user', { query: 'AI' }))
      .toThrow('Missing prompt variables: candidates');
  });

  it('rejects undeclared runtime inputs', () => {
    expect(() => renderPromptRole('featured_idea_selection', 'user', {
      idea_summaries: [],
      secret_token: 'do-not-render',
    })).toThrow('Undeclared prompt inputs for featured_idea_selection: secret_token');
  });
});
