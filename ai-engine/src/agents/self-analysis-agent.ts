import { BaseAgent } from './base-agent';
import { LLMClient } from '../services/llm-client';
import { Phase, LARGE_MAX_TOKENS } from '../config/constants';
import { SelfAnalysisInput, SelfAnalysisOutput } from '../types/self-analysis';
import { SELF_ANALYSIS_SYSTEM_PROMPT, SELF_ANALYSIS_USER_TEMPLATE } from '../prompts/self-analysis';
import { PromptBuilder } from '../services/prompt-builder';

export class SelfAnalysisAgent extends BaseAgent<SelfAnalysisInput, SelfAnalysisOutput> {
  readonly name = 'SelfAnalysisAgent';
  readonly phase = Phase.SelfAnalysis;
  protected readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return SELF_ANALYSIS_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: SelfAnalysisInput): string {
    const personalProjectsSection = input.personalProjects
      ? `### 個人開発プロジェクト\n${JSON.stringify(input.personalProjects, null, 2)}`
      : '';
    const techStackDetailSection = input.techStackDetail
      ? `### 技術スタック詳細\n${JSON.stringify(input.techStackDetail, null, 2)}`
      : '';
    const openSourceActivitySection = input.openSourceActivity
      ? `### OSS活動\n${JSON.stringify(input.openSourceActivity, null, 2)}`
      : '';
    const productBuilderProfileSection = input.productBuilderProfile
      ? `### プロダクトビルダープロファイル\n${JSON.stringify(input.productBuilderProfile, null, 2)}`
      : '';

    return PromptBuilder.build(SELF_ANALYSIS_USER_TEMPLATE, {
      career_history: JSON.stringify(input.careerHistory, null, 2),
      skills: JSON.stringify(input.skills, null, 2),
      achievements: JSON.stringify(input.achievements, null, 2),
      network: JSON.stringify(input.network, null, 2),
      values: JSON.stringify(input.values, null, 2),
      personal_projects_section: personalProjectsSection,
      tech_stack_detail_section: techStackDetailSection,
      open_source_activity_section: openSourceActivitySection,
      product_builder_profile_section: productBuilderProfileSection,
    });
  }
}
