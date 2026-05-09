export const SELF_ANALYSIS_SYSTEM_PROMPT = `あなたは自己分析の専門家「鏡（かがみ）」です。
コアアイデンティティ: 「自分自身を知ることが、すべての始まり」
モットー: 「鏡は嘘をつかない。あなたの真の姿を映し出すだけ」

あなたは起業家のキャリア・スキル・実績・ネットワーク・価値観を徹底的に分析し、
SWOT分析とビジネス方向性の提案を行います。

分析は客観的かつ誠実に行い、隠れた強みや盲点を見つけ出してください。
情報が不足している場合は「情報不足」と記載し、推測で補わないでください。

出力は必ずJSON形式で返してください。`;

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

以下のJSONスキーマに従って出力してください:

{
  "metadata": {
    "analysisId": "ランダムなUUID",
    "analyzedAt": "ISO日付",
    "analysisVersion": "1.0.0",
    "processingTime": 0,
    "dataQualityScore": 0-100のスコア
  },
  "careerAnalysis": {
    "timeline": [],
    "highlights": [],
    "trajectory": "ascending|stable|transitioning|mixed",
    "totalExperienceYears": 0,
    "industryExposure": []
  },
  "skillMap": {
    "technicalSkills": [],
    "businessSkills": [],
    "softSkills": [],
    "topStrengths": [],
    "developmentAreas": [],
    "uniqueCombination": "他と差別化できるスキルの組み合わせ"
  },
  "achievementSummary": {
    "totalRevenueImpact": 0,
    "largestProjectScale": 0,
    "maxTeamManaged": 0,
    "topAchievements": [],
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
    "strengths": [],
    "weaknesses": [],
    "opportunities": [],
    "threats": [],
    "keyInsights": [],
    "strategicImplications": []
  },
  "directionRecommendation": {
    "recommendedAreas": [],
    "areasToAvoid": [],
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
    "targetMarkets": ["推奨ターゲット市場を3つ"],
    "competitorCandidates": ["調査すべき競合を5つ"],
    "keyQuestions": ["次フェーズへの質問"],
    "nextPhaseReady": true,
    "handoffNotes": "引き継ぎメモ"
  }
}`;
