/**
 * サイト別カラー・アバター設定
 * ダッシュボード・コラム・施工事例の各画面で共通使用
 */
export const SITE_META = {
  jube: {
    color:     '#2563eb',
    bg:        '#eff6ff',
    border:    '#bfdbfe',
    label:     '重',
    name:      'ハウジング重兵衛',
    shortName: '重兵衛',
    order:     1,
  },
  nurube: {
    color:     '#c2410c',
    bg:        '#fff7ed',
    border:    '#fed7aa',
    label:     '塗',
    name:      '塗装屋ぬりべえ',
    shortName: 'ぬりべえ',
    order:     2,
  },
  'funs-life-home': {
    color:      '#059669',
    bg:         '#ecfdf5',
    border:     '#a7f3d0',
    label:      '新',
    name:       'funs life home',
    shortName:  '新築',
    order:      3,
    // 非WPサイト: WP投稿ではなく貼付用コードを生成して表示する
    outputMode: 'paste',
  },
  estate: {
    color:     '#7c3aed',
    bg:        '#f5f3ff',
    border:    '#ddd6fe',
    label:     '古',
    name:      '中古リノベ',
    shortName: '中古',
    order:     4,
  },
  kaitai: {
    color:     '#e11d48',
    bg:        '#fff1f2',
    border:    '#fecdd3',
    label:     '解',
    name:      '解体',
    shortName: '解体',
    order:     5,
  },
};

export const DEFAULT_SITE_META = {
  color:  '#71717a',
  bg:     '#f4f4f5',
  border: '#d4d4d8',
  label:  '?',
  name:   '不明',
};

/** siteId からメタ情報を取得 */
export function getSiteMeta(siteId) {
  return SITE_META[siteId] || DEFAULT_SITE_META;
}

/**
 * サイトアバター（丸いカラー文字バッジ）のインラインスタイルセット
 * @param {string} siteId
 * @param {number} [size=22]
 */
export function siteAvatarStyle(siteId, size = 22) {
  const m = getSiteMeta(siteId);
  return {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          size,
    height:         size,
    borderRadius:   '50%',
    background:     m.bg,
    border:         '1px solid ' + m.border,
    color:          m.color,
    fontSize:       Math.round(size * 0.48),
    fontWeight:     700,
    flexShrink:     0,
    lineHeight:     1,
  };
}
