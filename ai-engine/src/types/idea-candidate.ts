export interface IdeaCandidate {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tags: string[];
  productType: string;
  targetUsers: string;
  coreProblem: string;
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
  batchTime?: string;
}
