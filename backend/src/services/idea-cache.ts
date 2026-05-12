import { EntrepreneurAgent, type IdeaGenerationOutput, type IdeaCandidate, type SemanticFilterInput, type SemanticFilterOutput } from 'ai-engine';
import { getClient } from './ai-engine';
import { CACHE_REFRESH_INTERVAL_MS } from 'ai-engine';

let cache: {
  data: IdeaGenerationOutput;
  expiresAt: number;
} | null = null;

let generationLock: Promise<IdeaGenerationOutput> | null = null;

export function getCachedIdeas(): IdeaGenerationOutput | null {
  if (!cache || Date.now() > cache.expiresAt) return null;
  return cache.data;
}

export async function generateAndCacheIdeas(
  onProgress?: (text: string) => void,
): Promise<IdeaGenerationOutput> {
  // If already generating, reuse the same promise
  if (generationLock) return generationLock;

  generationLock = (async () => {
    try {
      const agent = new EntrepreneurAgent(getClient());
      const result = await agent.generateIdeas(onProgress);
      cache = {
        data: result,
        expiresAt: Date.now() + CACHE_REFRESH_INTERVAL_MS,
      };
      return result;
    } finally {
      generationLock = null;
    }
  })();

  return generationLock;
}

export async function filterCachedIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.filterIdeas(input);
}
