'use client';

import { useState } from 'react';
import { SITE_META } from '@/lib/siteMeta';

const SITES = Object.entries(SITE_META).map(([id, m]) => ({ id, name: m.name, color: m.color, bg: m.bg, border: m.border, label: m.label }));

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function MetricBadge({ label, value, color = 'var(--text-muted)' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '60px' }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: '10px', color: 'var(--text-dimmer)' }}>{label}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="skeleton" style={{ height: '16px', width: '60%' }} />
      <div className="skeleton" style={{ height: '13px', width: '90%' }} />
      <div className="skeleton" style={{ height: '13px', width: '75%' }} />
      <div style={{ display: 'flex', gap: '16px' }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: '36px', width: '60px', borderRadius: '8px' }} />)}
      </div>
    </div>
  );
}

export default function BestColumnsPage() {
  const [siteId,   setSiteId]   = useState('jube');
  const [loading,  setLoading]  = useState(false);
  const [ranking,  setRanking]  = useState(null);
  const [total,    setTotal]    = useState(null);
  const [error,    setError]    = useState('');

  const site = SITE_META[siteId];

  async function handleAnalyze() {
    setLoading(true);
    setError('');
    setRanking(null);
    try {
      const res  = await fetch('/api/best-columns/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (data.success) {
        setRanking(data.ranking);
        setTotal(data.total);
      } else {
        setError(data.error || '分析に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>

      {/* ── ヘッダー操作エリア ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        marginBottom: '24px', flexWrap: 'wrap',
      }}>
        {/* サイト選択 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {SITES.map(s => (
            <button
              key={s.id}
              onClick={() => { setSiteId(s.id); setRanking(null); }}
              style={{
                padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: `1px solid ${siteId === s.id ? s.color : 'var(--border)'}`,
                background: siteId === s.id ? s.bg : 'transparent',
                color: siteId === s.id ? s.color : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
            border: 'none',
            background: loading ? 'var(--border)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : '#fff',
            cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          {loading ? (
            <>
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              AIが分析中…
            </>
          ) : (
            <>✨ AI分析する</>
          )}
        </button>

        {total != null && !loading && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            全{total}記事中 TOP 10
          </span>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ── スケルトン ── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* ── ランキング ── */}
      {!loading && ranking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {ranking.map((col) => {
            const medal    = RANK_MEDALS[col.rank - 1] || null;
            const ctrPct   = Math.round((col.ctr || 0) * 1000) / 10;
            const pos      = col.position ? Math.round(col.position * 10) / 10 : null;
            const isTop3   = col.rank <= 3;
            const fmtDate  = col.date ? col.date.slice(0, 10).replace(/-/g, '/') : '';

            return (
              <div key={col.rank} style={{
                background: isTop3 ? 'linear-gradient(135deg, #fffbeb 0%, #ffffff 60%)' : '#ffffff',
                border: `1px solid ${isTop3 ? '#fde68a' : 'var(--border)'}`,
                borderRadius: '14px',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: isTop3 ? '0 2px 8px rgba(251,191,36,0.15)' : 'var(--shadow-sm)',
              }}>

                {/* タイトル行 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  {/* ランク */}
                  <div style={{
                    flexShrink: 0,
                    width: '40px', height: '40px',
                    borderRadius: '50%',
                    background: isTop3 ? '#fef9c3' : 'var(--bg-input)',
                    border: `1px solid ${isTop3 ? '#fde68a' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: medal ? '20px' : '15px',
                    fontWeight: 700,
                    color: medal ? undefined : 'var(--text-muted)',
                  }}>
                    {medal || col.rank}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      {fmtDate && (
                        <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', flexShrink: 0 }}>{fmtDate}</span>
                      )}
                      {col.keyword && (
                        <span style={{
                          fontSize: '10px', padding: '1px 8px', borderRadius: '99px',
                          background: 'var(--accent-dim)', color: 'var(--accent)',
                          border: '1px solid rgba(99,102,241,0.2)', flexShrink: 0,
                        }}>
                          {col.keyword}
                        </span>
                      )}
                    </div>
                    <a
                      href={col.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '14px', fontWeight: 700,
                        color: 'var(--text-main)', textDecoration: 'none',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {col.title}
                    </a>
                  </div>
                </div>

                {/* メトリクス */}
                <div style={{
                  display: 'flex', gap: '0', alignItems: 'center',
                  background: 'var(--bg-input)', borderRadius: '10px', padding: '10px 16px',
                  justifyContent: 'space-around',
                }}>
                  <MetricBadge
                    label="クリック"
                    value={col.clicks.toLocaleString()}
                    color={isTop3 ? '#d97706' : 'var(--text-main)'}
                  />
                  <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />
                  <MetricBadge label="表示回数" value={(col.impressions || 0).toLocaleString()} />
                  <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />
                  <MetricBadge
                    label="CTR"
                    value={`${ctrPct}%`}
                    color={ctrPct >= 5 ? '#16a34a' : ctrPct >= 2 ? '#d97706' : 'var(--text-muted)'}
                  />
                  <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />
                  <MetricBadge
                    label="平均順位"
                    value={pos != null ? `${pos}位` : '—'}
                    color={pos != null && pos <= 10 ? '#16a34a' : pos != null && pos <= 20 ? '#d97706' : 'var(--text-muted)'}
                  />
                </div>

                {/* AI分析 */}
                {col.aiReason && (
                  <div style={{
                    background: '#f8faff',
                    border: '1px solid #e0e7ff',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                  }}>
                    <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>🤖</span>
                    <p style={{
                      margin: 0, fontSize: '12px', lineHeight: 1.75,
                      color: 'var(--text-sub)',
                    }}>
                      {col.aiReason}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* フッター注記 */}
          <p style={{ fontSize: '11px', color: 'var(--text-dimmer)', textAlign: 'center', marginTop: '8px' }}>
            ※ GSC直近90日のクリック数順。AI分析はHaiku 4.5による参考値です。
          </p>
        </div>
      )}

      {/* 初期案内 */}
      {!loading && !ranking && !error && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--text-muted)', fontSize: '14px',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏆</div>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-sub)', marginBottom: '6px' }}>ベストコラム TOP 10</p>
          <p style={{ margin: 0, fontSize: '13px' }}>サイトを選んで「AI分析する」をクリックしてください</p>
        </div>
      )}
    </div>
  );
}
