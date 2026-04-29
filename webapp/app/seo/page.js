'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSiteMeta } from '@/lib/siteMeta';

// ---- スタイル定数 ----
const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '20px',
  marginBottom: '16px',
};

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '7px 11px',
  fontSize: '13px',
  color: 'var(--text-main)',
  outline: 'none',
};

const btnStyle = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
};

const SITES = [
  { siteId: 'jube',   label: '重兵衛' },
  { siteId: 'nurube', label: 'ぬりべえ' },
];

const COMPETITOR_SITES = [
  { label: 'funs-life-home.jp', url: 'https://funs-life-home.jp/' },
  { label: 'jube-estate.com',   url: 'https://www.jube-estate.com/' },
  { label: 'warehousegarage.com', url: 'https://warehousegarage.com/' },
];

function positionBadge(pos, prev) {
  if (pos == null) return <span style={{ color: 'var(--text-dimmer)' }}>-</span>;

  const round = Math.round(pos);
  let diff = null;
  if (prev != null) diff = Math.round(prev) - round; // 正=上昇

  let color = 'var(--text-main)';
  if (diff != null && diff > 0) color = '#22a845';
  if (diff != null && diff < 0) color = '#d94040';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <strong style={{ fontSize: '15px', color }}>{round}位</strong>
      {diff != null && diff !== 0 && (
        <span style={{ fontSize: '11px', color }}>
          {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
        </span>
      )}
    </span>
  );
}

// ---- ミニ折れ線グラフ（SVG）----
function MiniChart({ records }) {
  if (!records || records.length < 2) return <span style={{ color: 'var(--text-dimmer)', fontSize: '11px' }}>データ不足</span>;

  const validRecords = records.filter(r => r.position != null);
  if (validRecords.length < 2) return <span style={{ color: 'var(--text-dimmer)', fontSize: '11px' }}>データ不足</span>;

  const positions = validRecords.map(r => r.position);
  const minPos = Math.min(...positions);
  const maxPos = Math.max(...positions);
  const range  = maxPos - minPos || 1;

  const W = 120, H = 36, pad = 4;

  const pts = validRecords.map((r, i) => {
    const x = pad + (i / (validRecords.length - 1)) * (W - pad * 2);
    // 順位は低いほうが良いのでY軸を反転
    const y = pad + ((r.position - minPos) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---- 履歴モーダル ----
function HistoryModal({ keyword, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/seo/history/${keyword.id}?limit=30`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setLoading(false); });
  }, [keyword.id]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        width: '560px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>{keyword.keyword}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>
              {keyword.isOwn ? keyword.siteId : keyword.targetUrl}
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}>✕ 閉じる</button>
        </div>

        {loading ? <p style={{ color: 'var(--text-dimmer)' }}>読み込み中…</p> : (
          <>
            <MiniChart records={records} />
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-sub)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>日時</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>順位</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>表示回数</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>クリック</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>ソース</th>
                </tr>
              </thead>
              <tbody>
                {records.slice().reverse().map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', opacity: i === 0 ? 1 : 0.8 }}>
                    <td style={{ padding: '6px 8px', color: 'var(--text-sub)' }}>
                      {new Date(r.checkedAt).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                      {r.position != null ? Math.round(r.position) + '位' : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-sub)' }}>
                      {r.impressions != null ? r.impressions.toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-sub)' }}>
                      {r.clicks != null ? r.clicks.toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-dimmer)', fontSize: '11px' }}>
                      {r.source || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ---- メインページ ----
export default function SeoPage() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg]           = useState('');
  const [filterSite, setFilterSite] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [historyKw, setHistoryKw] = useState(null);

  // キーワード追加フォーム
  const [addSiteId,    setAddSiteId]    = useState('jube');
  const [addKeyword,   setAddKeyword]   = useState('');
  const [addIsOwn,     setAddIsOwn]     = useState(true);
  const [addTargetUrl, setAddTargetUrl] = useState('');
  const [addCustomUrl, setAddCustomUrl] = useState('');
  const [addSaving,    setAddSaving]    = useState(false);

  const loadKeywords = useCallback(async () => {
    setLoading(true);
    const qs  = filterSite !== 'all' ? `?siteId=${filterSite}` : '';
    const res = await fetch('/api/seo/keywords' + qs);
    const d   = await res.json();
    setKeywords(d.keywords || []);
    setLoading(false);
  }, [filterSite]);

  useEffect(() => { loadKeywords(); }, [loadKeywords]);

  async function handleCheck() {
    setChecking(true);
    setMsg('');
    const res  = await fetch('/api/seo/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: filterSite === 'all' ? null : filterSite, sendReport: true }) });
    const data = await res.json();
    setChecking(false);
    if (data.success) {
      setMsg('順位チェックをキューに登録しました。数分後に結果が更新されます。');
      setTimeout(() => setMsg(''), 6000);
    } else {
      setMsg('エラー: ' + (data.error || '不明'));
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addKeyword.trim()) return;
    setAddSaving(true);

    const targetUrl = addIsOwn ? null : (addTargetUrl === '__custom__' ? addCustomUrl : addTargetUrl) || null;

    const res  = await fetch('/api/seo/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: addSiteId, keyword: addKeyword.trim(), isOwn: addIsOwn, targetUrl }),
    });
    const data = await res.json();
    setAddSaving(false);
    if (data.success) {
      setAddKeyword('');
      setAddTargetUrl('');
      setAddCustomUrl('');
      setShowAddForm(false);
      loadKeywords();
    }
  }

  async function handleDelete(id) {
    if (!confirm('このキーワードを削除しますか？')) return;
    await fetch('/api/seo/keywords', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadKeywords();
  }

  // フィルタ済みキーワード
  const filtered = filterSite === 'all'
    ? keywords
    : keywords.filter(k => k.siteId === filterSite);

  const ownKws  = filtered.filter(k => k.isOwn);
  const compKws = filtered.filter(k => !k.isOwn);

  return (
    <div style={{ padding: '28px', maxWidth: '1000px' }}>
      {/* タイトル & 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>SEO順位管理</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
            自サイト（GSC）・競合サイト（Serper.dev）の検索順位を追跡します。月2回自動チェック。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowAddForm(v => !v)}
            style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}
          >
            ＋ キーワード追加
          </button>
          <button
            onClick={handleCheck}
            disabled={checking}
            style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', opacity: checking ? 0.6 : 1 }}
          >
            {checking ? '処理中…' : '今すぐチェック'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', color: '#2e7d32' }}>
          {msg}
        </div>
      )}

      {/* キーワード追加フォーム */}
      {showAddForm && (
        <div style={{ ...cardStyle, marginBottom: '20px', background: 'var(--bg-sidebar)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>キーワード追加</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {/* サイト選択 */}
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>サイト</label>
                <select value={addSiteId} onChange={e => setAddSiteId(e.target.value)} style={inputStyle}>
                  {SITES.map(s => <option key={s.siteId} value={s.siteId}>{s.label}</option>)}
                </select>
              </div>
              {/* 種別 */}
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>種別</label>
                <select value={addIsOwn ? 'own' : 'comp'} onChange={e => setAddIsOwn(e.target.value === 'own')} style={inputStyle}>
                  <option value="own">自サイト（GSC）</option>
                  <option value="comp">競合サイト（Serper）</option>
                </select>
              </div>
              {/* 競合URL */}
              {!addIsOwn && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>競合サイト</label>
                  <select value={addTargetUrl} onChange={e => setAddTargetUrl(e.target.value)} style={inputStyle}>
                    <option value="">選択してください</option>
                    {COMPETITOR_SITES.map(s => <option key={s.url} value={s.url}>{s.label}</option>)}
                    <option value="__custom__">その他（直接入力）</option>
                  </select>
                </div>
              )}
              {!addIsOwn && addTargetUrl === '__custom__' && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>URL</label>
                  <input type="url" value={addCustomUrl} onChange={e => setAddCustomUrl(e.target.value)} placeholder="https://example.com/" style={{ ...inputStyle, width: '220px' }} />
                </div>
              )}
            </div>
            {/* キーワード入力 */}
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>キーワード（複数行で一括追加）</label>
              <textarea
                value={addKeyword}
                onChange={e => setAddKeyword(e.target.value)}
                placeholder={'例:\nリフォーム 費用\nキッチン リフォーム 補助金'}
                rows={4}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', maxWidth: '460px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={addSaving} style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>
                {addSaving ? '追加中…' : '追加'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}>
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* サイトフィルタ */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {['all', ...SITES.map(s => s.siteId)].map(s => (
          <button key={s} onClick={() => setFilterSite(s)}
            style={{
              ...btnStyle,
              padding: '5px 14px',
              background: filterSite === s ? 'var(--accent)' : 'var(--bg-input)',
              color: filterSite === s ? '#fff' : 'var(--text-main)',
              fontWeight: filterSite === s ? 700 : 400,
            }}
          >
            {s === 'all' ? 'すべて' : SITES.find(x => x.siteId === s)?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-dimmer)' }}>読み込み中…</p>
      ) : keywords.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-dimmer)', padding: '40px' }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>キーワードが登録されていません</p>
          <p style={{ fontSize: '13px' }}>「キーワード追加」ボタンから追跡するキーワードを登録してください</p>
        </div>
      ) : (
        <>
          {/* 自サイトキーワード */}
          {ownKws.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-sub)' }}>
                自サイト順位（GSC）
              </h2>
              <KeywordTable rows={ownKws} onDelete={handleDelete} onHistory={setHistoryKw} />
            </div>
          )}

          {/* 競合キーワード */}
          {compKws.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-sub)' }}>
                競合サイト順位（Serper.dev）
              </h2>
              <KeywordTable rows={compKws} onDelete={handleDelete} onHistory={setHistoryKw} isComp />
            </div>
          )}
        </>
      )}

      {historyKw && <HistoryModal keyword={historyKw} onClose={() => setHistoryKw(null)} />}
    </div>
  );
}

function KeywordTable({ rows, onDelete, onHistory, isComp }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-sub)' }}>
          <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>キーワード</th>
          {isComp && <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>競合サイト</th>}
          <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>サイト</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>順位</th>
          {!isComp && <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>表示回数</th>}
          {!isComp && <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>クリック</th>}
          <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>最終確認</th>
          <th style={{ padding: '6px 8px' }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(kw => {
          const sm = getSiteMeta(kw.siteId);
          return (
            <tr key={kw.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 8px' }}>
                <button
                  onClick={() => onHistory(kw)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: '13px', padding: 0, textAlign: 'left' }}
                >
                  {kw.keyword}
                </button>
              </td>
              {isComp && (
                <td style={{ padding: '8px 8px', color: 'var(--text-dimmer)', fontSize: '11px' }}>
                  {kw.targetUrl ? kw.targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : '-'}
                </td>
              )}
              <td style={{ padding: '8px 8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-sub)' }}>{sm.shortName || kw.siteId}</span>
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                {positionBadge(kw.position, kw.prevPosition)}
              </td>
              {!isComp && (
                <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-sub)' }}>
                  {kw.impressions != null ? kw.impressions.toLocaleString() : '-'}
                </td>
              )}
              {!isComp && (
                <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-sub)' }}>
                  {kw.clicks != null ? kw.clicks.toLocaleString() : '-'}
                </td>
              )}
              <td style={{ padding: '8px 8px', color: 'var(--text-dimmer)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                {kw.checkedAt
                  ? new Date(kw.checkedAt).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
                  : '未チェック'}
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                <button
                  onClick={() => onDelete(kw.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)', fontSize: '13px' }}
                  title="削除"
                >
                  🗑
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
