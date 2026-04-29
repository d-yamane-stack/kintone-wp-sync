'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSiteMeta } from '@/lib/siteMeta';

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
  padding: '7px 16px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
};

const SITES = [
  { siteId: 'jube',   label: '重兵衛',  domain: 'jube.co.jp'  },
  { siteId: 'nurube', label: 'ぬりべえ', domain: 'nuribe.jp'   },
];

function PosBadge({ position, prevPosition }) {
  if (position == null) return <span style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>圏外</span>;
  const pos  = Math.round(position);
  const diff = prevPosition != null ? Math.round(prevPosition) - pos : null;
  const color = diff == null ? 'var(--text-main)'
              : diff > 0    ? '#16a34a'
              : diff < 0    ? '#dc2626'
              : 'var(--text-main)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
      <strong style={{ fontSize: '15px', color }}>{pos}位</strong>
      {diff != null && diff !== 0 && (
        <span style={{ fontSize: '11px', color }}>
          {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
        </span>
      )}
    </span>
  );
}

function CompPos({ position }) {
  if (position == null) return <span style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>圏外</span>;
  return <span style={{ fontSize: '13px', color: 'var(--text-sub)' }}>{Math.round(position)}位</span>;
}

export default function SeoPage() {
  const [filterSite, setFilterSite] = useState('jube');
  const [compData,   setCompData]   = useState({ rows: [], competitors: [] });
  const [loading,    setLoading]    = useState(true);
  const [checking,   setChecking]   = useState(false);
  const [msg,        setMsg]        = useState('');
  const [msgType,    setMsgType]    = useState('info');

  // キーワード追加フォーム
  const [showKwForm, setShowKwForm] = useState(false);
  const [kwInput,    setKwInput]    = useState('');
  const [kwSaving,   setKwSaving]   = useState(false);
  const [kwError,    setKwError]    = useState('');

  // 競合追加フォーム
  const [showCompForm,  setShowCompForm]  = useState(false);
  const [compDomain,    setCompDomain]    = useState('');
  const [compLabel,     setCompLabel]     = useState('');
  const [compSaving,    setCompSaving]    = useState(false);

  const showMsg = (text, type) => {
    setMsg(text); setMsgType(type || 'info');
    setTimeout(() => setMsg(''), 5000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const qs  = filterSite !== 'all' ? `?siteId=${filterSite}` : '';
    const res = await fetch('/api/seo/comparison' + qs);
    const d   = await res.json();
    setCompData({ rows: d.rows || [], competitors: d.competitors || [] });
    setLoading(false);
  }, [filterSite]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCheck() {
    setChecking(true);
    const res  = await fetch('/api/seo/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: filterSite === 'all' ? null : filterSite, sendReport: true }),
    });
    const data = await res.json();
    setChecking(false);
    if (data.success) {
      showMsg('順位チェックをキューに登録しました。数分後に更新されます。', 'success');
    } else {
      showMsg('エラー: ' + (data.error || '不明'), 'error');
    }
  }

  async function handleAddKeywords(e) {
    e.preventDefault();
    if (!kwInput.trim()) return;
    setKwSaving(true); setKwError('');
    try {
      const res  = await fetch('/api/seo/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: filterSite === 'all' ? 'jube' : filterSite, keyword: kwInput }),
      });
      const data = await res.json();
      if (data.success) {
        setKwInput(''); setShowKwForm(false);
        showMsg(data.count + '件のキーワードを追加しました', 'success');
        loadData();
      } else {
        setKwError(data.error || '追加失敗');
      }
    } catch (e) { setKwError(e.message); }
    setKwSaving(false);
  }

  async function handleDeleteKeyword(id) {
    if (!confirm('このキーワードを削除しますか？')) return;
    await fetch('/api/seo/keywords', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  async function handleAddCompetitor(e) {
    e.preventDefault();
    if (!compDomain.trim()) return;
    setCompSaving(true);
    const siteId = filterSite === 'all' ? 'jube' : filterSite;
    const res  = await fetch('/api/seo/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, domain: compDomain.trim(), label: compLabel.trim() || compDomain.trim() }),
    });
    const data = await res.json();
    setCompSaving(false);
    if (data.success) {
      setCompDomain(''); setCompLabel(''); setShowCompForm(false);
      showMsg('競合サイトを追加しました', 'success');
      loadData();
    }
  }

  async function handleDeleteCompetitor(id) {
    if (!confirm('この競合サイトを削除しますか？')) return;
    await fetch('/api/seo/competitors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  const { rows, competitors } = compData;
  const ownDomain = SITES.find(s => s.siteId === filterSite)?.domain || '';

  return (
    <div style={{ padding: '28px', maxWidth: '1100px' }}>
      {/* タイトル */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>SEO順位管理</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
            指定キーワードの現在順位と競合比較（Serper.dev）。月2回自動チェック。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowKwForm(v => !v); setShowCompForm(false); }}
            style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}>
            ＋ キーワード追加
          </button>
          <button onClick={() => { setShowCompForm(v => !v); setShowKwForm(false); }}
            style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}>
            ＋ 競合サイト追加
          </button>
          <button onClick={handleCheck} disabled={checking}
            style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', opacity: checking ? 0.6 : 1 }}>
            {checking ? '処理中…' : '今すぐチェック'}
          </button>
        </div>
      </div>

      {/* メッセージ */}
      {msg && (
        <div style={{
          borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px',
          background: msgType === 'error' ? '#fff0f0' : '#f0fdf4',
          border: `1px solid ${msgType === 'error' ? '#fca5a5' : '#86efac'}`,
          color:  msgType === 'error' ? '#b91c1c' : '#15803d',
        }}>
          {msg}
        </div>
      )}

      {/* キーワード追加フォーム */}
      {showKwForm && (
        <div style={{ ...cardStyle, background: 'var(--bg-sidebar)', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>キーワード追加</h3>
          <form onSubmit={handleAddKeywords} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                キーワード（1行1件、複数行で一括追加）
              </label>
              <textarea value={kwInput} onChange={e => setKwInput(e.target.value)}
                placeholder={'成田 トイレ リフォーム\nキッチン リフォーム 千葉\n外壁塗装 費用'}
                rows={5} style={{ ...inputStyle, width: '100%', maxWidth: '460px', resize: 'vertical' }} />
            </div>
            {kwError && <p style={{ color: '#b91c1c', fontSize: '13px' }}>{kwError}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={kwSaving}
                style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>
                {kwSaving ? '追加中…' : '追加'}
              </button>
              <button type="button" onClick={() => { setShowKwForm(false); setKwError(''); }}
                style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}>
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 競合サイト追加フォーム */}
      {showCompForm && (
        <div style={{ ...cardStyle, background: 'var(--bg-sidebar)', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>競合サイト追加</h3>
          <form onSubmit={handleAddCompetitor} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>ドメイン</label>
                <input type="text" value={compDomain} onChange={e => setCompDomain(e.target.value)}
                  placeholder="funs-life-home.jp" style={{ ...inputStyle, width: '220px' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>表示名</label>
                <input type="text" value={compLabel} onChange={e => setCompLabel(e.target.value)}
                  placeholder="ファンズライフホーム" style={{ ...inputStyle, width: '180px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={compSaving}
                style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>
                {compSaving ? '追加中…' : '追加'}
              </button>
              <button type="button" onClick={() => setShowCompForm(false)}
                style={{ ...btnStyle, background: 'var(--bg-input)', color: 'var(--text-main)' }}>
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {/* サイトフィルタ */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {SITES.map(s => (
          <button key={s.siteId} onClick={() => setFilterSite(s.siteId)}
            style={{
              ...btnStyle, padding: '5px 14px',
              background: filterSite === s.siteId ? 'var(--accent)' : 'var(--bg-input)',
              color:      filterSite === s.siteId ? '#fff' : 'var(--text-main)',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* 順位比較テーブル */}
      {loading ? (
        <p style={{ color: 'var(--text-dimmer)' }}>読み込み中…</p>
      ) : rows.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-dimmer)', padding: '48px' }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>キーワードが登録されていません</p>
          <p style={{ fontSize: '13px' }}>「キーワード追加」からキーワードを登録してください</p>
        </div>
      ) : (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: 'var(--text-sub)', minWidth: '180px' }}>
                  キーワード
                </th>
                {/* 自サイト列 */}
                <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 700, color: 'var(--accent)', minWidth: '90px' }}>
                  {SITES.find(s => s.siteId === filterSite)?.label || filterSite}
                  <div style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-dimmer)', marginTop: '2px' }}>
                    {ownDomain}
                  </div>
                </th>
                {/* 競合列 */}
                {competitors.map(c => (
                  <th key={c.id} style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, color: 'var(--text-sub)', minWidth: '90px' }}>
                    {c.label}
                    <div style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-dimmer)', marginTop: '2px' }}>
                      {c.domain}
                    </div>
                    <button onClick={() => handleDeleteCompetitor(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)', fontSize: '10px', marginTop: '2px' }}
                      title="削除">✕</button>
                  </th>
                ))}
                <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 400, color: 'var(--text-dimmer)', fontSize: '11px' }}>
                  最終確認
                </th>
                <th style={{ width: '32px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.keyword.id}
                  style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 1 ? 'var(--bg-sidebar)' : 'transparent' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {row.keyword.keyword}
                  </td>
                  {/* 自サイト */}
                  <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                    <PosBadge
                      position={row.positions?.[ownDomain]}
                      prevPosition={row.prevOwnPosition}
                    />
                  </td>
                  {/* 競合 */}
                  {competitors.map(c => (
                    <td key={c.id} style={{ padding: '10px 10px', textAlign: 'center' }}>
                      <CompPos position={row.positions?.[c.domain]} />
                    </td>
                  ))}
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--text-dimmer)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {row.checkedAt
                      ? new Date(row.checkedAt).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
                      : '未チェック'}
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                    <button onClick={() => handleDeleteKeyword(row.keyword.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)' }}
                      title="削除">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 競合サイト一覧 */}
      {competitors.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>
            競合サイト: {competitors.map(c => c.label).join(' / ')}　※上表の列として表示されています
          </p>
        </div>
      )}
    </div>
  );
}
