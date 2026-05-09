import { NextResponse } from 'next/server';

const GA4_PROPERTY_IDS = {
  jube:   process.env.GA4_PROPERTY_ID_JUBE   || '318862925',
  nurube: process.env.GA4_PROPERTY_ID_NURUBE || '324887163',
};

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

// GET /api/column-analysis/ga4?siteId=jube
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || 'jube';

    const propertyId = GA4_PROPERTY_IDS[siteId];
    if (!propertyId) {
      return NextResponse.json({ success: false, error: '不明なサイトIDです' }, { status: 400 });
    }

    // 90日前〜昨日
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 89);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const accessToken = await getAccessToken();

    // GA4 Data API - ページ別レポート
    const ga4Res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'activeUsers' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
          ],
          limit: 500,
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
      }
    );

    if (!ga4Res.ok) {
      const errText = await ga4Res.text();
      console.error('[API/column-analysis/ga4] GA4 API error:', ga4Res.status, errText.slice(0, 500));
      // 403の場合はGA4スコープ不足（GSCと同じリフレッシュトークンはGA4に使えない場合がある）
      const isAuthError = ga4Res.status === 403 || ga4Res.status === 401;
      return NextResponse.json(
        {
          success:   false,
          error:     `GA4 API エラー: ${ga4Res.status}`,
          authError: isAuthError,
          hint:      isAuthError
            ? 'GA4 Data APIへのアクセス権限が不足しています。Google AnalyticsでAPIアクセスを許可してください。'
            : null,
        },
        { status: 502 }
      );
    }

    const ga4Data = await ga4Res.json();
    const rows = ga4Data.rows || [];

    // コラムURLパターン
    const COLUMN_PATH_PATTERNS = ['/column', '/columns', '/blog', '/article', '/post', '/news', '/topics'];

    const data = rows
      .filter(row => {
        const path = row.dimensionValues?.[0]?.value || '';
        return COLUMN_PATH_PATTERNS.some(p => path.includes(p));
      })
      .map(row => {
        const path    = row.dimensionValues?.[0]?.value || '';
        const metrics = row.metricValues || [];
        return {
          pagePath:               path,
          sessions:               parseInt(metrics[0]?.value || '0', 10),
          pageViews:              parseInt(metrics[1]?.value || '0', 10),
          activeUsers:            parseInt(metrics[2]?.value || '0', 10),
          avgSessionDuration:     parseFloat(metrics[3]?.value || '0'),
          bounceRate:             parseFloat(metrics[4]?.value || '0'),
        };
      });

    return NextResponse.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error('[API/column-analysis/ga4 GET]', err);
    return NextResponse.json(
      { success: false, error: 'GA4データ取得に失敗しました: ' + err.message },
      { status: 500 }
    );
  }
}
