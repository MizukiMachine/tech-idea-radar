export interface RssArticleSummaryPolicy {
  minItems: number;
  maxItems: number;
  minTotalChars: number;
  maxTotalChars: number;
  maxItemChars: number;
  minJapaneseChars: number;
  minJapaneseToLatinRatio: number;
}

export const RSS_ARTICLE_SUMMARY_POLICY: RssArticleSummaryPolicy = {
  minItems: 3,
  maxItems: 6,
  minTotalChars: 240,
  maxTotalChars: 1200,
  maxItemChars: 260,
  minJapaneseChars: 120,
  minJapaneseToLatinRatio: 0.35,
};

export function renderRssArticleSummaryPolicy(policy = RSS_ARTICLE_SUMMARY_POLICY): string {
  return [
    `- summaryJaは、読者が元記事を読まなくても記事の流れと重要点を把握できるように、${policy.minItems}〜${policy.maxItems}項目の箇条書きにすること。`,
    `- summaryJa全体は${policy.minTotalChars}〜${policy.maxTotalChars}字程度を目安にすること。`,
    `- 各項目は必ず「・」で始め、項目ごとに必ず改行すること。1項目は${policy.maxItemChars}字以内にすること。`,
    '- 箇条書き各項目の末尾には「。」や「.」などの句点を付けないこと。',
  ].join('\n');
}

export function renderRssArticleSummaryRepairPolicy(policy = RSS_ARTICLE_SUMMARY_POLICY): string {
  return [
    renderRssArticleSummaryPolicy(policy),
    `- 検証エラーが箇条書き数の場合は、項目を統合または分割して必ず${policy.minItems}〜${policy.maxItems}項目に収めること。項目数上限を超える場合は近い論点を統合して上限以内に圧縮すること。`,
    `- 検証エラーが文字数不足の場合は、入力から読み取れる背景、何が起きたか、開発者やプロダクト担当者への示唆を分けて補い、${policy.minTotalChars}字以上にすること。`,
  ].join('\n');
}
