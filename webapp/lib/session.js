/**
 * セッショントークンの発行・検証（HMAC-SHA256 署名 + 有効期限）
 *
 * 以前は「SESSION_SECRET の文字列そのもの」をCookieに入れていたため、
 * 値が1つ漏れる（＝ソースに直書きされている）だけで誰でもログインを迂回できた。
 * ここでは秘密鍵そのものはCookieに出さず、署名だけを載せる。
 *
 * トークン形式:  <有効期限のUNIX秒>.<HMAC-SHA256(有効期限, SESSION_SECRET) の base64url>
 *
 * middleware.js（Edge ランタイム）と route handler（Node ランタイム）の
 * 両方から使うため、Buffer を使わず Web Crypto (globalThis.crypto.subtle) のみで実装する。
 */

export const SESSION_COOKIE = 'rw_session';

/** セッション有効期間（30日） */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * SESSION_SECRET を返す。未設定なら null。
 * フォールバック値は意図的に持たない —— 未設定なら認証を通さないのが正しい挙動。
 */
export function getSessionSecret() {
  const s = process.env.SESSION_SECRET;
  return s && s.length > 0 ? s : null;
}

function base64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

/** 長さに依存しない定数時間比較（タイミング攻撃対策） */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * セッショントークンを発行する。
 * @param {string} secret - SESSION_SECRET
 * @param {number} [maxAge=SESSION_MAX_AGE] - 有効期間（秒）
 */
export async function createSessionToken(secret, maxAge = SESSION_MAX_AGE) {
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const payload = String(exp);
  return payload + '.' + (await sign(payload, secret));
}

/**
 * セッショントークンを検証する。
 * 署名が一致し、かつ有効期限内なら true。
 * @returns {Promise<boolean>}
 */
export async function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);

  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;

  return timingSafeEqual(given, await sign(payload, secret));
}
