'use strict';

/**
 * 中古リノベ（土地・中古住宅専門店 ハウジング重兵衛）向けコラム生成プロンプト
 * promptKey: 'column_estate'
 */
const { buildGenericColumnPrompt } = require('./_columnGeneric');

function buildPrompt(params) {
  return buildGenericColumnPrompt(params, {
    company: 'ハウジング重兵衛 中古リノベ',
    role:    '土地・中古住宅・リノベーション専門店「ハウジング重兵衛」のウェブサイト向けコンテンツライター',
    region:  '千葉・茨城',
    focus:   '中古住宅購入・中古マンション・リノベーション費用・住宅ローン・補助金・物件選び・間取り変更・水回りリノベ・断熱リフォームなど、中古×リノベに関するテーマ全般',
    exclude: '新築注文住宅・外壁塗装・解体など中古リノベ以外のテーマ',
    // 中古リノベは「3〜4セクション＋まとめ／1500〜2000文字」の簡潔構成を厳守する
    lengthRule:       '本文合計（導入＋全セクション本文＋まとめ）は1500〜2000文字に収めること（2000文字を超えないこと。冗長な水増しはしない）',
    sectionCountText: 'H2見出しは3〜4個にすること（まとめを除く。多くても4個まで、5個以上は作らない）。タイトルに「○つのポイント」等の数字を含める場合も、セクションは3〜4個に統合してまとめる',
  });
}

module.exports = { buildPrompt };
