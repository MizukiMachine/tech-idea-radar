export const PRODUCT_CONCEPT_SYSTEM_PROMPT = `あなたはプロダクト戦略の専門家「概（がい）」です。
ペルソナ設計と市場調査の結果をもとに、市場で勝てるプロダクトコンセプトを設計します。
USP（独自の価値提案）、ビジネスモデルキャンバス、収益モデルを駆使してプロダクトの骨格を構築します。

競合にない独自性を明確にし、持続可能な競争優位性を構築できるコンセプトを提案してください。
出力は必ずJSON形式で返してください。`;

export const PRODUCT_CONCEPT_USER_TEMPLATE = `Phase 2-3の結果をもとに、市場で勝てるプロダクトコンセプトを設計してください。

## 市場調査（Phase 2）
{market_research}

## ペルソナ設定（Phase 3）
{persona_data}

## 出力フォーマット

以下のJSONスキーマに従って出力してください:

{
  "productConcept": {
    "productName": "",
    "tagline": "",
    "coreValuePropositions": [],
    "targetCustomers": [],
    "coreFeatures": [{ "name": "", "description": "", "priority": "P0|P1|P2", "complexity": "High|Medium|Low", "includeInMvp": true }],
    "differentiatingFeatures": [],
    "usp": { "mainUsp": "", "supportingUsps": [], "competitiveAdvantage": "" },
    "elevatorPitch": ""
  },
  "businessModelCanvas": {
    "customerSegments": [{ "name": "", "description": "", "marketSize": "", "priority": 1 }],
    "valuePropositions": [{ "type": "functional|emotional|social", "proposition": "", "customerBenefit": "" }],
    "channels": [{ "name": "", "stage": "", "effectiveness": "high|medium|low" }],
    "customerRelationships": [{ "type": "", "description": "" }],
    "revenueStreams": [{ "name": "", "type": "", "pricing": { "model": "", "price": 0, "currency": "JPY" }, "contributionPercentage": 0 }],
    "keyResources": [{ "type": "", "description": "", "necessity": "critical|important|nice-to-have" }],
    "keyActivities": [{ "category": "", "description": "" }],
    "keyPartnerships": [{ "name": "", "type": "", "benefit": "" }],
    "costStructure": { "type": "cost-driven|value-driven", "fixedCosts": [{ "item": "", "amount": 0 }], "variableCosts": [{ "item": "", "unitCost": 0 }], "totalMonthlyCost": 0 }
  },
  "revenueModel": {
    "modelType": "",
    "pricingStrategy": { "method": "", "rationale": "" },
    "revenueStreams": [{ "name": "", "type": "", "pricing": { "model": "", "price": 0, "currency": "JPY" }, "contributionPercentage": 0 }],
    "threeYearForecast": {
      "year1": { "year": 1, "customers": 0, "mrr": 0, "arr": 0, "churnRate": 0 },
      "year2": { "year": 2, "customers": 0, "mrr": 0, "arr": 0, "churnRate": 0 },
      "year3": { "year": 3, "customers": 0, "mrr": 0, "arr": 0, "churnRate": 0 }
    },
    "unitEconomics": { "arpu": 0, "ltv": 0, "cac": 0, "ltvCacRatio": 0, "paybackPeriodMonths": 0 }
  },
  "handoff": {
    "coreFeatures": [{ "name": "", "description": "", "priority": "P0|P1|P2", "complexity": "High|Medium|Low", "includeInMvp": true }],
    "mvpScope": { "includeFeatures": [], "excludeFeatures": [], "releaseTarget": "" },
    "techStackCandidates": { "frontend": [], "backend": [], "database": [], "infrastructure": [] }
  }
}`;
