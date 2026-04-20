/**
 * サイト別カラー・アバター設定
 * ダッシュボード・コラム・施工事例の各画面で共通使用
 */
export const SITE_META = {
  jube: {
    color:  '#60a5fa',
    bg:     'rgba(96,165,250,0.13)',
    border: 'rgba(96,165,250,0.35)',
    label:  '重',
    name:   'ハウジング重兵衛',
  },
  nurube: {
    color:  '#fb923c',
    bg:     'rgba(251,146,60,0.13)',
    border: 'rgba(251,146,60,0.35)',
    label:  '塗',
    name:   '塗装屋ぬりべえ',
  },
};

export const DEFAULT_SITE_META = {
  color:  '#94a3b8',
  bg:     'rgba(148,163,184,0.10)',
  border: 'rgba(148,163,184,0.30)',
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
    fontSize:       Math.round(size * 0.5),
    fontWeight:     700,
    flexShrink:     0,
    lineHeight:     1,
  };
}
