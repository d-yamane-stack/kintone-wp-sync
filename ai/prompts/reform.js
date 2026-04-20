'use strict';

/**
 * リフォーム会社向けプロンプトテンプレート
 * promptKey: 'reform'
 */
function buildPrompt(data) {
  var areaStr = Array.isArray(data.rawArea) ? data.rawArea.join('/') : (data.area || '');

  return 'あなたはリフォーム会社のウェブサイト向けコンテンツライターです。\n以下の施工事例の情報を元に、SEOを意識しながら自然で読みやすい文章に拡張・推敲してください。\n\n【施工箇所】' + data.area + '\n【物件種別】' + data.propertyType + '\n【リフォーム期間】' + data.period + '\n【リフォーム費用】' + data.cost + '\n【メーカー/製品名（原文）】' + data.makerRaw + '\n【担当者から一言（原文）】' + (data.tantoMessage || '（記載なし）') + '\n\n【施工前の悩み（原文）】\n' + data.trouble + '\n\n【リフォームのポイント（原文）】\n' + data.reformPoint + '\n\n---\n\n## ページタイトルの作り方\n\nタイトルは必ず以下の形式にしてください：\n\n  キャッチーなフレーズ｜' + data.city + areaStr + 'リフォーム\n\n【形式のルール】\n- ｜の前：SEO・AIOを意識した魅力的なキャッチコピー（20〜30文字）\n- ｜の後：「' + data.city + '」+「施工箇所」+「リフォーム」で固定\n- 施工箇所が複数ある場合は / でつなぐ（例：LDK/浴室、洗面/トイレ）\n- 施工箇所が多すぎる場合は主要な2〜3箇所に絞る\n\n【実際の公開済みタイトル例（この形式に合わせること）】\n- 爽やか水色で一新したトイレ短期リフォーム｜千葉県旭市トイレリフォーム\n- 展示品で叶えた清潔トイレへ　掃除が楽になる交換リフォーム｜千葉県富里市トイレリフォーム\n- 壁をなくして開放感UP！温かいLDKと快適バスへ｜千葉県匝瑳市LDK/浴室リフォーム\n\n今回の施工箇所（' + areaStr + '）と地域（' + data.city + '）を使い、上記の例と同じ形式でタイトルを作成してください。\n\n---\n\n以下のJSON形式のみで返答してください：\n{\n  "pageTitle": "上記形式に従ったタイトル（キャッチーなフレーズ｜' + data.city + areaStr + 'リフォーム）",\n  "metaDescription": "メタディスクリプション（120文字前後）",\n  "expandedTrouble": "施工前の悩みを膨らませた文章（200〜300文字）",\n  "expandedReformPoint": "リフォームのポイントを詳しく説明（300〜400文字）",\n  "expandedTantoMessage": "担当者からの一言を温かみのある自然な文体で拡張した文章（150〜200文字）。原文が短くても施工内容や担当者の思いを汲み取って膨らませること。原文が「記載なし」の場合は施工内容に合わせた担当者コメントを創作する。",\n  "makerName": "メーカー名のみ（例：TOTO / リクシル）、不明な場合は空文字",\n  "productName": "商品名・シリーズ名のみ（例：サザナ / アライズ）、不明な場合は空文字"\n}';
}

module.exports = { buildPrompt };
