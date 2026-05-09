export enum Phase {
  SelfAnalysis = 1,
  MarketResearch = 2,
  Persona = 3,
  ProductConcept = 4,
}

export const DEFAULT_MODEL = 'glm-5-turbo';
export const DEFAULT_BASE_URL = 'https://api.z.ai/api/anthropic';
export const DEFAULT_MAX_TOKENS = 8192;
export const LARGE_MAX_TOKENS = 16384;
