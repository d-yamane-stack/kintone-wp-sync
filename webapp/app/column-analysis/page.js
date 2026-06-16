'use client';

import { useState, useEffect, useCallback } from 'react';
import { SITE_META, getSiteMeta } from '@/lib/siteMeta';
import { useAnalysisStore } from '@/lib/useAnalysisStore';
import { analysisStore } from '@/lib/analysisStore';

const SITES = Object.entries(SITE_META)
  .sort((a, b) => (a[1].order || 99) - (b[1].order || 99))
  .map(([siteId, meta]) => ({ siteId, name: meta.name, shortName: meta.shortName }));

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

function fmtDate(dateStr) {
  if (!dateStr) return '−';
  const d = new Date(dateStr);
  if (isNaN(d)) return '−';
  return d.getFullYear() + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0');
}

// GSCデータをURLキーのMapに変換（エンコード済み・デコード済み両方を登録）
function buildGscMap(gscData) {
  const map = {};
  (gscData || []).forEach(row => {
    if (!row.url) return;
    map[row.url] = row; // そのまま（通常は %xx エンコード済み）
    try { map[decodeURIComponent(row.url)] = row; } catch {} // デコード版も登録
  });
  return map;
}

// GA4データをpagePathキーのMapに変換（エンコード・デコード両方）
function buildGa4Map(ga4Data) {
  const map = {};
  (ga4Data || []).forEach(row => {
    if (!row.pagePath) return;
    map[row.pagePath] = row;
    try { map[decodeURIComponent(row.pagePath)] = row; } catch {}
    // 末尾スラッシュなし版も登録
    const noSlash = row.pagePath.replace(/\/$/, '');
    if (noSlash) { map[noSlash] = row; try { map[decodeURIComponent(noSlash)] = row; } catch {} }
  });
  return map;
}

// URLからパスを抽出 (例: https://jube.co.jp/column/abc → /column/abc)
function urlToPath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

// ポストにGSCデータとGA4データを結合（URL エンコード不一致を吸収）
function enrichPosts(posts, gscMap, ga4Map) {
  return posts.map(p => {
    // GSC: WP は日本語デコード済みURL、GSC は %xx エンコード済み → 両方試す
    let gsc = null;
    if (p.url) {
      gsc = gscMap[p.url] || null;
      if (!gsc) { try { gsc = gscMap[decodeURIComponent(p.url)] || null; } catch {} }
      if (!gsc) { try { gsc = gscMap[encodeURI(p.url)]          || null; } catch {} }
    }

    // GA4: pagePath でマッチ（デコード済み・末尾スラッシュ不問）
    let ga4 = null;
    if (p.url) {
      try {
        const path = new URL(p.url).pathname;
        ga4 = ga4Map[path]
           || ga4Map[decodeURIComponent(path)]
           || ga4Map[path + '/']
           || ga4Map[decodeURIComponent(path) + '/']
           || null;
      } catch {}
    }

    return { ...p, gsc: gsc || null, ga4: ga4 || null };
  });
}

// リライト候補判定
// 定義: ①GSCデータあり かつ 平均順位21位以下
//       ②GSCデータあり かつ 11位以下 かつ CTR2%未満（表示100回以上）← 好調記事を除外するため順位条件を追加
//       ③GSCデータあり かつ 18ヶ月以上経過 かつ 11位以下
//       ④GSCデータなし（圏外）かつ 公開24ヶ月以上経過
//       ※公開6ヶ月未満の記事はインデックス待ちとして除外
function isRewriteCandidate(post) {
  const mo = monthsAgo(post.date);
  if (mo == null || mo < 6) return false; // 6ヶ月未満は対象外（インデックス待ち）

  if (post.gsc) {
    // GSCデータあり → 検索パフォーマンスで判定
    if (post.gsc.position > 20) return true;                                                         // 2ページ目以降
    if (post.gsc.position > 10 && post.gsc.impressions >= 100 && post.gsc.ctr < 0.02) return true;  // 11位以下かつ表示多いのにCTR2%未満
    if (mo >= 18 && post.gsc.position > 10) return true;                                             // 18ヶ月以上経過 かつ 11位以下
    return false;
  }

  // GSCデータなし = 圏外（検索100位以下）かつ2年以上経過した記事
  return mo >= 24;
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
  // ローカル時刻（JST）で当月を判定
  const _now = new Date();
  const thisMonth = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0'); // "YYYY-MM"
  const catMap = {};
  (analysis.articleCategories || []).forEach(a => {
    const post = enriched.find(p => String(p.id) === String(a.id));
    if (!catMap[a.category]) {
      catMap[a.category] = { name: a.category, count: 0, monthlyCount: 0, clicks: 0, impressions: 0, positions: [], ctrs: [], sessions: 0 };
    }
    catMap[a.category].count++;
    // 今月公開された記事カウント
    const dateStr = post?.date || post?.publishedAt || '';
    if (dateStr && dateStr.slice(0, 7) === thisMonth) catMap[a.category].monthlyCount++;
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
  if (cat.avgPosition == null) {
    // GSCインプレッションなし = 事実上の圏外
    return { label: '圏外', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
  }
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

function RewriteModal({ post, siteId, onClose, onSaved }) {
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState('');
  const [executing, setExecuting]         = useState(false);
  const [rewriteContent, setRewriteContent] = useState(null); // 生成済み本文HTML
  const [copied, setCopied]               = useState(false);
  const [selectedTitle, setSelectedTitle] = useState(0); // タイトル案の選択インデックス

  const aiReason = post._rewriteReason || '';

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
        setSelectedTitle(0);
      } else {
        setError(data.error || 'リライト案の生成に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  async function executeRewrite() {
    if (!result) return;
    setExecuting(true);
    setError('');
    const title = result.titleSuggestions?.[selectedTitle] || post.title;
    try {
      const res = await fetch('/api/column-analysis/rewrite-execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          outline:    result.outline   || [],
          keyPoints:  result.keyPoints || [],
          category:   post.category   || '',
          siteId,
          originalTitle: post.title,
          originalUrl:   post.url,
          autoPost:      true,
          wpPostId:      post.wpPostId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRewriteContent({ html: data.content, title, queued: data.queued });
        if (onSaved) onSaved();
      } else {
        setError(data.error || 'リライト生成に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setExecuting(false);
    }
  }

  function copyHtml() {
    if (!rewriteContent?.html) return;
    navigator.clipboard.writeText(rewriteContent.html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // モーダルの幅: 本文生成後は広く
  const modalWidth = rewriteContent ? '900px' : '640px';

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
          width: '100%', maxWidth: modalWidth,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-popup)',
          display: 'flex', flexDirection: 'column',
          transition: 'max-width 0.2s',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          position: 'sticky', top: 0, background: '#ffffff', zIndex: 1,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>
              {rewriteContent ? '✅ リライト本文が完成しました' : result ? 'リライト案を確認・実行' : 'リライト案を作成'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '3px', lineHeight: 1.5 }}>
              {rewriteContent ? rewriteContent.title : post.title}
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

          {/* ── STEP 1: 案生成前 ── */}
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

          {/* ローディング（案生成中） */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#6366f1' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✍️</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>AIがリライト案を作成中…</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>10〜20秒かかります</div>
            </div>
          )}

          {/* ローディング（本文生成中） */}
          {executing && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#6366f1' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📝</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>本文を執筆中…</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>30〜50秒かかります</div>
            </div>
          )}

          {/* エラー */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '10px 14px',
              color: '#dc2626', fontSize: '13px', marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          {/* ── STEP 2: 案表示 + 実行ボタン ── */}
          {result && !rewriteContent && !executing && (
            <div>
              {/* タイトル案（選択可能） */}
              {result.titleSuggestions?.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                    改善タイトル案 <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>（クリックで選択）</span>
                  </div>
                  {result.titleSuggestions.map((t, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedTitle(i)}
                      style={{
                        background: selectedTitle === i ? '#ede9fe' : '#f5f3ff',
                        border: `1.5px solid ${selectedTitle === i ? '#6366f1' : '#ddd6fe'}`,
                        borderRadius: '6px', padding: '8px 12px',
                        fontSize: '12px', color: selectedTitle === i ? '#4338ca' : '#6d28d9',
                        marginBottom: '6px', lineHeight: 1.5,
                        cursor: 'pointer',
                      }}
                    >
                      {selectedTitle === i ? '✓ ' : ''}{i + 1}. {t}
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
                <div style={{ marginBottom: '20px' }}>
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

              {/* 実行ボタン */}
              <button
                onClick={executeRewrite}
                style={{
                  padding: '12px 0', borderRadius: '8px', border: 'none',
                  background: '#6366f1', color: '#ffffff',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer', width: '100%',
                }}
              >
                この内容で既存記事を更新して公開 →
              </button>
            </div>
          )}

          {/* ── STEP 3: 生成済み本文表示 ── */}
          {rewriteContent && (
            <div>
              {rewriteContent.queued && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#15803d', lineHeight: 1.7 }}>
                  ✅ 既存記事の更新をキューに登録しました。<b>ローカルworker（起動中）が数分以内に同じURLの記事を上書きして公開</b>します。状況は下の「リライト済みコラム」一覧でご確認ください。
                </div>
              )}
              {/* コピーボタン */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', gap: '8px' }}>
                <button
                  onClick={copyHtml}
                  style={{
                    padding: '7px 18px', borderRadius: '7px',
                    border: '1.5px solid #6366f1', background: copied ? '#6366f1' : 'transparent',
                    color: copied ? '#ffffff' : '#6366f1',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {copied ? '✓ コピー済み' : 'HTMLをコピー'}
                </button>
                <button
                  onClick={() => { setRewriteContent(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: '7px',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-sub)',
                    fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  案に戻る
                </button>
              </div>

              {/* 本文プレビュー */}
              <div style={{
                border: '1px solid var(--border)', borderRadius: '10px',
                padding: '20px 24px', background: '#fafafa',
                fontSize: '14px', lineHeight: 1.8, color: 'var(--text-main)',
              }}
                dangerouslySetInnerHTML={{ __html: rewriteContent.html }}
              />

              <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                自動反映されない場合のフォールバック：上の「HTMLをコピー」でWP編集画面に手動貼り付けもできます
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 一括リライトモーダル ──────────────────────────────────────────

const BULK_STATUS = {
  queued:   { t: '待機',   c: '#71717a', b: '#f4f4f5', bd: '#e4e4e7' },
  planning: { t: '構成中', c: '#6d28d9', b: '#f5f3ff', bd: '#ddd6fe' },
  writing:  { t: '執筆中', c: '#2563eb', b: '#eff6ff', bd: '#bfdbfe' },
  done:     { t: '公開待ち', c: '#16a34a', b: '#f0fdf4', bd: '#bbf7d0' },
  error:    { t: 'エラー', c: '#dc2626', b: '#fef2f2', bd: '#fecaca' },
};

// リライト対象の上位N件を、構成案→本文まで自動生成する（既存の単体リライトAPIを流用）
function BulkRewriteModal({ posts, siteId, onClose, onSaved }) {
  const [items, setItems] = useState(() =>
    posts.map(p => ({ post: p, status: 'queued', title: '', html: '', error: '' }))
  );
  const [started, setStarted]         = useState(false);
  const [running, setRunning]         = useState(false);
  const [copiedIdx, setCopiedIdx]     = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);

  function update(i, patch) {
    setItems(prev => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  async function rewriteOne(post, i) {
    try {
      update(i, { status: 'planning', error: '' });
      const planRes = await fetch('/api/column-analysis/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: post.title, url: post.url, excerpt: post.excerpt,
          category: post.category || '', reason: post._rewriteReason || '',
        }),
      });
      const plan = await planRes.json();
      if (!plan.success) throw new Error(plan.error || 'リライト案の生成に失敗しました');
      const newTitle = (plan.titleSuggestions && plan.titleSuggestions[0]) || post.title;
      update(i, { status: 'writing', title: newTitle });
      const execRes = await fetch('/api/column-analysis/rewrite-execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle, outline: plan.outline || [], keyPoints: plan.keyPoints || [],
          category: post.category || '', siteId,
          originalTitle: post.title, originalUrl: post.url,
          autoPost: true, wpPostId: post.wpPostId || null,
        }),
      });
      const exec = await execRes.json();
      if (!exec.success) throw new Error(exec.error || '本文の生成に失敗しました');
      update(i, { status: 'done', html: exec.content || '', title: newTitle });
    } catch (e) {
      update(i, { status: 'error', error: e.message || '通信エラーが発生しました' });
    }
  }

  async function startAll() {
    if (running) return;
    setStarted(true);
    setRunning(true);
    let cursor = 0;
    // Anthropicの出力トークン上限(10k/min)を超えないよう逐次実行。
    // サーバ側も 429 を1回までリトライ済（rewrite, rewrite-execute）。
    const CONCURRENCY = 1;
    async function worker() {
      while (cursor < posts.length) {
        const i = cursor++;
        await rewriteOne(posts[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, posts.length) }, worker));
    setRunning(false);
    if (onSaved) onSaved();
  }

  function copyOne(i) {
    const it = items[i];
    if (!it || !it.html) return;
    navigator.clipboard.writeText(`<h1>${it.title}</h1>\n${it.html}`).then(() => {
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx(c => (c === i ? null : c)), 2000);
    });
  }

  function copyAll() {
    const blocks = items
      .filter(it => it.status === 'done')
      .map(it => `<h1>${it.title}</h1>\n${it.html}`);
    if (blocks.length) navigator.clipboard.writeText(blocks.join('\n\n<hr>\n\n'));
  }

  const doneCount  = items.filter(it => it.status === 'done').length;
  const errorCount = items.filter(it => it.status === 'error').length;
  const finished   = started && !running;
  const progress   = started ? ((doneCount + errorCount) / posts.length) * 100 : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: '14px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-popup)', display: 'flex', flexDirection: 'column' }}>
        {/* ヘッダー */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#ffffff', zIndex: 2, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              ⚡ コラム一括リライト（{posts.length}件）
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '3px' }}>
              {!started
                ? '優先度の高い順に、AIが本文を生成し、既存記事を上書き＋公開します（順次実行・1記事あたり約1分）'
                : running
                  ? `処理中… 完了 ${doneCount} / ${posts.length}${errorCount ? `（エラー ${errorCount}）` : ''}`
                  : `完了 ${doneCount} 件${errorCount ? ` ・ エラー ${errorCount} 件` : ''}`}
            </div>
          </div>
          {!started && (
            <button onClick={startAll} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              一括生成を開始
            </button>
          )}
          <button onClick={onClose} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: 'var(--text-sub)', cursor: 'pointer', flexShrink: 0 }}>
            閉じる
          </button>
        </div>

        {/* 進捗バー */}
        {started && (
          <div style={{ height: '4px', background: '#f4f4f5' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#6366f1', transition: 'width 0.3s' }} />
          </div>
        )}

        {/* 一覧 */}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((it, i) => {
            const sl = BULK_STATUS[it.status];
            const renamed = it.status === 'done' && it.title && it.title !== it.post.title;
            return (
              <div key={it.post.id || i} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', background: it.status === 'done' ? '#f0fdf4' : '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', width: '18px', textAlign: 'right', flexShrink: 0, paddingTop: '2px' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.5 }}>
                      {renamed ? it.title : it.post.title}
                    </div>
                    {renamed && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>旧: {it.post.title}</div>
                    )}
                    {it.status === 'error' && (
                      <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '3px' }}>{it.error}</div>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', color: sl.c, background: sl.b, border: `1px solid ${sl.bd}`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {(it.status === 'planning' || it.status === 'writing') ? '⏳ ' : ''}{sl.t}
                  </span>
                  {it.status === 'done' && (
                    <>
                      <button onClick={() => setExpandedIdx(expandedIdx === i ? null : i)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-sub)', cursor: 'pointer', flexShrink: 0 }}>
                        {expandedIdx === i ? '隠す' : 'プレビュー'}
                      </button>
                      <button onClick={() => copyOne(i)} style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '6px', border: '1.5px solid #6366f1', background: copiedIdx === i ? '#6366f1' : 'transparent', color: copiedIdx === i ? '#fff' : '#6366f1', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                        {copiedIdx === i ? '✓' : 'コピー'}
                      </button>
                    </>
                  )}
                  {it.status === 'error' && (
                    <button onClick={() => rewriteOne(it.post, i)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', flexShrink: 0 }}>
                      再試行
                    </button>
                  )}
                </div>
                {expandedIdx === i && it.html && (
                  <div style={{ marginTop: '10px', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', background: '#fff', fontSize: '13px', lineHeight: 1.8, maxHeight: '320px', overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: it.html }} />
                )}
              </div>
            );
          })}
        </div>

        {/* フッター */}
        {finished && doneCount > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1 }}>完了した記事はローカルworkerが自動で既存記事を上書き＋公開します（「リライト済みコラム」一覧で確認）。手動貼付が必要な場合のみコピーをご利用ください</span>
            <button onClick={copyAll} style={{ fontSize: '12px', padding: '7px 16px', borderRadius: '7px', border: '1.5px solid #6366f1', background: 'transparent', color: '#6366f1', fontWeight: 600, cursor: 'pointer' }}>
              完了分をまとめてコピー
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────────

export default function ColumnAnalysisPage() {
  const [siteId, setSiteId]           = useState('jube');
  const [modalPost, setModalPost]     = useState(null);
  const [bulkPosts, setBulkPosts]     = useState(null); // 一括リライト対象（nullで非表示）
  const [selectedCategory, setSelectedCategory] = useState(null); // ドリルダウン中カテゴリ
  // A1: リライト一覧フィルター
  const [rewriteRange, setRewriteRange] = useState('all'); // all | off | pos11_20 | pos21+
  const [rewriteCategory, setRewriteCategory] = useState('all');
  // リライト済みコラム一覧
  const [rewriteHistory, setRewriteHistory]   = useState([]);
  const [expandedRewrite, setExpandedRewrite] = useState(null); // プレビュー展開中のjobId
  const [copiedRewrite, setCopiedRewrite]     = useState(null); // コピー済みフィードバック

  // ─── グローバルストアから状態を取得 ────────────────────────────────
  const store = useAnalysisStore(siteId);
  const {
    status,
    loadingStep,
    posts,
    gscData,
    ga4Data,
    analysis,
    error,
    gscError,
    cacheInfo,
  } = store;

  const loading  = status === 'loading' || status === 'analyzing';

  // ─── リライト済みコラム一覧 ────────────────────────────────────────
  const fetchRewriteHistory = useCallback(async (sid) => {
    try {
      const res  = await fetch(`/api/column-analysis/rewrites?siteId=${encodeURIComponent(sid)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setRewriteHistory(data.rewrites || []);
    } catch { /* 一覧取得の失敗は致命的でないため無視 */ }
  }, []);

  useEffect(() => { fetchRewriteHistory(siteId); }, [siteId, fetchRewriteHistory]);

  function copyRewrite(r) {
    navigator.clipboard.writeText(`<h1>${r.newTitle}</h1>\n${r.html}`).then(() => {
      setCopiedRewrite(r.jobId);
      setTimeout(() => setCopiedRewrite(c => (c === r.jobId ? null : c)), 2000);
    }).catch(() => {});
  }

  async function deleteRewrite(jobId) {
    setRewriteHistory(prev => prev.filter(x => x.jobId !== jobId)); // 楽観的に即時消去
    try {
      await fetch('/api/column-analysis/rewrites', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } catch { /* 失敗しても再取得で復元される */ }
  }

  const siteMeta = getSiteMeta(siteId);

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

  // GSCデータがある記事数・圏外記事数
  const gscMatchedCount = enriched.filter(p => p.gsc).length;
  const offRankCount    = enriched.filter(p => !p.gsc).length;

  const rewriteCandidates = enriched.filter(isRewriteCandidate);

  const categoryStats = buildCategoryStats(enriched, analysis);

  const missingCategoryCount = (analysis?.categoryGaps || []).length;

  // リライト優先度スコア（高いほど優先）
  function getRewritePriority(post) {
    const mo = monthsAgo(post.date) || 0;
    if (!post.gsc) return mo;                                                          // 圏外：古いほど優先
    if (post.gsc.position > 20) return 300 + mo * 2;                                  // 2ページ目以降＋古さ
    if (mo >= 18 && post.gsc.position > 10) return 150 + mo;                          // 長期間低順位
    if (post.gsc.position > 10 && post.gsc.impressions >= 100 && post.gsc.ctr < 0.02) return 100 + mo; // CTR低い
    return mo;
  }

  // リライト候補を優先度順にソート（高い順）
  const rewriteWithReason = [...rewriteCandidates]
    .sort((a, b) => getRewritePriority(b) - getRewritePriority(a))
    .map(p => ({ ...p, _rewriteReason: '' }));

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
                onClick={() => setSiteId(s.siteId)}
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
          onClick={() => analysisStore.runAnalysis(siteId)}
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
            onClick={() => analysisStore.clearCache(siteId)}
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

      {/* A2: GSCエラー通知を折り畳み式に（詳細は <details> で展開） */}
      {!loading && (gscError || (posts.length > 0 && gscData.length === 0)) && (
        <details style={{
          background: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: '8px', padding: '8px 16px',
          color: '#92400e', fontSize: '12px', marginBottom: '12px', lineHeight: 1.6,
        }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            ⚠ GSCデータが取得できていません{gscError ? `：${gscError}` : '（0件）'}
          </summary>
          <div style={{ marginTop: '6px', fontSize: '11px', paddingLeft: '4px' }}>
            → OAuth認証したGoogleアカウントが Search Console の {siteId === 'jube' ? 'jube.co.jp' : 'nuribe.jp'} にアクセス権限を持っていない可能性があります。
            Search Console の「設定 → ユーザーと権限」で <code>d-yamane@pdca-minatomirai.com</code> をオーナーまたはフル権限で追加してください。
          </div>
        </details>
      )}

      {/* ─── リライト済みコラム一覧 ─── */}
      {rewriteHistory.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              ✍️ リライト済みコラム
              <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 600, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '1px 8px', borderRadius: '99px' }}>
                {rewriteHistory.length}件
              </span>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
              AIが既存記事を自動で上書き＋公開します。「状態」で反映状況を確認できます
            </span>
          </div>
          {/* 最大5件まで表示し、それ以上はスクロール（ヘッダーは固定） */}
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['生成日', 'タイトル', '元記事', '状態', '操作'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-base)', zIndex: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rewriteHistory.flatMap((r, i) => {
                  const expanded = expandedRewrite === r.jobId;
                  const rows = [
                    <tr key={r.jobId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '11px' }}>{fmtDate(r.createdAt)}</td>
                      {/* タイトル＝公開中の新記事。上書き公開済みのものはここからリンクで開ける */}
                      <td style={{ padding: '10px 14px', maxWidth: '320px' }}>
                        {r.postState === 'published' && (r.postUrl || r.originalUrl) ? (
                          <a href={r.postUrl || r.originalUrl} target="_blank" rel="noreferrer"
                             style={{ fontWeight: 600, color: '#4338ca', lineHeight: 1.5, textDecoration: 'none' }}
                             title="公開中の記事を開く">
                            {r.newTitle} <span style={{ fontSize: '10px' }}>↗</span>
                          </a>
                        ) : (
                          <div style={{ fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.5 }}>{r.newTitle}</div>
                        )}
                      </td>
                      {/* 元記事は「リライト前のタイトル」。上書きなのでリンク先は新記事と同じため、ここはテキスト表示のみ */}
                      <td style={{ padding: '10px 14px', maxWidth: '220px' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={r.originalTitle}>
                          {r.originalTitle || '−'}
                        </span>
                        {r.category && (
                          <span style={{ marginTop: '3px', display: 'inline-block', fontSize: '10px', padding: '1px 7px', borderRadius: '99px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>{r.category}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const PS = {
                            published: { t: '公開済み', c: '#15803d', b: '#f0fdf4', bd: '#bbf7d0' },
                            posting:   { t: '反映待ち', c: '#2563eb', b: '#eff6ff', bd: '#bfdbfe' },
                            error:     { t: 'エラー',   c: '#dc2626', b: '#fef2f2', bd: '#fecaca' },
                            manual:    { t: 'コピー用', c: '#71717a', b: '#f4f4f5', bd: '#e4e4e7' },
                          };
                          const ps = PS[r.postState] || PS.manual;
                          const badge = (
                            <span title={r.postState === 'error' ? (r.errorMsg || '') : ''}
                              style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', color: ps.c, background: ps.b, border: '1px solid ' + ps.bd, whiteSpace: 'nowrap' }}>
                              {r.postState === 'posting' ? '⏳ ' : ''}{ps.t}
                            </span>
                          );
                          return (r.postState === 'published' && (r.postUrl || r.originalUrl))
                            ? <a href={r.postUrl || r.originalUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{badge}</a>
                            : badge;
                        })()}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => setExpandedRewrite(expanded ? null : r.jobId)}
                            style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-sub)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {expanded ? '隠す' : 'プレビュー'}
                          </button>
                          <button onClick={() => copyRewrite(r)}
                            style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '6px', border: '1.5px solid #6366f1', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: copiedRewrite === r.jobId ? '#6366f1' : 'transparent', color: copiedRewrite === r.jobId ? '#fff' : '#6366f1' }}>
                            {copiedRewrite === r.jobId ? '✓' : 'コピー'}
                          </button>
                          <button onClick={() => deleteRewrite(r.jobId)} title="一覧から削除"
                            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>,
                  ];
                  if (expanded) {
                    rows.push(
                      <tr key={r.jobId + '-prev'}>
                        <td colSpan={5} style={{ padding: 0, background: '#faf5ff' }}>
                          <div style={{ padding: '14px 18px' }}>
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 18px', background: '#fff', fontSize: '13px', lineHeight: 1.8, maxHeight: '360px', overflowY: 'auto' }}
                                 dangerouslySetInnerHTML={{ __html: r.html }} />
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
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
          {/* ─── A3: ヒーロー「次にやること」── リライト対象 + 不足カテゴリ */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <a
              href="#rewrite-list"
              style={{
                flex: 1, minWidth: 0, textDecoration: 'none',
                background: rewriteCandidates.length > 0 ? '#fef2f2' : '#ffffff',
                border: '1px solid ' + (rewriteCandidates.length > 0 ? '#fecaca' : 'var(--border)'),
                borderLeft: '4px solid #dc2626',
                borderRadius: '12px', padding: '14px 18px',
                boxShadow: 'var(--shadow-card)',
                display: 'flex', alignItems: 'center', gap: '14px',
              }}
            >
              <div style={{ fontSize: '28px', flexShrink: 0 }}>🔄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>リライト対象コラム</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: rewriteCandidates.length > 0 ? '#dc2626' : 'var(--text-dimmer)', lineHeight: 1 }}>
                  {rewriteCandidates.length}<span style={{ fontSize: '12px', marginLeft: '4px', color: 'var(--text-muted)' }}>件</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '4px' }}>
                  圏外: {offRankCount}件 / クリックで一覧へ
                </div>
              </div>
            </a>
            <a
              href="#category-stats"
              style={{
                flex: 1, minWidth: 0, textDecoration: 'none',
                background: missingCategoryCount > 0 ? '#fffbeb' : '#ffffff',
                border: '1px solid ' + (missingCategoryCount > 0 ? '#fde68a' : 'var(--border)'),
                borderLeft: '4px solid #d97706',
                borderRadius: '12px', padding: '14px 18px',
                boxShadow: 'var(--shadow-card)',
                display: 'flex', alignItems: 'center', gap: '14px',
              }}
            >
              <div style={{ fontSize: '28px', flexShrink: 0 }}>📂</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>不足カテゴリ</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: missingCategoryCount > 0 ? '#d97706' : 'var(--text-dimmer)', lineHeight: 1 }}>
                  {missingCategoryCount > 0 ? missingCategoryCount : '−'}
                  {missingCategoryCount > 0 && <span style={{ fontSize: '12px', marginLeft: '4px', color: 'var(--text-muted)' }}>種類</span>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '4px' }}>
                  {!analysis ? 'AI分析後に表示されます' : 'クリックで詳細へ'}
                </div>
              </div>
            </a>
          </div>

          {/* ─── B. サマリーカード（6枚 ＝ 詳細指標） ─── */}
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
              label={hasGa4 ? '月間セッション' : '90日クリック'}
              value={hasGa4 ? fmtNum(totalSessions) : fmtNum(totalClicks)}
              unit={hasGa4 ? 'セッション' : 'クリック'}
              sub={hasGa4 ? 'GA4 / 過去90日' : 'GSC / 過去90日（GA4未連携）'}
            />
            <SummaryCard
              label="リライト対象"
              value={rewriteCandidates.length}
              unit="件"
              color="#dc2626"
              sub={`定義: GSC順位21位以下 または CTR2%未満（表示100回+）または 24ヶ月以上経過で圏外 ／ 圏外記事: ${offRankCount}件`}
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
            <div id="category-stats" style={{
              background: '#ffffff', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden', marginBottom: '20px',
              scrollMarginTop: '20px',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>カテゴリ別分析</div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                  カテゴリごとの<b>規模感</b>（記事数）と<b>SEO健康度</b>（順位・CTR・クリック）を比較
                </div>
              </div>

              {/* 凡例：色の意味 */}
              <div style={{
                padding: '8px 20px', borderBottom: '1px solid var(--border)',
                background: '#fafafa', display: 'flex', gap: '16px', flexWrap: 'wrap',
                fontSize: '11px', color: 'var(--text-sub)',
              }}>
                <span>📊 <b style={{ color: 'var(--text-main)' }}>記事数バー</b>: サイト内のボリューム比</span>
                <span><span style={{ color: '#16a34a', fontWeight: 700 }}>●</span> 好調</span>
                <span><span style={{ color: '#d97706', fontWeight: 700 }}>●</span> 要強化（11〜20位 / CTR1〜3%）</span>
                <span><span style={{ color: '#dc2626', fontWeight: 700 }}>●</span> 要対策・圏外</span>
              </div>

              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-base)' }}>
                      {[
                        { label: 'カテゴリ',  align: 'left'  },
                        { label: '記事数 (規模感)',  align: 'left'  },
                        { label: '平均順位',  align: 'right' },
                        { label: 'CTR',       align: 'right' },
                        { label: '90日クリック', align: 'right' },
                        { label: '状況',      align: 'center' },
                      ].map(h => (
                        <th key={h.label} style={{
                          padding: '10px 14px', textAlign: h.align,
                          fontWeight: 600, color: 'var(--text-sub)',
                          borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                          fontSize: '11px', letterSpacing: '0.02em',
                        }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const maxCount  = Math.max(...categoryStats.map(c => c.count), 1);
                      const maxClicks = Math.max(...categoryStats.map(c => c.clicks || 0), 1);
                      return categoryStats.flatMap((cat, i) => {
                        const status = getCategoryStatus(cat);
                        const countPct = (cat.count / maxCount) * 100;
                        const isTop3 = categoryStats.slice(0, 3).includes(cat);
                        const barColor = isTop3 ? '#6366f1' : '#a5b4fc';
                        const posColor = cat.avgPosition == null ? '#a1a1aa'
                                       : cat.avgPosition < 10  ? '#16a34a'
                                       : cat.avgPosition < 20  ? '#d97706'
                                       : '#dc2626';
                        const ctrColor = cat.avgCtr == null ? '#a1a1aa'
                                       : cat.avgCtr > 0.03 ? '#16a34a'
                                       : cat.avgCtr > 0.01 ? '#d97706'
                                       : '#dc2626';
                        const clickIntensity = (cat.clicks || 0) / maxClicks;
                        const isSelected = selectedCategory === cat.name;

                        // ドリルダウン: このカテゴリに属する記事
                        const catPostIds = new Set(
                          (analysis?.articleCategories || [])
                            .filter(a => a.category === cat.name)
                            .map(a => String(a.id))
                        );
                        const catPosts = enriched
                          .filter(p => catPostIds.has(String(p.id)))
                          .sort((a, b) => (a.gsc?.position ?? 999) - (b.gsc?.position ?? 999));

                        const rows = [
                          <tr
                            key={cat.name}
                            onClick={() => setSelectedCategory(isSelected ? null : cat.name)}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              cursor: 'pointer',
                              background: isSelected ? '#f5f3ff' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                          >
                            {/* カテゴリ名 */}
                            <td style={{ padding: '12px 14px', fontWeight: 600, color: isSelected ? '#6366f1' : 'var(--text-main)', whiteSpace: 'nowrap' }}>
                              {isSelected ? '▾ ' : '▸ '}{cat.name}
                            </td>

                            {/* 記事数 - 棒グラフ + 今月件数 */}
                            <td style={{ padding: '12px 14px', minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1, height: '10px', background: '#f4f4f5', borderRadius: '5px', overflow: 'hidden', minWidth: '100px' }}>
                                  <div style={{ width: countPct + '%', height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.3s' }} />
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '13px' }}>
                                    {cat.count}
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '2px' }}>件</span>
                                  </span>
                                  {cat.monthlyCount > 0 && (
                                    <div style={{ fontSize: '10px', color: '#6366f1', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                      今月+{cat.monthlyCount}件
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 平均順位 */}
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span style={{ fontWeight: 700, color: posColor, fontSize: '14px' }}>
                                {cat.avgPosition != null ? cat.avgPosition.toFixed(1) : '−'}
                              </span>
                              {cat.avgPosition != null && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }}>位</span>
                              )}
                            </td>

                            {/* CTR */}
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span style={{ color: ctrColor, fontWeight: 600, fontSize: '13px' }}>
                                {fmtPct(cat.avgCtr)}
                              </span>
                            </td>

                            {/* クリック */}
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span style={{ fontWeight: 700, color: clickIntensity > 0.5 ? 'var(--text-main)' : 'var(--text-sub)', fontSize: '13px' }}>
                                {fmtNum(cat.clicks)}
                              </span>
                            </td>

                            {/* 状況 */}
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <StatusBadge {...status} />
                            </td>
                          </tr>,
                        ];

                        // ドリルダウン行（選択中のみ表示）
                        if (isSelected) {
                          rows.push(
                            <tr key={cat.name + '-drill'}>
                              <td colSpan={6} style={{ padding: '0 0 4px', background: '#f5f3ff', borderBottom: '2px solid #c4b5fd' }}>
                                <div style={{ padding: '12px 16px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9', marginBottom: '8px' }}>
                                    📂 {cat.name}の記事一覧（{catPosts.length}件）
                                    <button
                                      onClick={e => { e.stopPropagation(); setSelectedCategory(null); }}
                                      style={{ marginLeft: '12px', fontSize: '11px', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                                    >✕ 閉じる</button>
                                  </div>
                                  {catPosts.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>記事データがありません</div>
                                  ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                      <thead>
                                        <tr style={{ background: '#ede9fe' }}>
                                          {['タイトル', '平均順位', 'CTR', '90日クリック', '状況'].map((h, hi) => (
                                            <th key={h} style={{ padding: '6px 10px', textAlign: hi === 0 ? 'left' : 'right', fontWeight: 600, color: '#6d28d9', borderBottom: '1px solid #c4b5fd', whiteSpace: 'nowrap', fontSize: '11px' }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {catPosts.map((p, pi) => {
                                          const ps = getPostStatus(p);
                                          const pos = p.gsc?.position;
                                          const pColor = pos == null ? '#a1a1aa' : pos < 10 ? '#16a34a' : pos < 20 ? '#d97706' : '#dc2626';
                                          const ctr = p.gsc?.ctr;
                                          const cColor = ctr == null ? '#a1a1aa' : ctr > 0.03 ? '#16a34a' : ctr > 0.01 ? '#d97706' : '#dc2626';
                                          return (
                                            <tr key={p.id} style={{ borderBottom: pi < catPosts.length - 1 ? '1px solid #ddd6fe' : 'none' }}>
                                              <td style={{ padding: '7px 10px', maxWidth: '360px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                  <span style={{ fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap', paddingTop: '2px', flexShrink: 0 }}>
                                                    {fmtDate(p.date)}
                                                  </span>
                                                  {p.editUrl ? (
                                                    <a href={p.editUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                                      style={{ color: '#4c1d95', fontWeight: 600, textDecoration: 'none', fontSize: '12px', lineHeight: 1.5 }}
                                                      title={p.title}>
                                                      {p.title?.length > 45 ? p.title.slice(0, 45) + '…' : p.title || '(無題)'}
                                                    </a>
                                                  ) : (
                                                    <span style={{ fontWeight: 600, fontSize: '12px', lineHeight: 1.5 }}>{p.title?.length > 45 ? p.title.slice(0, 45) + '…' : p.title || '(無題)'}</span>
                                                  )}
                                                </div>
                                              </td>
                                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: pColor, fontSize: '13px' }}>
                                                {pos != null ? pos.toFixed(1) + '位' : '−'}
                                              </td>
                                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: cColor }}>
                                                {ctr != null ? (ctr * 100).toFixed(1) + '%' : '−'}
                                              </td>
                                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>
                                                {p.gsc?.clicks != null ? p.gsc.clicks.toLocaleString() : '−'}
                                              </td>
                                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                                <StatusBadge {...ps} />
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return rows;
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── D. 不足カテゴリ + AI考察 ─── */}
          {analysis && ((analysis.categoryGaps || []).length > 0 || (analysis.rewriteCandidates || []).length > 0) && (() => {
            // jube（ハウジング重兵衛）は外壁塗装系は nurube のドメインのため非表示
            const JUBE_EXCLUDE = ['外壁塗装', '外壁', '屋根塗装', '屋根塗', '防水工事', 'コーキング', '塗装', '塗料'];
            const filteredGaps = siteId === 'jube'
              ? (analysis.categoryGaps || []).filter(gap =>
                  !JUBE_EXCLUDE.some(kw => (gap.category || '').includes(kw) || (gap.reason || '').includes(kw))
                )
              : (analysis.categoryGaps || []);
            return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '20px' }}>
              {/* 不足カテゴリ */}
              {filteredGaps.length > 0 && (
                <div style={{
                  background: '#ffffff', border: '1px solid var(--border)',
                  borderRadius: '12px', overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>不足カテゴリ</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '2px' }}>コンテンツギャップ</div>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filteredGaps.map((gap, i) => {
                      const impactColor = gap.impact === 'high' ? { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', label: '高インパクト' }
                                        : gap.impact === 'medium' ? { bg: '#fffbeb', border: '#fde68a', color: '#d97706', label: '中インパクト' }
                                        : { bg: '#f4f4f5', border: '#e4e4e7', color: '#71717a', label: '低インパクト' };
                      return (
                        <div key={i} style={{
                          background: '#fafafa', border: '1px solid var(--border)',
                          borderRadius: '8px', padding: '10px 12px',
                          display: 'flex', flexDirection: 'column', gap: '6px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                                💡 {gap.category}
                              </span>
                              {gap.impact && (
                                <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '99px', background: impactColor.bg, color: impactColor.color, border: `1px solid ${impactColor.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {impactColor.label}
                                </span>
                              )}
                            </div>
                            <a
                              href={`/column?keyword=${encodeURIComponent(gap.category)}&siteId=${encodeURIComponent(siteId)}`}
                              style={{ padding: '3px 10px', borderRadius: '6px', background: '#6366f1', color: '#ffffff', fontSize: '11px', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                            >
                              新規作成
                            </a>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
                            {gap.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI考察（総論） */}
              {(analysis.rewriteSummaryPoints || []).length > 0 && (
                <div style={{
                  background: '#ffffff', border: '1px solid var(--border)',
                  borderRadius: '12px', overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>AI考察</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '2px' }}>リライト対象の全体傾向・改善方針</div>
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(analysis.rewriteSummaryPoints || []).map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span style={{
                          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                          background: '#f5f3ff', border: '1px solid #ddd6fe',
                          color: '#6366f1', fontSize: '10px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: '1px',
                        }}>
                          {i + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '3px', lineHeight: 1.5 }}>
                            {r.point}
                          </div>
                          {r.detail && (
                            <div style={{ fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.7 }}>
                              {r.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );})()}

          {/* ─── E. リライト対象コラム一覧 ─── */}
          {rewriteWithReason.length > 0 && (() => {
            // A1: フィルター適用
            const filteredRewrites = rewriteWithReason.filter(post => {
              // 順位帯フィルター
              if (rewriteRange !== 'all') {
                const pos = post.gsc?.position;
                if (rewriteRange === 'off') {
                  if (post.gsc && post.gsc.impressions > 0) return false; // GSC上に出ていれば圏外ではない
                } else if (rewriteRange === 'pos11_20') {
                  if (!pos || pos < 11 || pos > 20) return false;
                } else if (rewriteRange === 'pos21+') {
                  if (!pos || pos <= 20) return false;
                }
              }
              // カテゴリフィルター
              if (rewriteCategory !== 'all') {
                const cat = postCategoryMap[String(post.id)] || '';
                if (cat !== rewriteCategory) return false;
              }
              return true;
            });
            // カテゴリの選択肢（リライト候補に含まれるカテゴリのみ）
            const catOptions = [...new Set(rewriteWithReason.map(p => postCategoryMap[String(p.id)]).filter(Boolean))].sort();
            const hasActiveFilter = rewriteRange !== 'all' || rewriteCategory !== 'all';

            return (
            <div id="rewrite-list" style={{
              background: '#ffffff', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden',
              scrollMarginTop: '20px',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', flex: 1 }}>
                    リライト対象コラム
                    <span style={{
                      marginLeft: '8px', fontSize: '12px', fontWeight: 600,
                      color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca',
                      padding: '1px 8px', borderRadius: '99px',
                    }}>
                      {hasActiveFilter ? `${filteredRewrites.length} / ${rewriteWithReason.length}件` : `${rewriteWithReason.length}件`}
                    </span>
                  </div>
                  {/* 上位10件を一括リライト */}
                  <button
                    onClick={() => setBulkPosts(
                      filteredRewrites.slice(0, 10).map(p => ({ ...p, category: postCategoryMap[String(p.id)] || '' }))
                    )}
                    disabled={filteredRewrites.length === 0}
                    title="リライト対象の上位10件を、AIで構成→本文までまとめて自動生成します"
                    style={{
                      padding: '8px 16px', borderRadius: '8px', border: 'none',
                      background: filteredRewrites.length === 0 ? 'var(--border)' : '#6366f1',
                      color: filteredRewrites.length === 0 ? 'var(--text-muted)' : '#ffffff',
                      fontSize: '12px', fontWeight: 700,
                      cursor: filteredRewrites.length === 0 ? 'default' : 'pointer',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    ⚡ 上位{Math.min(10, filteredRewrites.length)}件を一括リライト
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>圏外・順位20位以下・CTR2%未満・更新12ヶ月超の記事</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>↓ スクロールで全件表示</span>
                </div>

                {/* A1: フィルター行 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>絞り込み:</span>
                  {[
                    { key: 'all',      label: 'すべて' },
                    { key: 'off',      label: '圏外のみ' },
                    { key: 'pos11_20', label: '順位 11-20' },
                    { key: 'pos21+',   label: '順位 21+' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setRewriteRange(key)}
                      style={{
                        fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
                        border: 'none', cursor: 'pointer',
                        background: rewriteRange === key ? '#dc2626' : '#f4f4f5',
                        color: rewriteRange === key ? '#ffffff' : 'var(--text-muted)',
                        fontWeight: 500,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  {catOptions.length > 0 && (
                    <select
                      value={rewriteCategory}
                      onChange={e => setRewriteCategory(e.target.value)}
                      style={{
                        fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                        border: '1px solid ' + (rewriteCategory !== 'all' ? '#dc2626' : 'var(--border)'),
                        color: rewriteCategory !== 'all' ? '#dc2626' : 'var(--text-muted)',
                        background: '#ffffff', cursor: 'pointer',
                      }}
                    >
                      <option value="all">全カテゴリ</option>
                      {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  {hasActiveFilter && (
                    <button
                      onClick={() => { setRewriteRange('all'); setRewriteCategory('all'); }}
                      style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                    >✕ リセット</button>
                  )}
                </div>
              </div>

              <div style={{
                maxHeight: '680px',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '16px',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr',
                  gap: '12px',
                }}>
                {filteredRewrites.map((post, i) => {
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
                        <span style={{ fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap', paddingTop: '3px', flexShrink: 0 }}>
                          {fmtDate(post.date)}
                        </span>
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
            </div>
            );
          })()}

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
          siteId={siteId}
          onClose={() => setModalPost(null)}
          onSaved={() => fetchRewriteHistory(siteId)}
        />
      )}

      {/* 一括リライトモーダル */}
      {bulkPosts && (
        <BulkRewriteModal
          posts={bulkPosts}
          siteId={siteId}
          onClose={() => setBulkPosts(null)}
          onSaved={() => fetchRewriteHistory(siteId)}
        />
      )}
    </div>
  );
}
