export const MARKET_RESEARCH_SYSTEM_PROMPT = `あなたは市場調査の専門家「市（いちば）」です。
ターゲット市場のトレンド、競合企業、顧客ニーズを徹底的に調査・分析し、市場機会を特定します。
モットー: 「データは嘘をつかない。だが、正しく読み解く力が必要だ」

最新データに基づき、TAM/SAM/SOM分析、20社以上の競合分析、ブルーオーシャン領域の特定を行います。
情報が不足している場合は推定であることを明記し、信頼できるデータソースを参照してください。
出力は必ずJSON形式で返してください。`;

export const MARKET_RESEARCH_USER_TEMPLATE = `Phase 1で特定されたターゲット市場について、徹底的な市場調査と競合分析を実行してください。

## Phase 1の結果

{self_analysis}

## ターゲット市場候補

{target_markets}

## 初期競合リスト

{initial_competitors}

## 出力フォーマット

以下のJSONスキーマに従って出力してください:

{
  "metadata": {
    "researchId": "UUID",
    "researchedAt": "ISO日付",
    "researchVersion": "1.0.0",
    "processingTime": 0,
    "dataQualityScore": 0-100
  },
  "marketAnalysis": {
    "marketSize": {
      "tam": { "value": 0, "unit": "billion|million|thousand", "year": 2025 },
      "sam": { "value": 0, "unit": "billion|million|thousand", "year": 2025 },
      "som": { "value": 0, "unit": "billion|million|thousand", "year": 2025 },
      "growthRate": { "historical": 0, "projected": 0 },
      "currency": "JPY"
    },
    "trends": [{ "rank": 1, "name": "", "description": "", "impactLevel": "high|medium|low", "timeframe": "short-term|medium-term|long-term", "relevanceScore": 0-100, "opportunities": [], "threats": [] }],
    "technologicalChanges": [{ "technology": "", "adoptionRate": 0, "maturityLevel": "emerging|growing|mainstream|declining", "impact": "", "ourReadiness": "ready|partial|not-ready" }],
    "regulatoryLandscape": { "currentRegulations": [{ "name": "", "jurisdiction": "", "effectiveDate": "", "impact": "", "complianceCost": "high|medium|low" }], "upcomingRegulations": [{ "name": "", "jurisdiction": "", "effectiveDate": "", "impact": "", "complianceCost": "high|medium|low" }], "complianceRequirements": [], "riskLevel": "high|medium|low" },
    "marketMaturity": "emerging|growth|mature|declining"
  },
  "competitorAnalysis": {
    "totalCompetitors": 0,
    "directCompetitors": [{ "rank": 1, "name": "", "website": "", "businessModel": "", "targetCustomer": "", "priceRange": { "min": 0, "max": 0, "currency": "JPY", "model": "" }, "strengths": [], "weaknesses": [], "differentiators": [], "threatLevel": "high|medium|low", "overallScore": 0 }],
    "indirectCompetitors": [{ "rank": 1, "name": "", "website": "", "businessModel": "", "targetCustomer": "", "priceRange": { "min": 0, "max": 0, "currency": "JPY", "model": "" }, "strengths": [], "weaknesses": [], "differentiators": [], "threatLevel": "high|medium|low", "overallScore": 0 }],
    "potentialEntrants": [{ "rank": 1, "name": "", "website": "", "businessModel": "", "targetCustomer": "", "priceRange": { "min": 0, "max": 0, "currency": "JPY", "model": "" }, "strengths": [], "weaknesses": [], "differentiators": [], "threatLevel": "high|medium|low", "overallScore": 0 }],
    "pricingAnalysis": { "priceSegments": [{ "segment": "low|mid|high|premium", "priceRange": "", "competitorCount": 0, "representatives": [] }], "averagePrice": 0, "priceLeader": "", "pricingTrend": "increasing|stable|decreasing" },
    "competitiveLandscape": { "concentrationLevel": "fragmented|moderate|concentrated|monopolistic", "marketLeader": "", "marketLeaderShare": 0, "top3Share": 0, "entryBarriers": [{ "type": "", "level": "high|medium|low", "description": "", "ourPosition": "" }] }
  },
  "opportunityAnalysis": {
    "gapAnalysis": [{ "customerNeed": "", "currentSolutions": [], "unmetAspects": [], "opportunitySize": "high|medium|low", "ourFitScore": 0 }],
    "blueOceanAreas": [{ "rank": 1, "area": "", "description": "", "marketSize": "", "entryBarrier": "high|medium|low", "successProbability": "high|medium|low", "timeToMarket": "", "requiredInvestment": "", "keySuccessFactors": [], "risks": [], "leveragedStrengths": [] }],
    "differentiationPoints": [{ "point": "", "basedOnStrength": "", "competitorWeakness": "", "customerValue": "", "sustainability": "high|medium|low" }],
    "recommendedStrategy": "",
    "confidenceLevel": 0-100
  },
  "customerNeeds": {
    "primaryNeeds": [{ "rank": 1, "need": "", "affectedPopulation": "", "severity": "critical|high|medium|low", "currentSolution": "", "dissatisfactionAreas": [], "willingnessToPay": "high|medium|low" }],
    "latentNeeds": [],
    "painPoints": [{ "description": "", "frequency": "daily|weekly|monthly|occasionally", "impact": "high|medium|low", "existingSolutions": [], "solutionGaps": [] }],
    "customerSegments": [{ "name": "", "size": "", "characteristics": [], "needs": [], "currentSpending": "", "acquisitionDifficulty": "easy|moderate|difficult", "recommendedPriority": 1 }]
  },
  "handoff": {
    "recommendedSegments": [{ "segment": "", "priority": 1, "rationale": "", "marketSize": "", "competitionLevel": "low|medium|high" }],
    "primaryChallenge": "",
    "idealCustomerProfile": "",
    "avoidSegments": [],
    "keyQuestions": [],
    "nextPhaseReady": true,
    "handoffNotes": ""
  }
}`;
