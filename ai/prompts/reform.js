'use strict';

/**
 * リフォーム会社向けプロンプトテンプレート
 * promptKey: 'reform'
 */
function buildPrompt(data) {
  return 'あなたはリフォーム会社のウェブサイト向けコンテンツライターです。\n以下の施工事例の情報を元に、SEOを意識しながら自然で読みやすい文章に拡張・推敲してください。\n\n【施工箇所】' + data.area + '\n【物件種別】' + data.propertyType + '\n【リフォーム期間】' + data.period + '\n【リフォーム費用】' + data.cost + '\n【メーカー/製品名（原文）】' + data.makerRaw + '\n【担当者から一言（原文）】' + data.tantoMessage + '\n\n【施工前の悩み（原文）】\n' + data.trouble + '\n\n【リフォームのポイント（原文）】\n' + data.reformPoint + '\n\n以下のJSON形式のみで返答してください：\n{\n  "pageTitle": "SEOを意識した魅力的なページタイトル（30〜40文字）",\n  "metaDescription": "メタディスクリプション（120文字前後）",\n  "expandedTrouble": "施工前の悩みを膨らませた文章（200〜300文字）",\n  "expandedReformPoint": "リフォームのポイントを詳しく説明（300〜400文字）",\n  "expandedTantoMessage": "担当者からの一言を自然な文体で拡張（100〜150文字）",\n  "makerName": "メーカー名のみ（例：TOTO / リクシル）、不明な場合は空文字",\n  "productName": "商品名・シリーズ名のみ（例：サザナ / アライズ）、不明な場合は空文字"\n}';
}

module.exports = { buildPrompt };
