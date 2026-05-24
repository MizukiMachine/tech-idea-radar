import { describe, expect, it } from 'vitest';
import { listPromptTemplateKeys, renderPromptRole } from '../src/services/prompt-catalog';
import {
  renderRssArticleSummaryPolicy,
  renderRssArticleSummaryRepairPolicy,
} from '../src/policies/rss-summary-policy';

describe('prompt catalog', () => {
  it('loads all managed prompt templates from YAML', () => {
    expect(listPromptTemplateKeys()).toEqual([
      'idea_generation',
      'idea_seed_generation',
      'idea_detail_generation',
      'semantic_filter',
      'rss_topic_clustering',
      'rss_article_summary',
      'rss_article_summary_repair',
      'featured_idea_selection',
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
    expect(systemPrompt).toContain('targetUsersはカード一覧で先に読む');
    expect(systemPrompt).toContain('利用状況、悩み、条件節、文末の助詞は書かない');
    expect(systemPrompt).toContain('悪い例: AIコーディングアシスタントを導入済みだが');
    expect(systemPrompt).toContain('18文字以内の短い対象ユーザー名詞句');
    expect(systemPrompt).not.toContain('${');
    expect(userPrompt).toContain('### RSSコンテキスト');
    expect(userPrompt).toContain('"AI Ops article"');
    expect(userPrompt).toContain('最大 3 件');
    expect(userPrompt).not.toContain('${');
  });

  it('renders staged idea generation prompts', () => {
    const seedSystemPrompt = renderPromptRole('idea_seed_generation', 'system');
    const detailSystemPrompt = renderPromptRole('idea_detail_generation', 'system');
    const seedPrompt = renderPromptRole('idea_seed_generation', 'user', {
      rss_context: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{ title: 'AI Ops article', url: 'https://example.com/ai-ops' }],
      },
      focus_keywords: 'AI, SaaS',
      requested_idea_count: '4',
    });
    const detailPrompt = renderPromptRole('idea_detail_generation', 'user', {
      rss_context: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{ title: 'AI Ops article', url: 'https://example.com/ai-ops' }],
      },
      focus_keywords: 'AI, SaaS',
      idea_seed: { seedId: 'seed-1', title: 'AI Ops Memo' },
    });

    expect(seedPrompt).toContain('最大 4 件');
    expect(seedPrompt).toContain('互いに重複しないアイデア候補');
    expect(seedSystemPrompt).toContain('targetUsersは「誰向けか」だけ');
    expect(detailSystemPrompt).toContain('targetUsersはカード一覧で先に読む');
    expect(detailPrompt).toContain('"seedId": "seed-1"');
    expect(detailPrompt).toContain('この候補1件だけ');
    expect(seedSystemPrompt).not.toContain('${');
    expect(detailSystemPrompt).not.toContain('${');
    expect(seedPrompt).not.toContain('${');
    expect(detailPrompt).not.toContain('${');
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

  it('renders the RSS topic clustering prompt with article indexes', () => {
    const systemPrompt = renderPromptRole('rss_topic_clustering', 'system', {
      articles: [],
      existing_topics: [],
      focus_keywords: 'AI, developer',
    });
    const userPrompt = renderPromptRole('rss_topic_clustering', 'user', {
      articles: [
        {
          index: 0,
          title: 'Take your local GitHub sessions anywhere',
          source: 'GitHub Blog',
          summary: 'Remote control for local coding sessions.',
        },
      ],
      existing_topics: [{ topic: 'github sessions', articleCount: 1 }],
      focus_keywords: 'AI, developer',
    });

    expect(systemPrompt).toContain('関連記事判定器');
    expect(systemPrompt).toContain('articleIndexes');
    expect(userPrompt).toContain('Take your local GitHub sessions anywhere');
    expect(userPrompt).toContain('github sessions');
    expect(userPrompt).not.toContain('${');
  });

  it('keeps the RSS summary publication policy in the managed prompt', () => {
    const systemPrompt = renderPromptRole('rss_article_summary', 'system', {
      summary_policy: renderRssArticleSummaryPolicy(),
    });

    expect(systemPrompt).toContain(renderRssArticleSummaryPolicy());
    expect(systemPrompt).toContain('最終出力前に');
    expect(systemPrompt).toContain('summaryJaが上記の箇条書き数・文字数・メタ情報禁止・URL禁止・日本語要約条件をすべて満たす');
    expect(systemPrompt).toContain('基準を満たせない記事、日本語化できない記事');
    expect(systemPrompt).toContain('掲載側では要約失敗として除外し、部分失敗は管理者通知の対象になります');
    expect(systemPrompt).toContain('全件が基準未満の場合は空配列を返す');
  });

  it('renders the RSS summary repair prompt with validation errors', () => {
    const systemPrompt = renderPromptRole('rss_article_summary_repair', 'system', {
      summary_policy: renderRssArticleSummaryRepairPolicy(),
    });
    const userPrompt = renderPromptRole('rss_article_summary_repair', 'user', {
      summary_policy: renderRssArticleSummaryRepairPolicy(),
      validation_errors: [{ index: 3, error: 'summaryJa total length is outside the expected range' }],
      articles: [{ index: 3, title: 'Short AI article', source: 'Example', summary: 'AI tools update.' }],
    });

    expect(systemPrompt).toContain('検証に失敗したRSS記事要約');
    expect(systemPrompt).toContain('箇条書き数の場合');
    expect(systemPrompt).toContain('検証エラーが文字数不足の場合');
    expect(userPrompt).toContain('summaryJa total length is outside the expected range');
    expect(userPrompt).toContain('Short AI article');
    expect(userPrompt).not.toContain('${');
  });
});
