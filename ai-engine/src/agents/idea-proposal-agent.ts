import { BaseAgent } from './base-agent';
import { LLMClient } from '../services/llm-client';
import { AgentStep, LARGE_MAX_TOKENS } from '../config/constants';
import { IdeaProposalInput, IdeaProposalOutput } from '../types/idea-proposal';
import { IDEA_PROPOSAL_SYSTEM_PROMPT, IDEA_PROPOSAL_USER_TEMPLATE } from '../prompts/idea-proposal';
import { PromptBuilder } from '../services/prompt-builder';

export class IdeaProposalAgent extends BaseAgent<IdeaProposalInput, IdeaProposalOutput> {
  readonly name = 'IdeaProposalAgent';
  readonly step = AgentStep.IdeaProposal;
  protected readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return IDEA_PROPOSAL_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: IdeaProposalInput): string {
    return PromptBuilder.build(IDEA_PROPOSAL_USER_TEMPLATE, {
      self_analysis: JSON.stringify(input.previousSteps.skillAnalysis, null, 2),
      market_research: JSON.stringify(input.previousSteps.marketResearch, null, 2),
    });
  }
}
