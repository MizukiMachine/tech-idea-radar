export const PERSONA_SYSTEM_PROMPT = `あなたは顧客インサイトの専門家「人香（ひとか）」です。
市場調査の結果をもとに、ターゲット顧客の詳細なペルソナを3-5人設定し、カスタマージャーニーマップを作成します。
モットー: 「顧客の心の中に入り込むことが、最高のプロダクトを作る第一歩」

各ペルソナは具体的で、実在する人物のようにリアルに描いてください。
デモグラフィックだけでなく、心理的側面・ライフスタイル・購買行動まで深く分析してください。
出力は必ずJSON形式で返してください。`;

export const PERSONA_USER_TEMPLATE = `Phase 1-2の結果をもとに、ターゲット顧客の詳細なペルソナを3-5人設定し、カスタマージャーニーを描いてください。

## Phase 1-2の結果

### 自己分析
{self_analysis}

### 市場調査
{market_research}

## 出力フォーマット

以下のJSONスキーマに従って出力してください。
各ペルソナの name には架空の日本名を設定してください。
deviceUsage は1日あたりの使用時間（時間単位、小数可）で出力してください。

{
  "personaSheet": {
    "personas": [
      {
        "id": "persona-1",
        "name": "",
        "demographics": { "age": 0, "gender": "male|female|other", "occupation": "", "annualIncome": 0, "location": "", "familyStructure": "" },
        "lifestyle": { "weekdaySchedule": "", "weekendActivities": "", "hobbies": [], "deviceUsage": { "smartphone": 0, "pc": 0 } },
        "psychographics": { "workValues": [], "spendingHabits": "", "selfInvestmentAttitude": "", "fears": [], "desiredFuture": "" },
        "challenges": [{ "description": "", "severity": "high|medium|low", "urgency": "high|medium|low", "currentSolutions": [], "frustrations": [] }],
        "informationSources": [{ "channel": "", "usage": "", "trustLevel": "high|medium|low" }],
        "buyingBehavior": { "decisionSpeed": "quick|careful", "priceSensitivity": "high|medium|low", "researchDepth": "thorough|minimal", "wordOfMouthImportance": "high|medium|low" },
        "approachStrategy": { "bestChannel": "", "keyMessage": "", "avoidApproach": "" }
      }
    ],
    "priorityRanking": [{ "personaId": "", "rank": 1, "rationale": "" }],
    "commonTraits": []
  },
  "customerJourneyMap": {
    "journeys": [{ "personaId": "", "stages": [{ "stage": "awareness|interest|consideration|purchase|retention|advocacy", "actions": [], "thoughts": [], "emotions": { "level": 0, "description": "" }, "touchpoints": [], "challenges": [], "opportunities": [] }] }],
    "criticalTouchpoints": [],
    "improvementOpportunities": []
  },
  "painPointAnalysis": {
    "byPersona": [{ "personaId": "", "personaName": "", "topPainPoints": [], "idealSolution": "", "willingnessToPay": "" }],
    "commonPainPoints": [{ "description": "", "impact": "high|medium|low", "frequency": "" }]
  },
  "handoff": {
    "priorityPersonas": { "main": "persona-id", "sub": "persona-id", "rationale": "" },
    "criticalChallenges": [],
    "productDirection": "",
    "recommendedPriceRange": { "min": 0, "max": 0, "currency": "JPY" }
  }
}`;
