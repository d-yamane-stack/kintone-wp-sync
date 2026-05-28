'use strict';

/**
 * 解体（じゅうべえの解体・家屋解体/住宅解体専門）向けコラム生成プロンプト
 * promptKey: 'column_kaitai'
 */
const { buildGenericColumnPrompt } = require('./_columnGeneric');

function buildPrompt(params) {
  return buildGenericColumnPrompt(params, {
    company: 'じゅうべえの解体',
    role:    'ローコスト解体工事専門店「じゅうべえの解体」のウェブサイト向けコンテンツライター',
    region:  '千葉・茨城',
    focus:   '家屋解体・住宅解体・解体費用相場・解体工事の流れ・補助金/助成金・アスベスト・廃棄物処理・近隣対策・見積もり・空き家解体など、解体工事に関するテーマ全般',
    exclude: '新築・リフォーム・外壁塗装・中古住宅など解体工事以外のテーマ',
  });
}

module.exports = { buildPrompt };
