'use strict';

/**
 * ガレージ倉庫（ガレージ&農業倉庫）向けコラム生成プロンプト
 * promptKey: 'column_warehousegarage'
 */
const { buildGenericColumnPrompt } = require('./_columnGeneric');

function buildPrompt(params) {
  return buildGenericColumnPrompt(params, {
    company: 'ガレージ&農業倉庫',
    role:    'ガレージ・農業倉庫の建築/施工専門店のウェブサイト向けコンテンツライター',
    region:  '千葉・茨城',
    focus:   'ガレージ建築・農業倉庫・車庫・物置・鉄骨造/テント倉庫・建築費用相場・固定資産税・確認申請・用途別の選び方など、ガレージ/倉庫に関するテーマ全般',
    exclude: '新築住宅・リフォーム・外壁塗装・解体などガレージ/倉庫以外のテーマ',
  });
}

module.exports = { buildPrompt };
