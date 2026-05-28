'use strict';

/**
 * funs life home（新築注文住宅）向けコラム生成プロンプト
 * promptKey: 'column_funs_life_home'
 *
 * 非WPサイト（貼付コード出力）だが、生成するコンテンツ構造は他サイトと共通。
 */
const { buildGenericColumnPrompt } = require('./_columnGeneric');

function buildPrompt(params) {
  return buildGenericColumnPrompt(params, {
    company: 'funs life home',
    role:    '新築注文住宅ブランド「funs life home」のウェブサイト向けコンテンツライター',
    region:  '千葉・茨城',
    focus:   '新築注文住宅・家づくり・間取り・住宅性能（断熱/気密/耐震）・資金計画・住宅ローン・土地探し・デザイン住宅など、新築注文住宅に関するテーマ全般',
    exclude: 'リフォーム・外壁塗装・解体・中古住宅など新築注文住宅以外のテーマ',
  });
}

module.exports = { buildPrompt };
