'use client';

import { useEffect, useRef, useState } from 'react';
import { getSiteMeta, siteAvatarStyle, SITE_META } from '@/lib/siteMeta';
import { useAllAnalysisStates } from '@/lib/useAnalysisStore';

const JOB_STATUS = {
  running: { label: '実行中', bg: '#eff6ff', color: '#2563eb' },
  done:    { label: '完了',   bg: '#f0fdf4', color: '#15803d' },
  error:   { label: '失敗',   bg: '#fef2f2', color: '#dc2626' },
};

const WP_STATUS = {
  draft:      { label: '下書き',    color: '#71717a', bg: '#f4f4f5' },
  publish:    { label: '公開済み',  color: '#15803d', bg: '#f0fdf4' },
  future:     { label: '予約投稿',  color: '#b45309', bg: '#fffbeb' },
  wp_deleted: { label: 'WP削除済', color: '#dc2626', bg: '#fef2f2' },
};

const JOB_TYPE = {
  column:     { label: 'コラム生成',   icon: '✍️' },
  case_study: { label: '施工事例取込', icon: '🏗️' },
  seo_check:  { label: 'SEO順位取得', icon: '📊' },
};

// 実行中ジョブの目安時間を返す（分単位、null=不明）
function calcEta(job) {
  if (job.status !== 'running') return null;
  const elapsedSec = (Date.now() - new Date(job.startedAt)) / 1000;
  // seo_check: キーワード数 × 2.2s が目安。meta に keywordCount があれば使用
  const estimateSec =
    job.jobType === 'seo_check'  ? (job.meta?.keywordCount || 120) * 2.2
    : job.jobType === 'column'   ? 90
    : job.jobType === 'case_study' ? (job.meta?.limit || 10) * 8
    : null;
  if (estimateSec == null) return null;
  return Math.max(1, Math.ceil((estimateSec - elapsedSec) / 60));
}

const FILTERS = [
  { key: 'all',     label: 'すべて'   },
  { key: 'running', label: '実行中'   },
  { key: 'draft',   label: '下書き'   },
  { key: 'publish', label: '公開済み' },
  { key: 'future',  label: '予約投稿' },
  { key: 'error',   label: 'エラー'   },
];

function jobMatchesFilter(job, filter) {
  if (filter === 'all')     return true;
  if (filter === 'running') return job.status === 'running';
  if (filter === 'error')   return job.status === 'error';
  // WPステータスで絞り込み: contentItemsのpostResult.postStatusで判定
  if (filter === 'draft' || filter === 'publish' || filter === 'future') {
    return job.contentItems.some(
      (item) => item.postResult?.postStatus === filter
    );
  }
  return true;
}

// リライト候補判定（column-analysis/page.js と同じロジック）
function monthsAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24 * 30));
}
function isRewriteCandidate(post) {
  const mo = monthsAgo(post.date);
  if (mo == null || mo < 6) return false;
  if (post.gsc) {
    if (post.gsc.position > 20) return true;
    if (post.gsc.position > 10 && post.gsc.impressions >= 100 && post.gsc.ctr < 0.02) return true;
    if (mo >= 18 && post.gsc.position > 10) return true;
    return false;
  }
  return mo >= 24;
}
function buildGscMap(gscData) {
  const map = {};
  (gscData || []).forEach(row => {
    if (!row.url) return;
    map[row.url] = row;
    try { map[decodeURIComponent(row.url)] = row; } catch {}
  });
  return map;
}

export default function JobListPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);

  // グローバル分析ストア（リアルタイム進捗 + キャッシュ済みデータ）
  const allAnalysisStates = useAllAnalysisStates();
  // 自動更新: 実行中ジョブがある間は5分ごとに再取得
  const autoRefreshTimer = useRef(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(null); // 残り秒数
  const countdownTimer  = useRef(null);

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setJobs(data.jobs);
    } finally {
      setLoading(false);
    }
  }

  async function retryJob(jobId) {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { alert('再実行をキューに登録しました'); fetchJobs(); }
      else alert('エラー: ' + data.error);
    } finally { setRetrying(null); }
  }

  async function deleteJob(jobId) {
    setDeleting(jobId);
    try {
      const res  = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setJobs((prev) => prev.filter((j) => j.id !== jobId));
      else alert('削除に失敗しました: ' + (data.error || '不明なエラー'));
    } finally { setDeleting(null); }
  }

  async function syncWpStatus() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch('/api/jobs/sync-wp', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncResult(data.updated > 0
          ? `${data.updated}件のステータスを更新しました`
          : '変更なし'
        );
        if (data.updated > 0) fetchJobs();
      } else {
        setSyncResult('同期エラー: ' + data.error);
      }
    } catch (e) {
      setSyncResult('同期エラー: ' + e.message);
    } finally {
      setSyncing(false);
      // 3秒後にメッセージ消去
      setTimeout(() => setSyncResult(null), 3000);
    }
  }

  const AUTO_REFRESH_SEC = 300; // 5分

  // ジョブ取得後: 実行中ジョブがあれば5分タイマーをセット
  function scheduleAutoRefresh(jobList) {
    // 既存タイマーをクリア
    if (autoRefreshTimer.current)  clearTimeout(autoRefreshTimer.current);
    if (countdownTimer.current)     clearInterval(countdownTimer.current);

    const hasRunning = jobList.some(j => j.status === 'running');
    if (!hasRunning) {
      setNextRefreshIn(null);
      return;
    }

    // カウントダウン表示
    let remaining = AUTO_REFRESH_SEC;
    setNextRefreshIn(remaining);
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      setNextRefreshIn(remaining > 0 ? remaining : null);
      if (remaining <= 0) clearInterval(countdownTimer.current);
    }, 1000);

    // 5分後に再取得
    autoRefreshTimer.current = setTimeout(async () => {
      clearInterval(countdownTimer.current);
      setNextRefreshIn(null);
      const res = await fetch('/api/jobs', { cache: 'no-store' }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.success) {
          setJobs(data.jobs);
          scheduleAutoRefresh(data.jobs); // 再帰的にセット
        }
      }
    }, AUTO_REFRESH_SEC * 1000);
  }

  useEffect(() => {
    fetchJobs();
    return () => {
      if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
      if (countdownTimer.current)    clearInterval(countdownTimer.current);
    };
  }, []);

  // ストアから直接リライト統計を計算（リアルタイム反映）
  const rewriteStats = Object.entries(allAnalysisStates)
    .filter(([, s]) => s.posts && s.posts.length > 0)
    .map(([siteId, s]) => {
      const gscMap = buildGscMap(s.gscData || []);
      const enriched = (s.posts || []).map(p => {
        let gsc = null;
        if (p.url) {
          gsc = gscMap[p.url] || null;
          if (!gsc) { try { gsc = gscMap[decodeURIComponent(p.url)] || null; } catch {} }
          if (!gsc) { try { gsc = gscMap[encodeURI(p.url)]          || null; } catch {} }
        }
        return { ...p, gsc };
      });
      const rewriteCount = enriched.filter(isRewriteCandidate).length;
      const categoryCount = s.analysis
        ? [...new Set((s.analysis.articleCategories || []).map(a => a.category))].length
        : null;
      return {
        siteId,
        status:        s.status,
        loadingStep:   s.loadingStep,
        postCount:     s.posts.length,
        rewriteCount,
        categoryCount,
        hasGsc:        (s.gscData || []).length > 0,
        hasAnalysis:   !!s.analysis,
        cachedAt:      s.cacheInfo?.cachedAt || null,
      };
    });

  // jobsが更新されたら自動更新タイマーを再評価
  useEffect(() => {
    if (jobs.length > 0) scheduleAutoRefresh(jobs);
  }, [jobs]);

  // サイト一覧を動的に収集（shortName使用・order順に並び替え）
  const siteOptions = [
    { key: 'all', label: 'すべてのサイト' },
    ...Array.from(new Set(jobs.map(j => j.siteId)))
      .map(siteId => {
        const sm = getSiteMeta(siteId);
        return { key: siteId, label: sm.shortName || sm.name || siteId, order: sm.order ?? 99 };
      })
      .sort((a, b) => a.order - b.order),
  ];

  const filteredJobs = jobs.filter((j) => {
    if (!jobMatchesFilter(j, filter)) return false;
    if (siteFilter !== 'all' && j.siteId !== siteFilter) return false;
    if (typeFilter !== 'all' && j.jobType !== typeFilter) return false;
    return true;
  });

  // 進行中の分析があるか
  const analyzingEntries = rewriteStats.filter(s => s.status === 'loading' || s.status === 'analyzing');

  return (
    <div>
      {/* ─── 分析進行中バナー ─── */}
      {analyzingEntries.length > 0 && (
        <div style={{
          background: '#f5f3ff', border: '1px solid #ddd6fe',
          borderRadius: '12px', padding: '12px 18px',
          marginBottom: '14px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{ fontSize: '22px', flexShrink: 0 }}>📊</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#6d28d9', marginBottom: '2px' }}>
              コラム分析を実行中…
            </div>
            {analyzingEntries.map(s => {
              const sm = getSiteMeta(s.siteId);
              return (
                <div key={s.siteId} style={{ fontSize: '12px', color: '#7c3aed', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: sm.color }}>{sm.shortName}</span>
                  {s.loadingStep ? `：${s.loadingStep}` : ''}
                </div>
              );
            })}
          </div>
          <a href="/column-analysis" style={{
            fontSize: '12px', fontWeight: 600, padding: '6px 14px',
            borderRadius: '7px', background: '#6366f1', color: '#ffffff',
            textDecoration: 'none', flexShrink: 0,
          }}>
            詳細を見る
          </a>
        </div>
      )}

      {/* コラム分析・リライトサマリー */}
      {rewriteStats.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px', boxShadow: 'var(--shadow-card)' }}>
          {/* ヘッダー */}
          <div
            onClick={() => setRewriteOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 16px', background: '#fafafa', cursor: 'pointer', userSelect: 'none', borderBottom: rewriteOpen ? '1px solid var(--border)' : 'none' }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>🔄 コラム分析・リライト</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
              {rewriteOpen ? '▲' : '▼'}
            </span>
          </div>

          {rewriteOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rewriteStats.length}, 1fr)`, gap: '0' }}>
              {rewriteStats.map((stat, i) => {
                const sm = getSiteMeta(stat.siteId);
                const hoursAgo = stat.cachedAt ? Math.floor((Date.now() - stat.cachedAt) / (1000 * 60 * 60)) : null;
                return (
                  <div key={stat.siteId} style={{
                    padding: '14px 16px',
                    borderRight: i < rewriteStats.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    {/* サイト名 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span style={siteAvatarStyle(stat.siteId, 18)}>{sm.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: sm.color }}>{sm.name}</span>
                      {hoursAgo != null && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {hoursAgo}時間前に分析
                        </span>
                      )}
                    </div>

                    {/* 指標3つ */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      {/* 総コラム数 */}
                      <div style={{ flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>{stat.postCount}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>総記事数</div>
                      </div>
                      {/* リライト対象 */}
                      <div style={{ flex: 1, background: stat.rewriteCount > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: stat.rewriteCount > 0 ? '#dc2626' : 'var(--text-muted)' }}>{stat.rewriteCount}</div>
                        <div style={{ fontSize: '10px', color: stat.rewriteCount > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: '2px' }}>リライト対象</div>
                      </div>
                      {/* カテゴリ数 */}
                      <div style={{ flex: 1, background: stat.hasAnalysis ? '#f5f3ff' : '#f8fafc', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: stat.hasAnalysis ? '#6366f1' : 'var(--text-muted)' }}>
                          {stat.categoryCount != null ? stat.categoryCount : '−'}
                        </div>
                        <div style={{ fontSize: '10px', color: stat.hasAnalysis ? '#6366f1' : 'var(--text-muted)', marginTop: '2px' }}>カテゴリ数</div>
                      </div>
                    </div>

                    {/* 分析進行中インジケーター */}
                    {(stat.status === 'loading' || stat.status === 'analyzing') && (
                      <div style={{
                        background: '#f5f3ff', border: '1px solid #ddd6fe',
                        borderRadius: '7px', padding: '6px 10px',
                        fontSize: '11px', color: '#7c3aed', marginBottom: '8px', lineHeight: 1.5,
                      }}>
                        ⏳ {stat.loadingStep || '分析中…'}
                      </div>
                    )}

                    {/* ステータスバッジ */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: stat.hasGsc ? '#f0fdf4' : '#fef2f2', color: stat.hasGsc ? '#16a34a' : '#dc2626', border: `1px solid ${stat.hasGsc ? '#bbf7d0' : '#fecaca'}` }}>
                        GSC {stat.hasGsc ? '✓ 取得済' : '✗ なし'}
                      </span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: stat.hasAnalysis ? '#f5f3ff' : '#f4f4f5', color: stat.hasAnalysis ? '#6366f1' : '#71717a', border: `1px solid ${stat.hasAnalysis ? '#ddd6fe' : '#e4e4e7'}` }}>
                        AI分析 {stat.hasAnalysis ? '✓ 済' : stat.status === 'analyzing' ? '⏳ 実行中' : '未実施'}
                      </span>
                    </div>

                    {/* 分析ページへのリンク */}
                    <a
                      href={`/column-analysis?siteId=${stat.siteId}`}
                      style={{ display: 'block', textAlign: 'center', padding: '7px', borderRadius: '7px', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(99,102,241,0.2)' }}
                    >
                      コラム分析を開く →
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 当月コラムサマリー */}
      {!loading && (() => {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const yearMonth = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });

        // 当月のコラムアイテムを収集
        const monthlyColumns = jobs
          .filter(j => j.jobType === 'column' && j.startedAt && j.startedAt.startsWith(thisMonth))
          .flatMap(j => j.contentItems.map(item => ({
            keyword:   j.meta?.keyword || item.generatedTitle || '(不明)',
            siteId:    j.siteId,
            status:    item.postResult?.postStatus,
            wpEditUrl: item.postResult?.wpEditUrl,
          })));
        if (monthlyColumns.length === 0) return null;

        // サイト一覧（登場順）
        const siteIds = [...new Set(monthlyColumns.map(c => c.siteId))];
        // ステータス列定義
        const ST_COLS = [
          { key: 'publish', label: '公開',  bg: '#f0fdf4', color: '#15803d' },
          { key: 'future',  label: '予約',  bg: '#fffbeb', color: '#b45309' },
          { key: 'draft',   label: '下書き', bg: '#f4f4f5', color: '#71717a' },
        ];

        // サイト別×ステータス別カウント
        const countBySite = {};
        siteIds.forEach(sid => {
          const cols = monthlyColumns.filter(c => c.siteId === sid);
          countBySite[sid] = {
            total:   cols.length,
            publish: cols.filter(c => c.status === 'publish').length,
            future:  cols.filter(c => c.status === 'future').length,
            draft:   cols.filter(c => c.status === 'draft').length,
          };
        });
        const totalAll = monthlyColumns.length;

        // セルスタイル
        const th = { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                     padding: '6px 12px', textAlign: 'center', whiteSpace: 'nowrap' };
        const td = { fontSize: '12px', padding: '7px 12px', textAlign: 'center', color: 'var(--text-sub)' };
        const tdNum = (n, bg, color) => ({
          ...td,
          fontWeight: n > 0 ? 700 : 400,
          color: n > 0 ? color : 'var(--text-dimmer)',
        });

        return (
          <div className="rounded-xl mb-5"
               style={{ background: '#ffffff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>

            {/* ── ヘッダー ── */}
            <div
              onClick={() => setSummaryOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '11px 16px',
                        borderBottom: summaryOpen ? '1px solid var(--border)' : 'none',
                        background: '#fafafa', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>✍️ 当月コラム</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{yearMonth}</span>
              <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700,
                             padding: '2px 10px', borderRadius: '20px',
                             background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                計 {totalAll}件
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                {summaryOpen ? '▲' : '▼'}
              </span>
            </div>

            {/* ── 折り畳みコンテンツ ── */}
            {summaryOpen && (<>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: '#fafafa' }}>
                    <th style={{ ...th, textAlign: 'left', paddingLeft: '16px' }}>サイト</th>
                    {ST_COLS.map(s => (
                      <th key={s.key} style={th}>
                        <span style={{ padding: '2px 8px', borderRadius: '20px', background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                      </th>
                    ))}
                    <th style={th}>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {siteIds.map((sid, ri) => {
                    const sm = getSiteMeta(sid);
                    const c  = countBySite[sid];
                    return (
                      <tr key={sid} style={{ borderBottom: ri < siteIds.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ ...td, textAlign: 'left', paddingLeft: '16px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <span style={siteAvatarStyle(sid, 20)}>{sm.label}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '12px' }}>
                              {sm.name}
                            </span>
                          </span>
                        </td>
                        {ST_COLS.map(s => (
                          <td key={s.key} style={tdNum(c[s.key], s.bg, s.color)}>
                            {c[s.key] > 0
                              ? <span style={{ padding: '2px 10px', borderRadius: '20px', background: s.bg, color: s.color }}>
                                  {c[s.key]}件
                                </span>
                              : <span style={{ color: 'var(--text-dimmer)' }}>—</span>
                            }
                          </td>
                        ))}
                        <td style={{ ...td, fontWeight: 700, color: 'var(--text-main)' }}>{c.total}件</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── サイト別キーワード一覧 ── */}
            {siteIds.map((sid, si) => {
              const sm   = getSiteMeta(sid);
              const cols = monthlyColumns.filter(c => c.siteId === sid);
              return (
                <div key={sid} style={{ borderTop: '1px solid var(--border)' }}>
                  {/* サイト見出し */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px',
                                padding: '8px 16px', background: sm.bg, borderBottom: '1px solid ' + sm.border }}>
                    <span style={siteAvatarStyle(sid, 18)}>{sm.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: sm.color }}>{sm.name}</span>
                    <span style={{ fontSize: '11px', color: sm.color, opacity: 0.8 }}>{cols.length}件</span>
                  </div>
                  {/* キーワード行 */}
                  {cols.map((col, i) => {
                    const wpSt = WP_STATUS[col.status];
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 16px',
                        borderBottom: i < cols.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: '12px',
                      }}>
                        <span style={{ color: 'var(--text-dimmer)', fontSize: '11px', width: '18px',
                                       textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ flex: 1, color: 'var(--text-sub)',
                                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {col.keyword}
                        </span>
                        {wpSt && (
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px',
                                         borderRadius: '20px', background: wpSt.bg, color: wpSt.color, flexShrink: 0 }}>
                            {wpSt.label}
                          </span>
                        )}
                        {col.wpEditUrl && (
                          <a href={col.wpEditUrl} target="_blank" rel="noopener noreferrer"
                             style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none',
                                      padding: '1px 7px', borderRadius: '5px', background: 'var(--accent-dim)',
                                      flexShrink: 0 }}>
                            WP編集
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            </>)}
          </div>
        );
      })()}

      {/* フィルタータブ + 更新ボタン */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', minWidth: 0 }}>
        {/* ステータスフィルター（横スクロール） */}
        <div className="filter-scroll" style={{ display: 'flex', gap: '4px', flex: 1, minWidth: 0 }}>
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '5px 13px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                background: filter === key ? 'var(--accent)'    : 'var(--bg-input)',
                color:      filter === key ? '#ffffff'          : 'var(--text-muted)',
                transition: 'all 0.12s',
              }}
            >
              {label}
              {key !== 'all' && (
                <span style={{ marginLeft: '4px', opacity: 0.65, fontSize: '11px' }}>
                  {key === 'running' ? jobs.filter(j => j.status === 'running').length
                   : key === 'error'  ? jobs.filter(j => j.status === 'error').length
                   : jobs.filter(j => j.contentItems.some(i => i.postResult?.postStatus === key)).length}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* アクションボタン（常に右端に固定） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* 自動更新カウントダウン */}
          {nextRefreshIn !== null && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', color: '#2563eb',
              background: '#eff6ff', border: '1px solid #bfdbfe',
              padding: '3px 8px', borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ animation: 'spin 2s linear infinite', display: 'inline-block' }}>⟳</span>
              {Math.floor(nextRefreshIn / 60)}:{String(nextRefreshIn % 60).padStart(2, '0')}後に自動更新
            </span>
          )}
          {syncResult && (
            <span style={{ fontSize: '11px', color: syncResult.includes('エラー') ? '#dc2626' : '#15803d', whiteSpace: 'nowrap' }}>
              {syncResult}
            </span>
          )}
          <button
            onClick={syncWpStatus}
            disabled={syncing}
            title="WordPressの現在のステータスをDBに反映"
            style={{
              fontSize: '12px', padding: '5px 12px', borderRadius: '8px',
              border: '1px solid var(--border)',
              color: syncing ? 'var(--text-muted)' : 'var(--accent)',
              background: '#ffffff', cursor: syncing ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {syncing ? '同期中…' : 'WP同期'}
          </button>
          <button
            onClick={fetchJobs}
            style={{
              fontSize: '12px', padding: '5px 12px', borderRadius: '8px',
              border: '1px solid var(--border)',
              color: 'var(--text-sub)', background: '#ffffff', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            更新
          </button>
        </div>
      </div>

      {/* サイト・種別 絞り込み（横スクロール） */}
      <div className="filter-scroll"
           style={{ display: 'flex', gap: '6px', marginBottom: '16px', alignItems: 'center' }}>
        {siteOptions.map(({ key, label }) => {
          const sm = key === 'all' ? null : getSiteMeta(key);
          const isActive = siteFilter === key;
          return (
            <button
              key={key}
              onClick={() => setSiteFilter(key)}
              style={{
                padding: '3px 11px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
                flexShrink: 0,
                border: '1px solid ' + (isActive ? (sm ? sm.color : 'var(--accent)') : 'var(--border)'),
                background: isActive ? (sm ? sm.bg : 'var(--accent-dim)') : '#ffffff',
                color: isActive ? (sm ? sm.color : 'var(--accent)') : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {sm && <span style={siteAvatarStyle(key, 16)}>{sm.label}</span>}
              {label}
            </button>
          );
        })}
        <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />
        {[
          { key: 'all',        label: '全種別' },
          { key: 'column',     label: 'コラム' },
          { key: 'case_study', label: '施工事例' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            style={{
              padding: '3px 11px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
              flexShrink: 0,
              border: '1px solid ' + (typeFilter === key ? 'var(--accent)' : 'var(--border)'),
              background: typeFilter === key ? 'var(--accent-dim)' : '#ffffff',
              color: typeFilter === key ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >{label}</button>
        ))}
        {(siteFilter !== 'all' || typeFilter !== 'all') && (
          <button
            onClick={() => { setSiteFilter('all'); setTypeFilter('all'); }}
            style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none',
                     cursor: 'pointer', padding: '0 2px', flexShrink: 0, whiteSpace: 'nowrap' }}
          >✕ リセット</button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg p-4"
                 style={{ background: 'var(--bg-card-solid)', border: '0.5px solid var(--border-mid)' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                <div className="skeleton" style={{ width: '44px',  height: '20px' }} />
                <div className="skeleton" style={{ width: '72px',  height: '20px' }} />
                <div className="skeleton" style={{ width: '60px',  height: '20px' }} />
              </div>
              <div className="skeleton" style={{ width: '55%', height: '14px', marginBottom: '6px' }} />
              <div className="skeleton" style={{ width: '35%', height: '12px' }} />
            </div>
          ))}
        </div>
      ) : filteredJobs.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {filter === 'all' ? 'ジョブがありません。コラム生成や施工事例取込を実行してください。'
                            : `「${FILTERS.find(f => f.key === filter)?.label}」のジョブはありません。`}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const s  = JOB_STATUS[job.status] || { label: job.status, bg: '#1e1e30', color: '#94a3b8' };
            const sm = getSiteMeta(job.siteId);
            return (
              <div key={job.id} className="rounded-xl p-4"
                   style={{
                     background: '#ffffff',
                     border: '1px solid var(--border)',
                     boxShadow: 'var(--shadow-card)',
                     borderLeft: '3px solid ' + sm.color,
                   }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* ジョブステータス行 */}
                    <div className="flex items-center gap-2 mb-1.5" style={{ flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                                     borderRadius: '20px', background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{(JOB_TYPE[job.jobType] || {}).icon}</span>
                        <span>{(JOB_TYPE[job.jobType] || {}).label || job.jobType}</span>
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '11px', fontWeight: 500,
                        padding: '1px 7px 1px 3px', borderRadius: '20px',
                        background: sm.bg, color: sm.color, border: '0.5px solid ' + sm.border,
                      }}>
                        <span style={siteAvatarStyle(job.siteId, 16)}>{sm.label}</span>
                        {job.site?.siteName || job.siteId}
                      </span>
                    </div>
                    {job.meta?.keyword && (
                      <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: 'var(--text-main)' }}>
                        {job.meta.keyword}
                      </p>
                    )}
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      開始: {new Date(job.startedAt).toLocaleString('ja-JP')}
                      {job.finishedAt && ` / 完了: ${new Date(job.finishedAt).toLocaleString('ja-JP')}`}
                    </p>
                    {job.status === 'running' && (() => {
                      const eta = calcEta(job);
                      return (
                        <p style={{ fontSize: '11px', marginTop: '3px', color: '#2563eb', fontWeight: 500 }}>
                          ⏳ {eta != null ? `完了まであと約${eta}分` : '処理中…'}
                        </p>
                      );
                    })()}
                    {job.errorMessage && (
                      <p style={{ fontSize: '11px', marginTop: '4px', color: '#f87171' }} className="truncate">
                        {job.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.jobType === 'seo_check' ? (
                      <>
                        <a href={`/api/seo/pdf?siteId=${job.siteId}`} target="_blank" rel="noopener noreferrer"
                           style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '6px',
                                    color: '#6366f1', background: 'var(--accent-dim)',
                                    border: '1px solid rgba(99,102,241,0.3)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          📄 PDF
                        </a>
                        <a href={`/api/seo/csv?siteId=${job.siteId}`}
                           style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '6px',
                                    color: 'var(--text-sub)', background: 'var(--bg-base)',
                                    border: '0.5px solid var(--border)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          ↓ CSV
                        </a>
                      </>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
                                     background: 'var(--bg-base)', padding: '2px 8px',
                                     borderRadius: '12px', border: '1px solid var(--border)' }}>
                        {job._count.contentItems}件
                      </span>
                    )}
                    {job.status === 'error' && (
                      <button onClick={() => retryJob(job.id)} disabled={retrying === job.id}
                              style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                                       fontWeight: 500, cursor: 'pointer', opacity: retrying === job.id ? 0.5 : 1,
                                       background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }}>
                        {retrying === job.id ? '...' : '再実行'}
                      </button>
                    )}
                    <button onClick={() => deleteJob(job.id)} disabled={deleting === job.id}
                            title="非表示にする（コスト集計には残ります）"
                            style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                     cursor: 'pointer', opacity: deleting === job.id ? 0.5 : 1,
                                     color: 'var(--text-muted)', border: '0.5px solid var(--border)' }}>
                      {deleting === job.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>

                {/* コンテンツアイテム一覧（seo_check は対象外） */}
                {job.jobType !== 'seo_check' && job.contentItems.length > 0 && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid var(--border)' }}
                       className="space-y-1.5">
                    {job.contentItems.map((item) => {
                      const wpStatus = WP_STATUS[item.postResult?.postStatus];
                      const isItemError = item.status === 'error';
                      const noResult = !item.postResult && item.generatedTitle && !isItemError;
                      return (
                        <div key={item.id}
                             style={{ fontSize: '12px', gap: '8px',
                                      display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div className="flex items-center justify-between" style={{ gap: '8px' }}>
                          <span className="truncate flex-1" style={{ color: isItemError ? '#f87171' : 'var(--text-sub)' }}>
                            {item.generatedTitle || '（タイトル未生成）'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {/* WP投稿エラーの場合 */}
                            {isItemError && (
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 8px',
                                             borderRadius: '20px', background: '#fef2f2', color: '#dc2626',
                                             border: '1px solid #fecaca' }}>
                                エラー
                              </span>
                            )}
                            {/* WP未保存の場合は警告バッジ */}
                            {noResult && (
                              <span title="AI生成は完了しましたがWP投稿結果がDBに保存されていません。同じレコードを再実行してください。"
                                    style={{ fontSize: '10px', fontWeight: 600, padding: '1px 8px',
                                             borderRadius: '20px', background: '#fef3c7', color: '#b45309',
                                             border: '1px solid #fcd34d', cursor: 'help' }}>
                                ⚠ WP未保存
                              </span>
                            )}
                            {/* WPステータスバッジ＋公開日 */}
                            {wpStatus && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 8px',
                                               borderRadius: '20px', background: wpStatus.bg, color: wpStatus.color }}>
                                  {wpStatus.label}
                                </span>
                                {(item.postResult?.postStatus === 'publish' || item.postResult?.postStatus === 'future') && item.postResult?.wpPublishedAt && (
                                  <span style={{ fontSize: '10px', color: wpStatus.color, opacity: 0.8 }}>
                                    {new Date(item.postResult.wpPublishedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </span>
                            )}
                            {item.postResult?.wpEditUrl && (
                              <a href={item.postResult.wpEditUrl} target="_blank" rel="noopener noreferrer"
                                 style={{ fontWeight: 500, padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
                                          color: 'var(--accent)', background: 'var(--accent-dim)',
                                          border: '1px solid var(--border-light)', textDecoration: 'none' }}>
                                WP編集
                              </a>
                            )}
                          </div>
                          </div>
                          {/* エラー詳細 */}
                          {isItemError && item.errorMessage && (
                            <div style={{ fontSize: '10px', color: '#f87171', paddingLeft: '2px',
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.errorMessage}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
