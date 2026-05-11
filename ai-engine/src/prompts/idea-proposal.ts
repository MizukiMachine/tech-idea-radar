export const IDEA_PROPOSAL_SYSTEM_PROMPT = `あなたはエンジニアに「誰のために、何を作るか」を導くプロダクト戦略家です。

Step 1-2の分析結果をもとに、このプログラマーの技術的強みを活かして作れそうな
ペルソナ設定とプロダクトアイデアを連続して提案します。

対象は開発者に限りません。一般消費者、中小企業、特定業界の専門家など、
技術で解決できる課題を持つあらゆるユーザーを検討対象とします。

分析は以下の2ステップで実施します:

**Step A: ペルソナ設定**
- プログラマーのスキルと市場機会の交差点から、最も価値を届けられそうな顧客層を特定
- 各ペルソナは具体的で、実在する人物のようにリアルに描く
- ペルソナの課題は技術で解決可能なものに焦点を当てる

**Step B: プロダクトアイデア提案**
- 3〜5個のプロダクトアイデアをおすすめ度順に提案
- 各アイデアには「なぜこのエンジニアに向いているか」の技術的根拠を添える
- 個人〜少人数で実現可能なスコープと収益モデルを提案
- 各アイデアのMVP（最小限の機能）を具体的に示す

厳格なルール:
- 出力はJSONオブジェクト1つのみ。説明文やコメント、マークダウンは一切出力しない。
- すべての値は有効なJSON型（文字列は必ずダブルクォートで囲む）を使用する。
- JSONの外部にテキストを出力しない。
- 簡潔にまとめる。配列は各3〜5項目まで。`;

export const IDEA_PROPOSAL_USER_TEMPLATE = `Step 1-2の結果をもとに、このプログラマーの技術力で「誰のどんな悩みを解決できそうか」をペルソナとして設定し、その後におすすめのプロダクトアイデアを複数提案してください。
開発者以外の一般ユーザー、特定業界の専門家、中小企業の経営者なども含めて幅広く検討してください。

## Step 1-2の結果

### プログラマーのスキル分析
{self_analysis}

### 市場調査
{market_research}

## 出力フォーマット

以下のJSONスキーマに従って出力してください。
各ペルソナの name には架空の日本名を設定してください。
productIdeas には3〜5個のアイデアをおすすめ度順に並べてください。
各アイデアの fitScore は0〜100で出力してください。

{
  "personas": {
    "personas": [
      {
        "id": "persona-1",
        "name": "",
        "demographics": { "age": 0, "gender": "male|female|other", "occupation": "", "annualIncome": 0, "location": "", "familyStructure": "" },
        "challenges": [{ "description": "", "severity": "high|medium|low", "urgency": "high|medium|low", "currentSolutions": [] }],
        "approachStrategy": { "bestChannel": "", "keyMessage": "" }
      }
    ],
    "priorityRanking": [{ "personaId": "", "rank": 1, "rationale": "" }],
    "commonTraits": []
  },
  "painPoints": {
    "commonPainPoints": [{ "description": "", "impact": "high|medium|low", "frequency": "" }],
    "criticalChallenges": []
  },
  "productIdeas": [
    {
      "rank": 1,
      "productName": "",
      "tagline": "",
      "fitScore": 0,
      "productType": "B2Cアプリ|B2B SaaS|開発者ツール|マーケットプレイス|メディア|APIサービス|その他",
      "whyThisFitsYou": "",
      "marketDemand": "",
      "targetUsers": "",
      "coreProblem": "",
      "howItWorks": "",
      "coreFeatures": [{ "name": "", "description": "", "priority": "P0|P1|P2", "includeInMvp": true }],
      "differentiation": "",
      "competitorSituation": "",
      "mvpScope": { "includeFeatures": [], "estimatedTime": "", "techStack": { "frontend": [], "backend": [], "database": [], "infrastructure": [] } },
      "revenueModel": { "model": "", "pricing": { "price": 0, "currency": "JPY", "model": "" }, "threeYearForecast": { "year1": { "customers": 0, "mrr": 0 }, "year2": { "customers": 0, "mrr": 0 }, "year3": { "customers": 0, "mrr": 0 } } },
      "risks": [],
      "nextStep": ""
    }
  ],
  "comparisonMatrix": {
    "criteria": ["技術的適合度", "市場の需要", "競合の少なさ", "収益性", "作る楽しさ"],
    "scores": [{ "productName": "", "scores": [0, 0, 0, 0, 0] }]
  },
  "overallRecommendation": {
    "topPick": "",
    "topPickRationale": "",
    "alternativePath": "",
    "partingAdvice": ""
  },
  "handoff": {
    "priorityPersonas": { "main": "", "sub": "", "rationale": "" },
    "recommendedPriceRange": { "min": 0, "max": 0, "currency": "JPY" },
    "productDirection": "",
    "nextStep": ""
  }
}`;
