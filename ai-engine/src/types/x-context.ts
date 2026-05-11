export interface XTweet {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  createdAt: string;
  url: string;
}

export interface XTrendingTopic {
  topic: string;
  tweetVolume: number;
  url: string;
  relatedHashtags: string[];
}

export interface XDemandSignal {
  tweet: XTweet;
  needCategory: 'want' | 'frustration' | 'problem' | 'wish';
  matchedKeywords: string[];
  relevanceScore: number;
}

export interface XCompetitorSentiment {
  competitorName: string;
  tweets: XTweet[];
  sentimentSummary: string;
  keyComplaints: string[];
  keyPraises: string[];
}

export interface XContext {
  trendingTopics: XTrendingTopic[];
  demandSignals: XDemandSignal[];
  competitorSentiments: XCompetitorSentiment[];
  fetchedAt: string;
}
