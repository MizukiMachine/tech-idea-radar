export const SELF_ANALYSIS_SYSTEM_PROMPT = `あなたはプログラマー→プロダクト創業者への転換アナリストです。

ソフトウェアエンジニアが起業家として成功するための自己分析を専門とし、
技術資産をビジネス資源に変換する視点から分析を行います。

以下の5ステップ分析手法に従ってください:

1. **技術資産インベントリ** — 提供されたスキル・個人プロジェクト・OSS活動を4カテゴリに分類:
   - 配布チャネル（技術ブログ、OSS、SNSなど情報発信手段）
   - 信頼性シグナル（資格、GitHub Stars、コミュニティ実績など）
   - プロダクト原型（個人開発・社内ツールで既にユーザーがいるもの）
   - ドメイン知識（特定業界・技術領域の深い専門性）

2. **プロダクトビルダー適性評価** — 4軸で評価:
   - フルスタック力（フロント〜インフラまで自走できるか）
   - マーケティング意識（ユーザー獲得・ブランディングへの関心）
   - ドメイン専門性（特定領域での深い知見）
   - 既存オーディエンス（フォロワー、コミュニティ、ユーザーベース）

3. **SWOT導出** — プログラマー特化視点:
   - 強み = 技術的堀（再現困難な技術力・知識）
   - 弱み = 非技術ギャップ（営業・マーケティング・ファイナンス不足）
   - 機会 = 技術深さが武器になる市場（dev tools, AI SaaS, technical products）
   - 脅威 = スキルのコモディティ化（AIによる自動化、市場飽和）

4. **fitScore計算** — 推奨領域ごとに4軸で採点（各0-25点、合計0-100点）:
   - Technical Leverage (0-25): 技術的優位性をどれだけ活かせるか
   - Market Access (0-25): 既存ネットワーク・オーディエンスで市場に近いか
   - Execution Speed (0-25): 個人〜少人数でどれだけ迅速にMVPを作れるか
   - Passion Alignment (0-25): 興味・価値観との一致度
   - rationaleには各軸の得点内訳を必ず記載

5. **競合導出** — 推奨領域 × 技術ドメインの交差点から、具体的な既存製品・企業をリスト

情報が不足している場合は "情報不足" という文字列値を設定し、推測で補わないでください。

厳格なルール:
- 出力はJSONオブジェクト1つのみ。説明文やコメント、マークダウンは一切出力しない。
- すべての値は有効なJSON型（文字列は必ずダブルクォートで囲む）を使用する。
- JSONの外部にテキストを出力しない。`;

export const SELF_ANALYSIS_USER_TEMPLATE = `以下の情報をもとに、プログラマー特化の自己分析レポートをJSON形式で作成してください。

## 提供された情報

### キャリア履歴
{career_history}

### スキル
{skills}

### 実績
{achievements}

### ネットワーク
{network}

### 価値観
{values}

{personal_projects_section}
{tech_stack_detail_section}
{open_source_activity_section}
{product_builder_profile_section}

※ 上記のセクションのうち空のものは省略されているため、提供されている情報のみを用いて分析してください。

## 出力フォーマット

以下のJSONスキーマに従って出力してください。
analysisId はUUID形式、analyzedAt はISO 8601形式、dataQualityScore は0〜100の整数で出力してください。
uniqueCombination には、他の起業家と差別化できるスキルの組み合わせを自由記述してください。
handoffNotes には次フェーズへの引き継ぎメモを記述してください。
targetMarkets には推奨ターゲット市場を3つ、competitorCandidates には調査すべき競合を5つ、keyQuestions には次フェーズへの質問を記述してください。

{
  "metadata": {
    "analysisId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "analyzedAt": "2025-01-15T10:30:00Z",
    "analysisVersion": "1.0.0",
    "processingTime": 0,
    "dataQualityScore": 75
  },
  "careerAnalysis": {
    "timeline": [{ "year": 2020, "role": "", "keyAchievements": [], "skillsGained": [], "growthIndicator": "high|medium|low" }],
    "highlights": [],
    "trajectory": "ascending|stable|transitioning|mixed",
    "totalExperienceYears": 0,
    "industryExposure": []
  },
  "skillMap": {
    "technicalSkills": [{ "name": "", "level": 0, "marketValue": "high|medium|low", "growthPotential": "high|medium|low", "relevanceScore": 0 }],
    "businessSkills": [{ "name": "", "level": 0, "marketValue": "high|medium|low", "growthPotential": "high|medium|low", "relevanceScore": 0 }],
    "softSkills": [{ "name": "", "level": 0, "marketValue": "high|medium|low", "growthPotential": "high|medium|low", "relevanceScore": 0 }],
    "topStrengths": [],
    "developmentAreas": [],
    "uniqueCombination": ""
  },
  "achievementSummary": {
    "totalRevenueImpact": 0,
    "largestProjectScale": 0,
    "maxTeamManaged": 0,
    "topAchievements": [{ "rank": 1, "description": "", "impactScore": 0, "category": "" }],
    "quantifiableStrengths": []
  },
  "networkAnalysis": {
    "networkSize": 0,
    "networkStrength": "strong|moderate|developing",
    "industryReach": [],
    "onlinePresenceScore": 0,
    "keyAssets": [],
    "growthOpportunities": []
  },
  "valueAnalysis": {
    "corePriorities": [],
    "missionAlignment": "",
    "motivationProfile": {
      "intrinsic": [],
      "extrinsic": [],
      "primary": ""
    },
    "goalClarity": "clear|moderate|unclear"
  },
  "swotAnalysis": {
    "strengths": [{ "item": "", "importance": "high|medium|low", "actionability": "high|medium|low", "relatedFactors": [] }],
    "weaknesses": [{ "item": "", "importance": "high|medium|low", "actionability": "high|medium|low", "relatedFactors": [] }],
    "opportunities": [{ "item": "", "importance": "high|medium|low", "actionability": "high|medium|low", "relatedFactors": [] }],
    "threats": [{ "item": "", "importance": "high|medium|low", "actionability": "high|medium|low", "relatedFactors": [] }],
    "keyInsights": [],
    "strategicImplications": []
  },
  "directionRecommendation": {
    "recommendedAreas": [{ "area": "", "fitScore": 0, "rationale": "", "leveragedStrengths": [] }],
    "areasToAvoid": [{ "area": "", "riskLevel": "high|medium|low", "reason": "", "missingCapabilities": [] }],
    "optimalBusinessModel": [],
    "targetMarketHints": []
  },
  "completenessScore": {
    "overall": 0,
    "breakdown": { "career": 0, "skills": 0, "achievements": 0, "network": 0, "values": 0, "swot": 0 },
    "missingElements": [],
    "recommendations": []
  },
  "handoff": {
    "targetMarkets": ["", "", ""],
    "competitorCandidates": ["", "", "", "", ""],
    "keyQuestions": [""],
    "nextPhaseReady": true,
    "handoffNotes": ""
  }
}`;
