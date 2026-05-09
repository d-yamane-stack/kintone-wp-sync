import { NextResponse } from 'next/server';

const SITE_URLS = {
  jube:   process.env.GSC_SITE_URL_JUBE   || 'https://jube.co.jp/',
  nurube: process.env.GSC_SITE_URL_NURUBE || 'https://nuribe.jp/',
};

const DOMAIN_PATTERNS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};

// コラムURLパターン（/column/, /columns/, /blog/, /article/, /post/ など）
const COLUMN_PATH_PATTERNS = ['/column', '/columns', '/blog', '/article', '/post', '/news', '/topics'];

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GSC_CLIENT_ID,
      client_secret: process.env.GSC_CLIENT_SECRET,
      refresh_token: process.env.GSC_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth2 token error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

// GET /api/column-analysis/gsc?siteId=jube
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || 'jube';

    const siteUrl = SITE_URLS[siteId];
    if (!siteUrl) {
      return NextResponse.json({ success: false, error: '不明なサイトIDです' }, { status: 400 });
    }

    // 90日前〜昨日
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 89);

    const fmt = (d) => d.toISOString().slice(0, 10);

    const accessToken = await getAccessToken();

    // GSC searchAnalytics/query
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const gscRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate:  fmt(startDate),
          endDate:    fmt(endDate),
          dimensions: ['page'],
          rowLimit:   500,
        }),
      }
    );

    if (!gscRes.ok) {
      const errText = await gscRes.text();
      console.error('[API/column-analysis/gsc] GSC API error:', gscRes.status, errText.slice(0, 300));
      return NextResponse.json(
        { success: false, error: `GSC API エラー: ${gscRes.status} - ${errText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const gscData = await gscRes.json();
    const rows = gscData.rows || [];

    const domain = DOMAIN_PATTERNS[siteId];

    console.log(`[GSC] siteId=${siteId} 全rows:${rows.length}件 (期間: ${fmt(startDate)}〜${fmt(endDate)})`);

    // フィルタ: サイトドメイン + コラムURL
    const filtered = rows
      .filter(row => {
        const url = row.keys[0] || '';
        if (!url.includes(domain)) return false;
        // コラムURLパターンに一致するか確認
        return COLUMN_PATH_PATTERNS.some(pattern => url.includes(pattern));
      })
      .map(row => ({
        url:         row.keys[0],
        clicks:      row.clicks      || 0,
        impressions: row.impressions || 0,
        ctr:         row.ctr         || 0,
        position:    row.position    || 0,
      }));

    // コラムURLパターンが0件なら全URLを返す（パターン不一致の場合のフォールバック）
    const result = filtered.length > 0
      ? filtered
      : rows
          .filter(row => {
            const url = row.keys[0] || '';
            return url.includes(domain);
          })
          .map(row => ({
            url:         row.keys[0],
            clicks:      row.clicks      || 0,
            impressions: row.impressions || 0,
            ctr:         row.ctr         || 0,
            position:    row.position    || 0,
          }));

    // 0件なら権限エラーの可能性をヒント表示
    let hint = null;
    if (rows.length === 0) {
      hint = `Search Consoleの ${siteUrl} にアクセス権限がない可能性。OAuth認証したGoogleアカウントがこのプロパティの所有者または閲覧者として登録されているか確認してください。`;
    } else if (result.length === 0) {
      hint = `GSC全体では${rows.length}件取得できましたが、${domain}のコラムURL（/column等）に一致する記事が0件でした。`;
    }

    console.log(`[GSC] siteId=${siteId} フィルタ後:${result.length}件${hint ? ' / hint: ' + hint : ''}`);

    return NextResponse.json({
      success:  true,
      data:     result,
      total:    result.length,
      rawTotal: rows.length,
      hint,
    });
  } catch (err) {
    console.error('[API/column-analysis/gsc GET]', err);
    return NextResponse.json(
      { success: false, error: 'GSCデータ取得に失敗しました: ' + err.message },
      { status: 500 }
    );
  }
}
