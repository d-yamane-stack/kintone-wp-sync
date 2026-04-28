'use client';

import { useEffect, useState } from 'react';
import { getSiteMeta, siteAvatarStyle } from '@/lib/siteMeta';

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
};

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

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
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

  useEffect(() => { fetchJobs(); }, []);

  // サイト一覧を動的に収集
  const siteOptions = [
    { key: 'all', label: 'すべてのサイト' },
    ...Array.from(new Map(jobs.map(j => [j.siteId, j.siteName || j.siteId])).entries())
      .map(([key, label]) => ({ key, label })),
  ];

  const filteredJobs = jobs.filter((j) => {
    if (!jobMatchesFilter(j, filter)) return false;
    if (siteFilter !== 'all' && j.siteId !== siteFilter) return false;
    if (typeFilter !== 'all' && j.jobType !== typeFilter) return false;
    return true;
  });

  return (
    <div>
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
                    {job.errorMessage && (
                      <p style={{ fontSize: '11px', marginTop: '4px', color: '#f87171' }} className="truncate">
                        {job.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
                                   background: 'var(--bg-base)', padding: '2px 8px',
                                   borderRadius: '12px', border: '1px solid var(--border)' }}>
                      {job._count.contentItems}件
                    </span>
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

                {/* コンテンツアイテム一覧 */}
                {job.contentItems.length > 0 && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid var(--border)' }}
                       className="space-y-1.5">
                    {job.contentItems.map((item) => {
                      const wpStatus = WP_STATUS[item.postResult?.postStatus];
                      return (
                        <div key={item.id} className="flex items-center justify-between"
                             style={{ fontSize: '12px', gap: '8px' }}>
                          <span className="truncate flex-1" style={{ color: 'var(--text-sub)' }}>
                            {item.generatedTitle || '（タイトル未生成）'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
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
