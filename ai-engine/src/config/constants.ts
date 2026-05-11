export enum AgentStep {
  SkillAnalysis = 1,
  MarketResearch = 2,
  IdeaProposal = 3,
}

export const DEFAULT_MODEL = 'glm-5-turbo';
export const DEFAULT_BASE_URL = 'https://api.z.ai/api/anthropic';
export const DEFAULT_MAX_TOKENS = 8192;
export const LARGE_MAX_TOKENS = 16384;
