import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '../config/constants';

export class ClaudeClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(apiKey: string, model?: string, maxTokens?: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? DEFAULT_MODEL;
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async send(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens ?? this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }
}
