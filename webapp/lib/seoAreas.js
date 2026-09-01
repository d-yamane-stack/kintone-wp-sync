/**
 * SEOキーワードのエリア名 → 市区町村の変換。
 *
 * キーワードは「{テーマ} {エリア}」形式で登録されている（例: 「注文住宅 成田市」）。
 * 地図は市区町村の面で塗るため、キーワード末尾のエリア表記を実在の市区町村へ寄せる必要がある。
 * 表記ゆれ（鹿嶋/鹿島）、施設名（パルナ）、地域名（東総）、旧市名（佐原）が混在するため、
 * ここで一元的に吸収する。
 *
 * ⚠ 要確認の対応付け（実態と異なる場合はここを直す）:
 *   - パルナ … 稲敷市の商業施設として稲敷市に寄せている
 *   - 佐原   … 現在は香取市の一部
 *   - 東総   … 地域名。旭市・銚子市・匝瑳市に展開している
 *   - 若葉   … 千葉市若葉区。GeoJSONが区単位を持たない場合は千葉市に丸める
 */

// エリア表記 → 市区町村。部分一致で使うため、長い表記から順に並べる
// （「鹿嶋」より先に「鹿嶋・神栖」等が来ないよう、単独トークンのみを持つ）。
const AREA_TO_CITY = [
  // ─ 千葉県 ─
  { token: '千葉若葉', pref: '千葉県', city: '千葉市若葉区', fallbackCity: '千葉市' },
  { token: '若葉',     pref: '千葉県', city: '千葉市若葉区', fallbackCity: '千葉市' },
  { token: '成田',     pref: '千葉県', city: '成田市' },
  { token: '佐倉',     pref: '千葉県', city: '佐倉市' },
  { token: '柏',       pref: '千葉県', city: '柏市' },
  { token: '東金',     pref: '千葉県', city: '東金市' },
  { token: '八街',     pref: '千葉県', city: '八街市' },
  { token: '銚子',     pref: '千葉県', city: '銚子市' },
  { token: '匝瑳',     pref: '千葉県', city: '匝瑳市' },
  { token: '香取',     pref: '千葉県', city: '香取市' },
  { token: '佐原',     pref: '千葉県', city: '香取市' },   // 佐原は香取市の一部
  { token: '旭',       pref: '千葉県', city: '旭市' },
  { token: '千葉',     pref: '千葉県', city: '千葉市' },

  // ─ 茨城県 ─
  { token: '鹿嶋',     pref: '茨城県', city: '鹿嶋市' },
  { token: '鹿島',     pref: '茨城県', city: '鹿嶋市' },   // 表記ゆれ
  { token: '神栖',     pref: '茨城県', city: '神栖市' },
  { token: '稲敷',     pref: '茨城県', city: '稲敷市' },
  { token: 'パルナ',   pref: '茨城県', city: '稲敷市' },   // ⚠ 商業施設名。要確認
  { token: '牛久',     pref: '茨城県', city: '牛久市' },
  { token: '龍ヶ崎',   pref: '茨城県', city: '龍ケ崎市' },
  { token: '龍ケ崎',   pref: '茨城県', city: '龍ケ崎市' },
  { token: '阿見',     pref: '茨城県', city: '阿見町' },
  { token: '取手',     pref: '茨城県', city: '取手市' },
  { token: '守谷',     pref: '茨城県', city: '守谷市' },
  { token: '水戸',     pref: '茨城県', city: '水戸市' },
  { token: '潮来',     pref: '茨城県', city: '潮来市' },
  { token: '行方',     pref: '茨城県', city: '行方市' },
  { token: '茨城',     pref: '茨城県', city: '水戸市' },   // 「茨城・水戸」店の総称
];

// 地域名 → 複数市への展開（面で塗る際、地域名キーワードは構成市すべてに配分する）
const REGION_TO_CITIES = {
  東総: [
    { pref: '千葉県', city: '旭市' },
    { pref: '千葉県', city: '銚子市' },
    { pref: '千葉県', city: '匝瑳市' },
  ],
};

// 長い表記を先に判定するための並び（「千葉若葉」が「千葉」より先に当たるように）
const SORTED_TOKENS = [...AREA_TO_CITY].sort((a, b) => b.token.length - a.token.length);
const SORTED_REGIONS = Object.keys(REGION_TO_CITIES).sort((a, b) => b.length - a.length);

/**
 * キーワード文字列から対象の市区町村を求める。
 * 地域名（東総など）は複数市に展開されるため、常に配列で返す。
 * @returns {{pref:string, city:string, fallbackCity?:string}[]} 該当なしは空配列
 */
export function citiesForKeyword(keyword) {
  const kw = keyword || '';
  for (const region of SORTED_REGIONS) {
    if (kw.includes(region)) return REGION_TO_CITIES[region];
  }
  for (const e of SORTED_TOKENS) {
    if (kw.includes(e.token)) {
      return [{ pref: e.pref, city: e.city, fallbackCity: e.fallbackCity }];
    }
  }
  return [];
}

/**
 * キーワードからテーマ部分（エリア表記を除いた部分）を取り出す。
 * 例: 「注文住宅 成田市」→「注文住宅」、「土地探し 注文住宅 旭市」→「土地探し 注文住宅」
 * エリア表記が見つからない場合はキーワード全体をテーマとして扱う。
 */
export function themeForKeyword(keyword) {
  const kw = (keyword || '').trim();
  const tokens = [...SORTED_REGIONS, ...SORTED_TOKENS.map(e => e.token)]
    .sort((a, b) => b.length - a.length);
  for (const t of tokens) {
    const idx = kw.lastIndexOf(t);
    if (idx <= 0) continue;                       // 先頭一致はテーマ自体なので除外
    // 「成田市」のように市/区/町/村が続く場合もまとめて落とす
    const rest = kw.slice(idx + t.length).replace(/^[市区町村]/, '');
    if (rest.trim() !== '') continue;             // 末尾でなければエリア表記ではない
    return kw.slice(0, idx).trim();
  }
  return kw;
}

/** 画面のフィルター用に、キーワード一覧からテーマの一覧を作る */
export function extractThemes(keywords) {
  const set = new Set();
  (keywords || []).forEach(k => {
    const t = themeForKeyword(typeof k === 'string' ? k : k.keyword);
    if (t) set.add(t);
  });
  return [...set].sort();
}
