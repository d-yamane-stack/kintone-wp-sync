'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * 文字列を正規化（NFKC + 記号・空白除去）
 */
function normalize(str) {
  return (str || '')
    .normalize('NFKC')
    .replace(/[！!？?｜\s　。、・「」『』【】〈〉\[\]()（）:：,，.．～〜\-−―]+/g, '');
}

/**
 * 2文字列のJaccard類似度（文字集合ベース）
 * 値域: 0.0〜1.0
 */
function jaccardSim(a, b) {
  var setA = new Set(a.split(''));
  var setB = new Set(b.split(''));
  var intersection = 0;
  setA.forEach(function(c) { if (setB.has(c)) intersection++; });
  var union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * コラムタイトルに最もマッチする画像ファイルを探す。
 *
 * @param {string} pageTitle   - 生成されたコラムタイトル（例: "キッチンの...｜千葉県..."）
 * @param {string} folderPath  - 画像格納フォルダのパス
 * @returns {string|null}      - マッチした画像のフルパス。見つからない場合 null。
 */
function findColumnImage(pageTitle, folderPath) {
  if (!pageTitle || !folderPath) return null;

  try {
    var files = fs.readdirSync(folderPath).filter(function(f) {
      return /\.(png|jpg|jpeg|webp)$/i.test(f);
    });

    if (files.length === 0) {
      console.log('  [コラム画像] フォルダに画像が見つかりません: ' + folderPath);
      return null;
    }

    // ｜より前のキャッチコピー部分で照合（SEO末尾は除外）
    var catchPhrase = pageTitle.split('｜')[0];
    var normalizedTitle = normalize(catchPhrase);

    var best = null;
    var bestScore = 0;
    var bestFile = '';

    files.forEach(function(filename) {
      // サブフォルダ・zip等は除外
      var ext = path.extname(filename).toLowerCase();
      if (ext === '.zip') return;

      var basename = path.basename(filename, path.extname(filename));
      var normalizedFile = normalize(basename);
      var score = jaccardSim(normalizedTitle, normalizedFile);
      if (score > bestScore) {
        bestScore = score;
        best = path.join(folderPath, filename);
        bestFile = filename;
      }
    });

    // 閾値 0.20 以上でマッチとみなす
    var THRESHOLD = 0.20;
    if (bestScore >= THRESHOLD && best) {
      console.log('  [コラム画像] マッチ: "' + bestFile + '" (スコア:' + bestScore.toFixed(2) + ')');
      return best;
    }

    console.log('  [コラム画像] マッチなし (最高スコア:' + bestScore.toFixed(2) + ' / タイトル:"' + catchPhrase + '")');
    return null;

  } catch (err) {
    console.warn('  [コラム画像] フォルダ読み込みエラー: ' + err.message);
    return null;
  }
}

module.exports = { findColumnImage };
