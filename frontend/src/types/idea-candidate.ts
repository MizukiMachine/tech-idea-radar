export interface IdeaCandidate {
  id: string;
  title: string;
  tagline: string;
  description: string;
  trendScore: number;
  tags: string[];
  productType: string;
  targetUsers: string;
  coreProblem: string;
  revenuePotential: string;
  developmentScale?: number;
  developmentScaleReason?: string;
  estimatedMvpTime?: string;
  differentiation: string;
  sources: {
    rssKeywords: string[];
    evidenceUrls?: {
      title: string;
      url: string;
      type: 'rss' | 'web' | 'other';
    }[];
  };
  generatedAt: string;
}
