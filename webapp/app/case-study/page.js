'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSiteMeta, siteAvatarStyle } from '@/lib/siteMeta';

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: '500',
  color: 'var(--text-sub)',
  marginBottom: '6px',
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '14px',
  color: 'var(--text-main)',
  outline: 'none',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function CaseStudyPage() {
  const router = useRouter();
  const [sites, setSites]           = useState([]);
  const [siteId, setSiteId]         = useState('jube');
  const [records, setRecords]       = useState([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [recError, setRecError]     = useState(null);
  const [selected, setSelected]     = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null);

  // サイト一覧取得
  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((d) => { if (d.success) setSites(d.sites); })
      .catch(() => {});
  }, []);

  // KINTONEレコード取得 (siteId が変わるたびに再取得)
  useEffect(() => {
    setLoadingRec(true);
    setRecError(null);
    setRecords([]);
    setSelected(new Set());
    fetch(`/api/kintone/records?siteId=${siteId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRecords(d.records);
        else setRecError(d.error || '取得に失敗しました');
      })
      .catch((e) => setRecError(e.message))
      .finally(() => setLoadingRec(false));
  }, [siteId]);

  function toggleRecord(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((r) => r.id)));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (selected.size === 0) { alert('取り込む施工事例を1件以上選択してください'); return; }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:      'case_study',
          siteId,
          recordIds: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ ok: true, message: `${selected.size}件の施工事例取込をキューに登録しました。` });
        setSelected(new Set());
      } else {
        setResult({ ok: false, message: data.error || 'エラーが発生しました' });
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const allChecked  = records.length > 0 && selected.size === records.length;
  const someChecked = selected.size > 0 && selected.size < records.length;

  return (
    <div style={{ maxWidth: '860px' }}>
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* サイト選択 */}
        {sites.length > 0 && (
          <div className="rounded-lg p-5"
               style={{ background: '#ffffff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <label style={labelStyle}>サイト</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {sites.map((s) => {
                const sm = getSiteMeta(s.siteId);
                const isActive = siteId === s.siteId;
                return (
                  <button
                    key={s.siteId}
                    type="button"
                    onClick={() => setSiteId(s.siteId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                      border: '1.5px solid ' + (isActive ? sm.color : 'var(--border)'),
                      background: isActive ? sm.bg : 'transparent',
                      color: isActive ? sm.color : 'var(--text-muted)',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: '13px',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span style={siteAvatarStyle(s.siteId, 24)}>{sm.label}</span>
                    {s.siteName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* KINTONEレコード一覧 */}
        <div className="rounded-lg"
             style={{ background: '#ffffff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>

          {/* ヘッダー行 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: siteId === 'nurube'
              ? '36px 76px 112px 100px 120px 64px 1fr'
              : '36px 76px 112px 100px 100px 64px 1fr',
            gap: '0',
            padding: '10px 16px',
            borderBottom: '0.5px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            {/* 全選択チェックボックス */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked; }}
                onChange={toggleAll}
                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>
            {(siteId === 'nurube'
              ? ['レコード番号', '作成日時', '作成者', '住所', 'HP公開', 'HP公開URL']
              : ['レコード番号', '作成日時', '作成者', '施工箇所', 'HP公開', 'HP公開URL']
            ).map((h) => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {h}
              </div>
            ))}
          </div>

          {/* レコード行 */}
          {loadingRec ? (
            <div style={{ padding: '24px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              KINTONEから読み込み中...
            </div>
          ) : recError ? (
            <div style={{ padding: '16px', fontSize: '12px', color: '#f87171' }}>
              取得エラー: {recError}
            </div>
          ) : records.length === 0 ? (
            <div style={{ padding: '24px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              レコードがありません
            </div>
          ) : (
            records.map((rec, idx) => {
              const isChecked = selected.has(rec.id);
              // HP公開ステータスの色
              const hpColor = rec.hpStatus === '公開済'  ? '#4ade80'
                            : rec.hpStatus === '×'       ? '#f87171'
                            : 'var(--text-muted)';
              return (
                <div
                  key={rec.id}
                  onClick={() => toggleRecord(rec.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: siteId === 'nurube'
                      ? '36px 76px 112px 100px 120px 64px 1fr'
                      : '36px 76px 112px 100px 100px 64px 1fr',
                    gap: '0',
                    padding: '9px 16px',
                    borderBottom: idx < records.length - 1 ? '0.5px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: isChecked ? 'rgba(124,127,254,0.07)' : 'transparent',
                    transition: 'background 0.1s',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isChecked ? 'rgba(124,127,254,0.07)' : 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRecord(rec.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: isChecked ? 'var(--accent)' : 'var(--text-sub)', fontWeight: isChecked ? 600 : 400 }}>
                    {rec.recordNumber || rec.id}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatDate(rec.createdAt)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rec.creator || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {siteId === 'nurube' ? (rec.address || '—') : (rec.area || '—')}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 500, color: hpColor }}>
                    {rec.hpStatus || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rec.hpUrl
                      ? <a href={rec.hpUrl} target="_blank" rel="noopener noreferrer"
                           onClick={(e) => e.stopPropagation()}
                           style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {rec.hpUrl}
                        </a>
                      : '—'}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 選択件数表示 + 送信 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: selected.size > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            {selected.size > 0 ? `${selected.size}件を選択中` : '取り込む施工事例を選択してください'}
          </span>

          {result && (
            <div className="text-sm px-4 py-2 rounded flex-1"
                 style={{
                   background: result.ok ? '#f0fdf4' : '#fef2f2',
                   color: result.ok ? '#15803d' : '#dc2626',
                   border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`,
                 }}>
              {result.message}
              {result.ok && (
                <button type="button" onClick={() => router.push('/')}
                        className="ml-3 underline" style={{ color: '#15803d' }}>
                  ジョブ一覧を見る
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || selected.size === 0}
            style={{
              flexShrink: 0,
              padding: '9px 24px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: submitting || selected.size === 0 ? 'not-allowed' : 'pointer',
              background: submitting || selected.size === 0 ? 'var(--accent-dim)' : 'var(--accent)',
              color: submitting || selected.size === 0 ? 'var(--text-muted)' : '#fff',
              border: '1px solid var(--accent)',
              whiteSpace: 'nowrap',
            }}
          >
            {submitting ? '登録中...' : selected.size > 0 ? `${selected.size}件を取り込む` : '施工事例を取り込む'}
          </button>
        </div>
      </form>
    </div>
  );
}
