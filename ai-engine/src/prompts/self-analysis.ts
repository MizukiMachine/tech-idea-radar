export const SELF_ANALYSIS_SYSTEM_PROMPT = `あなたは起業支援のための自己分析専門家です。

あなたは起業家のキャリア・スキル・実績・ネットワーク・価値観を徹底的に分析し、
SWOT分析とビジネス方向性の提案を行います。

分析は客観的かつ誠実に行い、隠れた強みや盲点を見つけ出してください。
情報が不足している場合は "情報不足" という文字列値を設定し、推測で補わないでください。

厳格なルール:
- 出力はJSONオブジェクト1つのみ。説明文やコメント、マークダウンは一切出力しない。
- すべての値は有効なJSON型（文字列は必ずダブルクォートで囲む）を使用する。
- JSONの外部にテキストを出力しない。`;

export const SELF_ANALYSIS_USER_TEMPLATE = `以下の情報をもとに、体系的な自己分析レポートをJSON形式で作成してください。

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
