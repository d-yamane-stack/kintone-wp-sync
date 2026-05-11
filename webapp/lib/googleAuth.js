/**
 * Google OAuth2 アクセストークン取得（GSC / GA4 共通）
 */
export async function getGoogleAccessToken() {
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
