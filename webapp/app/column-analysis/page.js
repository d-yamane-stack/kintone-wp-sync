'use client';

import { useState, useCallback, useEffect } from 'react';
import { SITE_META, getSiteMeta } from '@/lib/siteMeta';

const SITES = Object.entries(SITE_META)
  .sort((a, b) => (a[1].order || 99) - (b[1].order || 99))
  .map(([siteId, meta]) => ({ siteId, name: meta.name, shortName: meta.shortName }));

// サイトIDごとのWPドメイン（クライアント側から直接アクセス）
const WP_DOMAINS = { jube: 'jube.co.jp', nurube: 'nuribe.jp' };

// ブラウザから直接WP REST APIを呼び出す（日本IPなのでXServerブロック回避）
async function fetchWpPostsFromBrowser(siteId) {
  const domain = WP_DOMAINS[siteId];
  if (!domain) return [];
  const results = [];
  try {
    for (let page = 1; page <= 8; page++) {
      const res = await fetch(
        `https://${domain}/wp-json/wp/v2/column?per_page=100&page=${page}&status=publish&_fields=id,title,link,date,excerpt`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) break;
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      results.push(...batch);
      if (batch.length < 100) break;
    }
  } catch (e) {
    console.warn('[WP] クライアント側フェッチ失敗:', e.message);
  }
  return results;
}

// ─── LocalStorageキャッシュ ───────────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24時間

function saveCache(siteId, data) {
  try {
    localStorage.setItem(`column-analysis-cache-${siteId}`, JSON.stringify({
      ...data,
      cachedAt: Date.now(),
    }));
  } catch {}
}

function loadCache(siteId) {
  try {
    const raw = localStorage.getItem(`column-analysis-cache-${siteId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearCache(siteId) {
  try {
    localStorage.removeItem(`column-analysis-cache-${siteId}`);
  } catch {}
}

function hoursAgo(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60));
}

// ─── ユーティリティ ───────────────────────────────────────────────

function monthsAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24 * 30));
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return '−';
  return (v * 100).toFixed(1) + '%';
}

function fmtPos(v) {
  if (v == null || isNaN(v) || v === 0) return '−';
  return v.toFixed(1);
}

function fmtNum(v) {
  if (v == null || isNaN(v)) return '−';
  return v.toLocaleString();
}

// GSCデータをURLキーのMapに変換
function buildGscMap(gscData) {
  const map = {};
  (gscData || []).forEach(row => {
    if (row.url) map[row.url] = row;
  });
  return map;
}

// GA4データをpagePathキーのMapに変換
function buildGa4Map(ga4Data) {
  const map = {};
  (ga4Data || []).forEach(row => {
    if (row.pagePath) map[row.pagePath] = row;
  });
  return map;
}

// URLからパスを抽出 (例: https://jube.co.jp/column/abc → /column/abc)
function urlToPath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

// ポストにGSCデータとGA4データを結合
function enrichPosts(posts, gscMap, ga4Map) {
  return posts.map(p => {
    const gsc  = p.url ? gscMap[p.url]              : null;
    const path = p.url ? urlToPath(p.url)           : null;
    const ga4  = path  ? (ga4Map[path] || ga4Map[path + '/'] || null) : null;
    return { ...p, gsc: gsc || null, ga4: ga4 || null };
  });
}

// リライト候補判定
function isRewriteCandidate(post) {
  const mo = monthsAgo(post.date);
  if (!post.gsc) return true; // GSCデータなし = 圏外
  if (post.gsc.position > 20) return true;
  if (post.gsc.ctr < 0.02) return true;
  if (mo != null && mo > 12) return true;
  return false;
}

// ステータスバッジ情報
function getPostStatus(post) {
  const mo = monthsAgo(post.date);
  if (!post.gsc) return { label: '圏外', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  if (post.gsc.position > 20) return { label: '要対策', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  if (mo != null && mo > 12) return { label: '情報古い', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
  if (post.gsc.position > 10) return { label: '要強化', bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
  if (post.gsc.ctr < 0.01) return { label: '要対策', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  return { label: '好調', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
}

// カテゴリ別GSC・GA4集計
function buildCategoryStats(enriched, analysis) {
  if (!analysis) return [];
  const catMap = {};
  (analysis.articleCategories || []).forEach(a => {
    const post = enriched.find(p => String(p.id) === String(a.id));
    if (!catMap[a.category]) {
      catMap[a.category] = { name: a.category, count: 0, clicks: 0, impressions: 0, positions: [], ctrs: [], sessions: 0 };
    }
    catMap[a.category].count++;
    if (post?.gsc) {
      catMap[a.category].clicks      += post.gsc.clicks || 0;
      catMap[a.category].impressions += post.gsc.impressions || 0;
      if (post.gsc.position > 0) catMap[a.category].positions.push(post.gsc.position);
      if (post.gsc.ctr > 0)     catMap[a.category].ctrs.push(post.gsc.ctr);
    }
    catMap[a.category].sessions = (catMap[a.category].sessions || 0) + (post?.ga4?.sessions || 0);
  });
  return Object.values(catMap).map(c => ({
    ...c,
    avgPosition: c.positions.length > 0 ? c.positions.reduce((a, b) => a + b, 0) / c.positions.length : null,
    avgCtr:      c.ctrs.length      > 0 ? c.ctrs.reduce((a, b) => a + b, 0)      / c.ctrs.length      : null,
    sessions:    c.sessions || 0,
  })).sort((a, b) => b.clicks - a.clicks || b.count - a.count);
}

// カテゴリステータス
function getCategoryStatus(cat) {
  if (cat.avgPosition == null) return { label: 'データなし', bg: '#f4f4f5', color: '#71717a', border: '#e4e4e7' };
  if (cat.avgPosition < 10 && (cat.avgCtr == null || cat.avgCtr > 0.03))
    return { label: '好調', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
  if (cat.avgPosition <= 20)
    return { label: '要強化', bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
  return { label: '要対策', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
}

// ─── サブコンポーネント ────────────────────────────────────────────

function StatusBadge({ label, bg, color, border }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`,
      flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function SummaryCard({ label, value, unit, color, sub }) {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '14px 18px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-sub)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: color || 'var(--text-main)', lineHeight: 1.2 }}>
        {value}
        {unit && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)', marginLeft: '4px' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function RewriteModal({ post, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const aiReason = (() => {
    return post._rewriteReason || '';
  })();

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/column-analysis/rewrite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    post.title,
          url:      post.url,
          excerpt:  post.excerpt,
          category: post.category || '',
          reason:   aiReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'リライト案の生成に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: '14px',
          width: '100%', maxWidth: '640px',
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-popup)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>
              リライト案を作成
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '3px', lineHeight: 1.5 }}>
              {post.title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 10px',
              fontSize: '12px', color: 'var(--text-sub)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            閉じる
          </button>
        </div>

        {/* ボディ */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          {!result && !loading && (
            <div>
              {aiReason && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: '8px', padding: '10px 14px',
                  fontSize: '12px', color: '#92400e', marginBottom: '14px', lineHeight: 1.6,
                }}>
                  <strong>リライト理由：</strong> {aiReason}
                </div>
              )}
              <button
                onClick={generate}
                style={{
                  padding: '10px 22px', borderRadius: '8px', border: 'none',
                  background: '#6366f1', color: '#ffffff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: '100%',
                }}
              >
                AIでリライト案を生成する
              </button>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#6366f1' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✍️</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>AIがリライト案を作成中…</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>10〜20秒かかります</div>
            </div>
          )}

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '10px 14px',
              color: '#dc2626', fontSize: '13px', marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          {result && (
            <div>
              {/* タイトル案 */}
              {result.titleSuggestions?.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                    改善タイトル案
                  </div>
                  {result.titleSuggestions.map((t, i) => (
                    <div key={i} style={{
                      background: '#f5f3ff', border: '1px solid #ddd6fe',
                      borderRadius: '6px', padding: '8px 12px',
                      fontSize: '12px', color: '#6d28d9', marginBottom: '6px', lineHeight: 1.5,
                    }}>
                      {i + 1}. {t}
                    </div>
                  ))}
                </div>
              )}

              {/* 構成アウトライン */}
              {result.outline?.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                    記事構成アウトライン
                  </div>
                  {result.outline.map((sec, i) => (
                    <div key={i} style={{
                      background: '#ffffff', border: '1px solid var(--border)',
                      borderRadius: '6px', padding: '10px 14px', marginBottom: '6px',
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                        {i + 1}. {sec.section}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
                        {sec.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* キーポイント */}
              {result.keyPoints?.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                    強調すべきポイント
                  </div>
                  {result.keyPoints.map((kp, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '5px' }}>
                      <span style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        color: '#16a34a', fontSize: '10px', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {i + 1}
                      </span>
                      <div style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.6 }}>{kp}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* コラム生成へのリンク */}
              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                <a href="/column" style={{
                  padding: '8px 16px', borderRadius: '8px',
                  background: '#6366f1', color: '#ffffff',
                  fontSize: '12px', fontWeight: 600, textDecoration: 'none',
                  display: 'inline-block',
                }}>
                  コラム生成ページで作成 →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────────

export default function ColumnAnalysisPage() {
  const [siteId, setSiteId]       = useState('jube');
  const [posts, setPosts]         = useState([]);
  const [gscData, setGscData]     = useState([]);
  const [ga4Data, setGa4Data]     = useState([]);
  const [analysis, setAnalysis]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError]         = useState('');
  const [modalPost, setModalPost] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null); // { cachedAt, postCount }

  const siteMeta = getSiteMeta(siteId);

  // ─── ページ初期化: キャッシュロード ────────────────────────────────

  useEffect(() => {
    const cached = loadCache(siteId);
    if (cached) {
      if (cached.posts)    setPosts(cached.posts);
      if (cached.gscData)  setGscData(cached.gscData);
      if (cached.ga4Data)  setGa4Data(cached.ga4Data);
      if (cached.analysis) setAnalysis(cached.analysis);
      setCacheInfo({ cachedAt: cached.cachedAt, postCount: (cached.posts || []).length });
    } else {
      // キャッシュなし: 状態リセット
      setPosts([]);
      setGscData([]);
      setGa4Data([]);
      setAnalysis(null);
      setCacheInfo(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // ─── キャッシュクリア ───────────────────────────────────────────

  function handleClearCache() {
    clearCache(siteId);
    setCacheInfo(null);
    setPosts([]);
    setGscData([]);
    setGa4Data([]);
    setAnalysis(null);
    setError('');
  }

  // ─── 記事取得（posts + GSC、AI分析なし） ─────────────────────────

  const fetchPosts = useCallback(async (sid) => {
    setLoading(true);
    setError('');
    setPosts([]);
    setGscData([]);
    setGa4Data([]);
    setAnalysis(null);
    setCacheInfo(null);

    try {
      setLoadingStep('記事データとGSCデータを取得中…');
      const [postsRes, gscRes, ga4Res] = await Promise.all([
        fetch(`/api/column-analysis/posts?siteId=${sid}`),
        fetch(`/api/column-analysis/gsc?siteId=${sid}`),
        fetch(`/api/column-analysis/ga4?siteId=${sid}`),
      ]);

      const [postsData, gscResult, ga4Result] = await Promise.all([postsRes.json(), gscRes.json(), ga4Res.json()]);

      const fetchedPosts = postsData.success ? (postsData.posts || []) : [];
      const fetchedGsc   = gscResult.success  ? (gscResult.data   || []) : [];
      const fetchedGa4   = ga4Result.success   ? (ga4Result.data   || []) : [];

      if (!postsData.success) {
        setError(postsData.error || '記事取得に失敗しました');
        setLoading(false);
        return;
      }

      if (!gscResult.success) {
        console.warn('[column-analysis] GSC取得失敗:', gscResult.error);
      }

      if (!ga4Result.success) {
        console.warn('[column-analysis] GA4取得失敗:', ga4Result.error);
      }

      // ─── ブラウザから直接WP REST APIを取得（サーバー側IPブロック回避）───
      setLoadingStep('WPサイトから既存コラムを取得中…');
      const wpRaw = await fetchWpPostsFromBrowser(sid);
      const dbUrls = new Set(fetchedPosts.filter(p => p.url).map(p => p.url));
      const wpExtra = wpRaw
        .filter(wp => !dbUrls.has(wp.link))
        .map(wp => ({
          id:      `wp-${wp.id}`,
          title:   wp.title?.rendered || '',
          url:     wp.link || '',
          date:    wp.date || '',
          excerpt: (wp.excerpt?.rendered || '').replace(/<[^>]*>/g, '').trim().slice(0, 300),
          status:  'wp-published',
          keyword: '',
          source:  'wp',
        }));
      const allPosts = [...fetchedPosts, ...wpExtra];
      console.log(`[WP] DB:${fetchedPosts.length}件 + WP既存:${wpExtra.length}件 = 合計:${allPosts.length}件`);

      setPosts(allPosts);
      setGscData(fetchedGsc);
      setGa4Data(fetchedGa4);

      // キャッシュ保存（analysisなし）
      saveCache(sid, { posts: allPosts, gscData: fetchedGsc, ga4Data: fetchedGa4, analysis: null });
      setCacheInfo({ cachedAt: Date.now(), postCount: allPosts.length });
    } catch (err) {
      setError('通信エラーが発生しました: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, []);

  // ─── AI分析実行 ──────────────────────────────────────────────────

  const runAnalysis = useCallback(async (sid, currentPosts, currentGscData) => {
    if (currentPosts.length === 0) {
      setError('先に記事を取得してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      setLoadingStep(`AIが${currentPosts.length}件の記事を分析中…（30〜60秒）`);

      const gscMap   = buildGscMap(currentGscData);
      const ga4Map   = buildGa4Map(ga4Data);
      const enriched = enrichPosts(currentPosts, gscMap, ga4Map);

      const postsForAI = enriched.slice(0, 80).map(p => ({
        id:          p.id,
        title:       p.title,
        url:         p.url,
        date:        p.date,
        excerpt:     p.excerpt,
        keyword:     p.keyword,
        gscPosition: p.gsc?.position ?? null,
        gscCtr:      p.gsc?.ctr      ?? null,
        gscClicks:   p.gsc?.clicks   ?? null,
      }));

      const analyzeRes = await fetch('/api/column-analysis/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: sid, posts: postsForAI, seoKeywords: [] }),
      });
      const analyzeData = await analyzeRes.json();

      if (analyzeData.success && analyzeData.result) {
        setAnalysis(analyzeData.result);
        // キャッシュ更新（analysisあり）
        saveCache(sid, { posts: currentPosts, gscData: currentGscData, ga4Data: ga4Data, analysis: analyzeData.result });
        setCacheInfo(prev => prev ? { ...prev, cachedAt: Date.now() } : { cachedAt: Date.now(), postCount: currentPosts.length });
      } else {
        setError(analyzeData.error || 'AI分析に失敗しました');
      }
    } catch (err) {
      setError('通信エラーが発生しました: ' + err.message);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [ga4Data]);

  // ─── AI分析ボタン: 記事未取得なら先に取得してから分析 ─────────────

  const handleRunAnalysis = useCallback(async (sid) => {
    let currentPosts   = posts;
    let currentGscData = gscData;

    if (currentPosts.length === 0) {
      // 先に記事取得
      setLoading(true);
      setError('');
      setCacheInfo(null);

      try {
        setLoadingStep('記事データとGSCデータを取得中…');
        const [postsRes, gscRes, ga4Res] = await Promise.all([
          fetch(`/api/column-analysis/posts?siteId=${sid}`),
          fetch(`/api/column-analysis/gsc?siteId=${sid}`),
          fetch(`/api/column-analysis/ga4?siteId=${sid}`),
        ]);

        const [postsData, gscResult, ga4Result] = await Promise.all([postsRes.json(), gscRes.json(), ga4Res.json()]);

        currentPosts   = postsData.success ? (postsData.posts || []) : [];
        currentGscData = gscResult.success  ? (gscResult.data   || []) : [];
        const fetchedGa4 = ga4Result.success ? (ga4Result.data || []) : [];

        if (!postsData.success) {
          setError(postsData.error || '記事取得に失敗しました');
          setLoading(false);
          return;
        }

        if (!gscResult.success) {
          console.warn('[column-analysis] GSC取得失敗:', gscResult.error);
        }

        if (!ga4Result.success) {
          console.warn('[column-analysis] GA4取得失敗:', ga4Result.error);
        }

        // ─── ブラウザから直接WP REST APIを取得 ───
        setLoadingStep('WPサイトから既存コラムを取得中…');
        const wpRaw = await fetchWpPostsFromBrowser(sid);
        const dbUrls = new Set(currentPosts.filter(p => p.url).map(p => p.url));
        const wpExtra = wpRaw
          .filter(wp => !dbUrls.has(wp.link))
          .map(wp => ({
            id:      `wp-${wp.id}`,
            title:   wp.title?.rendered || '',
            url:     wp.link || '',
            date:    wp.date || '',
            excerpt: (wp.excerpt?.rendered || '').replace(/<[^>]*>/g, '').trim().slice(0, 300),
            status:  'wp-published',
            keyword: '',
            source:  'wp',
          }));
        currentPosts = [...currentPosts, ...wpExtra];

        setPosts(currentPosts);
        setGscData(currentGscData);
        setGa4Data(fetchedGa4);

        if (currentPosts.length === 0) {
          setLoading(false);
          setLoadingStep('');
          return;
        }
      } catch (err) {
        setError('通信エラーが発生しました: ' + err.message);
        setLoading(false);
        setLoadingStep('');
        return;
      }
      // setLoading は runAnalysis 内で管理するのでここでは落とさない
    }

    await runAnalysis(sid, currentPosts, currentGscData);
  }, [posts, gscData, runAnalysis]);

  // ─── 派生データ ─────────────────────────────────────────────────

  const gscMap   = buildGscMap(gscData);
  const ga4Map   = buildGa4Map(ga4Data);
  const enriched = enrichPosts(posts, gscMap, ga4Map);

  // サマリー統計
  const avgPosition = (() => {
    const vals = enriched.filter(p => p.gsc?.position > 0).map(p => p.gsc.position);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  const avgCtr = (() => {
    const vals = enriched.filter(p => p.gsc?.ctr > 0).map(p => p.gsc.ctr);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  const totalClicks   = enriched.reduce((s, p) => s + (p.gsc?.clicks    || 0), 0);
  const totalSessions = enriched.reduce((s, p) => s + (p.ga4?.sessions  || 0), 0);
  const hasGa4        = ga4Data.length > 0;

  const rewriteCandidates = enriched.filter(isRewriteCandidate);

  const categoryStats = buildCategoryStats(enriched, analysis);

  const missingCategoryCount = (analysis?.categoryGaps || []).length;

  // AI分析のリライト候補とpostを紐付け
  const aiRewriteMap = {};
  (analysis?.rewriteCandidates || []).forEach(r => {
    aiRewriteMap[String(r.id)] = r.reason || '';
  });

  // リライト候補にAI理由を付与
  const rewriteWithReason = rewriteCandidates.map(p => ({
    ...p,
    _rewriteReason: aiRewriteMap[String(p.id)] || '',
  }));

  // カテゴリマップ（ID→カテゴリ）
  const postCategoryMap = {};
  (analysis?.articleCategories || []).forEach(a => {
    postCategoryMap[String(a.id)] = a.category;
  });

  // キャッシュの経過時間
  const cacheHours    = cacheInfo ? hoursAgo(cacheInfo.cachedAt) : null;
  const cacheExpired  = cacheHours != null && cacheHours >= 24;

  // ─── レンダリング ────────────────────────────────────────────────

  const hasData = posts.length > 0;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px' }}>
      {/* ページヘッダー */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
          コラム分析 / リライト
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-sub)', margin: '4px 0 0' }}>
          GSCデータとAIでコラム記事を分析し、リライト候補・カテゴリギャップを特定します
        </p>
      </div>

      {/* ─── A. コントロールバー ─── */}
      <div style={{
        background: '#ffffff', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '12px 16px',
        marginBottom: cacheInfo ? '0' : '20px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      }}>
        {/* サイトタブ */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {SITES.map(s => {
            const sm  = getSiteMeta(s.siteId);
            const act = s.siteId === siteId;
            return (
              <button
                key={s.siteId}
                onClick={() => { setSiteId(s.siteId); setPosts([]); setGscData([]); setGa4Data([]); setAnalysis(null); setError(''); setCacheInfo(null); }}
                disabled={loading}
                style={{
                  padding: '6px 14px', borderRadius: '8px',
                  border:     act ? `1.5px solid ${sm.color}` : '1.5px solid var(--border)',
                  background: act ? sm.bg : 'transparent',
                  color:      act ? sm.color : 'var(--text-sub)',
                  fontSize: '13px', fontWeight: act ? 700 : 500,
                  cursor: loading ? 'default' : 'pointer',
                }}
              >
                {s.shortName}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* データ取得+分析ボタン */}
        <button
          onClick={() => handleRunAnalysis(siteId)}
          disabled={loading}
          style={{
            padding: '8px 22px', borderRadius: '8px', border: 'none',
            background: loading ? 'var(--border)' : '#6366f1',
            color:      loading ? 'var(--text-muted)' : '#ffffff',
            fontSize: '13px', fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? loadingStep.includes('AI') ? 'AI分析中…' : '取得中…' : 'データ取得+分析'}
        </button>
      </div>

      {/* ─── キャッシュバナー ─── */}
      {cacheInfo && (
        <div style={{
          background: cacheExpired ? '#fff7ed' : '#f5f3ff',
          border: `1px solid ${cacheExpired ? '#fed7aa' : '#ddd6fe'}`,
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '7px 16px',
          marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', color: cacheExpired ? '#92400e' : '#6d28d9',
        }}>
          <span style={{ flex: 1 }}>
            「{siteId}」の前回データ：
            {cacheExpired
              ? `${cacheHours}時間前のデータ（期限切れ）`
              : `${cacheHours}時間前`}
            （{cacheInfo.postCount}件）
          </span>
          <button
            onClick={handleClearCache}
            style={{
              padding: '2px 10px', borderRadius: '6px',
              border: `1px solid ${cacheExpired ? '#fed7aa' : '#ddd6fe'}`,
              background: 'transparent',
              color: cacheExpired ? '#92400e' : '#6d28d9',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            クリア
          </button>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '8px', padding: '10px 16px',
          color: '#dc2626', fontSize: '13px', marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {/* ローディング中 */}
      {loading && (
        <div style={{
          background: '#f5f3ff', border: '1px solid #ddd6fe',
          borderRadius: '12px', padding: '32px 24px',
          marginBottom: '20px', textAlign: 'center', color: '#6d28d9',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📊</div>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>データ取得・分析中</div>
          <div style={{ fontSize: '12px', color: '#7c3aed' }}>{loadingStep}</div>
        </div>
      )}

      {/* 初期状態 */}
      {!loading && !hasData && !error && (
        <div style={{
          background: '#ffffff', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
            「記事取得」または「AI分析実行」で分析を開始
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
            DBのコラム記事とGSCデータを取得し、AIが自動分析します
          </div>
        </div>
      )}

      {/* 分析結果 */}
      {!loading && hasData && (
        <>
          {/* ─── B. サマリーカード（6枚） ─── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px', marginBottom: '20px',
          }}>
            <SummaryCard
              label="総コラム数"
              value={posts.length}
              unit="件"
            />
            <SummaryCard
              label="平均順位"
              value={avgPosition != null ? avgPosition.toFixed(1) : '−'}
              unit={avgPosition != null ? '位' : ''}
              color={avgPosition != null && avgPosition < 10 ? '#16a34a' : avgPosition != null && avgPosition < 20 ? '#d97706' : '#dc2626'}
              sub={gscData.length === 0 ? 'GSCデータなし' : null}
            />
            <SummaryCard
              label="平均CTR"
              value={avgCtr != null ? (avgCtr * 100).toFixed(1) + '%' : '−'}
              color={avgCtr != null && avgCtr > 0.03 ? '#16a34a' : avgCtr != null && avgCtr > 0.01 ? '#d97706' : '#dc2626'}
            />
            <SummaryCard
              label="月間セッション"
              value={hasGa4 ? fmtNum(totalSessions) : fmtNum(totalClicks)}
              unit={hasGa4 ? 'セッション' : 'クリック'}
              sub={hasGa4 ? 'GA4 / 過去90日' : 'GSC / 過去90日'}
            />
            <SummaryCard
              label="リライト対象"
              value={rewriteCandidates.length}
              unit="件"
              color="#dc2626"
            />
            <SummaryCard
              label="不足カテゴリ"
              value={missingCategoryCount > 0 ? missingCategoryCount : analysis ? '−' : '−'}
              unit={missingCategoryCount > 0 ? '種類' : ''}
              color={missingCategoryCount > 0 ? '#d97706' : undefined}
              sub={!analysis ? 'AI分析後に表示' : null}
            />
          </div>

          {/* ─── C. カテゴリ別分析テーブル ─── */}
          {categoryStats.length > 0 && (
            <div style={{
              background: '#ffffff', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden', marginBottom: '20px',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>カテゴリ別分析</div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                  AIが自動分類したカテゴリとGSCパフォーマンス
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-base)' }}>
                      {['カテゴリ', '平均順位', '本数', 'CTR', 'GSCクリック', 'セッション(GA4)', '状況'].map(h => (
                        <th key={h} style={{
                          padding: '8px 14px', textAlign: 'left',
                          fontWeight: 600, color: 'var(--text-sub)',
                          borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryStats.map((cat, i) => {
                      const status = getCategoryStatus(cat);
                      const maxPos = Math.max(...categoryStats.filter(c => c.avgPosition).map(c => c.avgPosition), 50);
                      const barWidth = cat.avgPosition
                        ? Math.max(4, Math.min(100, (1 - (cat.avgPosition - 1) / maxPos) * 100))
                        : 0;
                      const barColor = cat.avgPosition
                        ? (cat.avgPosition < 10 ? '#16a34a' : cat.avgPosition < 20 ? '#d97706' : '#dc2626')
                        : '#d4d4d8';
                      return (
                        <tr key={cat.name} style={{
                          borderBottom: i < categoryStats.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            {cat.name}
                          </td>
                          <td style={{ padding: '10px 14px', minWidth: '120px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: barColor, minWidth: '32px' }}>
                                {cat.avgPosition != null ? cat.avgPosition.toFixed(1) : '−'}
                              </span>
                              <div style={{ flex: 1, height: '6px', background: 'var(--bg-base)', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                                <div style={{ width: barWidth + '%', height: '100%', background: barColor, borderRadius: '3px' }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-sub)' }}>{cat.count}件</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-sub)' }}>{fmtPct(cat.avgCtr)}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-sub)' }}>{fmtNum(cat.clicks)}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-sub)' }}>
                            {cat.sessions > 0 ? fmtNum(cat.sessions) : '−'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <StatusBadge {...status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── D. 不足カテゴリ + AI考察 ─── */}
          {analysis && ((analysis.categoryGaps || []).length > 0 || (analysis.rewriteCandidates || []).length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              {/* 不足カテゴリ */}
              {(analysis.categoryGaps || []).length > 0 && (
                <div style={{
                  background: '#ffffff', border: '1px solid var(--border)',
                  borderRadius: '12px', overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>不足カテゴリ</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '2px' }}>コンテンツギャップ</div>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(analysis.categoryGaps || []).map((gap, i) => (
                      <div key={i} style={{
                        background: '#fafafa', border: '1px solid var(--border)',
                        borderRadius: '8px', padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: '6px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
                            💡 {gap.category}
                          </span>
                          <a
                            href="/column"
                            style={{
                              padding: '3px 10px', borderRadius: '6px',
                              background: '#6366f1', color: '#ffffff',
                              fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                              flexShrink: 0,
                            }}
                          >
                            新規作成
                          </a>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
                          {gap.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI考察 */}
              {(analysis.rewriteCandidates || []).length > 0 && (
                <div style={{
                  background: '#ffffff', border: '1px solid var(--border)',
                  borderRadius: '12px', overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>AI考察</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '2px' }}>リライト優先ポイント</div>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(analysis.rewriteCandidates || []).slice(0, 6).map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <span style={{
                          width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                          background: r.priority === 'high' ? '#fef2f2' : '#fffbeb',
                          border: '1px solid ' + (r.priority === 'high' ? '#fecaca' : '#fde68a'),
                          color: r.priority === 'high' ? '#dc2626' : '#d97706',
                          fontSize: '10px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: '1px',
                        }}>
                          {i + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '1px' }}>
                            {r.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                            {r.reason}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── E. リライト対象コラム一覧 ─── */}
          {rewriteWithReason.length > 0 && (
            <div style={{
              background: '#ffffff', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                  リライト対象コラム
                  <span style={{
                    marginLeft: '8px', fontSize: '12px', fontWeight: 600,
                    color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca',
                    padding: '1px 8px', borderRadius: '99px',
                  }}>
                    {rewriteWithReason.length}件
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                  圏外・順位20位以下・CTR2%未満・更新12ヶ月超の記事
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px', padding: '16px',
              }}>
                {rewriteWithReason.map((post, i) => {
                  const status = getPostStatus(post);
                  const mo     = monthsAgo(post.date);
                  const category = postCategoryMap[String(post.id)] || '';

                  return (
                    <div key={post.id || i} style={{
                      background: '#fafafa', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '14px',
                      display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                      {/* タイトル行 */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        {post.url ? (
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              flex: 1, fontSize: '12px', fontWeight: 600,
                              color: 'var(--text-main)', textDecoration: 'none', lineHeight: 1.5,
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-main)'}
                          >
                            {post.title}
                          </a>
                        ) : (
                          <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.5 }}>
                            {post.title}
                          </span>
                        )}
                        <StatusBadge {...status} />
                      </div>

                      {/* タグ群 */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {post.gsc?.position > 0 && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>
                            順位 {post.gsc.position.toFixed(1)}位
                          </span>
                        )}
                        {post.gsc?.ctr != null && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                            CTR {fmtPct(post.gsc.ctr)}
                          </span>
                        )}
                        {post.gsc?.clicks > 0 && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                            {post.gsc.clicks}クリック
                          </span>
                        )}
                        {mo != null && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            {mo}ヶ月前
                          </span>
                        )}
                        {category && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                            {category}
                          </span>
                        )}
                        {post.source === 'wp' && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                            WP既存
                          </span>
                        )}
                        {post.ga4?.sessions > 0 && (
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: '#fdf4ff', color: '#9333ea', border: '1px solid #e9d5ff' }}>
                            {post.ga4.sessions}セッション
                          </span>
                        )}
                      </div>

                      {/* AI理由 */}
                      {post._rewriteReason && (
                        <div style={{ fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.6, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 10px' }}>
                          {post._rewriteReason}
                        </div>
                      )}

                      {/* リライト案ボタン */}
                      <button
                        onClick={() => setModalPost({ ...post, category, _rewriteReason: post._rewriteReason })}
                        style={{
                          padding: '7px 0', borderRadius: '7px',
                          border: '1.5px solid #6366f1',
                          background: 'transparent', color: '#6366f1',
                          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          marginTop: '2px',
                        }}
                      >
                        リライト案を作成
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* リライト対象なし */}
          {rewriteWithReason.length === 0 && hasData && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: '12px', padding: '20px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>✅</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>
                リライトが必要な記事はありません
              </div>
            </div>
          )}
        </>
      )}

      {/* リライトモーダル */}
      {modalPost && (
        <RewriteModal
          post={modalPost}
          onClose={() => setModalPost(null)}
        />
      )}
    </div>
  );
}
