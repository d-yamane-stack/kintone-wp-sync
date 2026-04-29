'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── 定数 ───────────────────────────────────────────────
const SITES = [
  { siteId: 'jube',   label: '重兵衛',  domain: 'jube.co.jp' },
  { siteId: 'nurube', label: 'ぬりべえ', domain: 'nuribe.jp'  },
];
const THRESHOLDS    = [3, 5, 10];

// ─── スタイル定数 ─────────────────────────────────────
const card = {
  background: 'var(--bg-card)',
  border:     '1px solid var(--border)',
  borderRadius: '10px',
  padding:    '18px',
};
const inp = {
  background: 'var(--bg-input)',
  border:     '1px solid var(--border)',
  borderRadius: '6px',
  padding:    '7px 11px',
  fontSize:   '13px',
  color:      'var(--text-main)',
  outline:    'none',
};
const btn = (primary) => ({
  padding:    '7px 16px',
  borderRadius: '6px',
  border:     'none',
  cursor:     'pointer',
  fontSize:   '13px',
  fontWeight: 600,
  background: primary ? 'var(--accent)' : 'var(--bg-input)',
  color:      primary ? '#fff'          : 'var(--text-main)',
});

// ─── ユーティリティ ────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
}
function fmtDateFull(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
    + ' ' + dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function posDiff(cur, prev) {
  if (cur == null || prev == null) return null;
  return Math.round(prev) - Math.round(cur); // 正 = 順位上昇
}

// ─── サブコンポーネント ────────────────────────────────

function RankBadge({ position, prevPosition }) {
  if (position == null) return <span style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>圏外</span>;
  const pos  = Math.round(position);
  const diff = posDiff(position, prevPosition);
  const col  = diff == null ? 'var(--text-main)' : diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : 'var(--text-main)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
      <strong style={{ fontSize: '15px', color: col }}>{pos}位</strong>
      {diff != null && diff !== 0 && (
        <span style={{ fontSize: '11px', color: col }}>{diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}</span>
      )}
    </span>
  );
}

// ─── SVG折れ線グラフ ──────────────────────────────────
function TrendChart({ history, ownDomain }) {
  if (!history || history.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-dimmer)', fontSize: '13px' }}>
        順位データがありません
      </div>
    );
  }

  const W = 500, H = 160, PL = 36, PR = 12, PT = 12, PB = 28;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  // Y軸: 1〜20（上が良い順位 = 1位）
  const MAX_RANK = 20;
  const points = history.map((h, i) => {
    const pos = h.domains[ownDomain];
    const x   = PL + (history.length === 1 ? chartW / 2 : (i / (history.length - 1)) * chartW);
    const y   = pos != null ? PT + ((pos - 1) / (MAX_RANK - 1)) * chartH : null;
    return { x, y, pos, date: h.checkedAt };
  }).filter(p => p.y != null);

  if (points.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-dimmer)', fontSize: '13px' }}>
        圏外のため表示できません
      </div>
    );
  }

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fillD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${(H - PB).toFixed(1)} L ${points[0].x.toFixed(1)} ${(H - PB).toFixed(1)} Z`;

  // X軸ラベル（最大6点）
  const labelStep = Math.max(1, Math.ceil(history.length / 6));
  const xLabels   = history
    .map((h, i) => ({ i, date: h.checkedAt }))
    .filter((_, i) => i % labelStep === 0 || i === history.length - 1);

  // Y軸目盛り
  const yTicks = [1, 5, 10, 15, 20];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* グリッド線 */}
      {yTicks.map(t => {
        const y = PT + ((t - 1) / (MAX_RANK - 1)) * chartH;
        return (
          <g key={t}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth="0.5" />
            <text x={PL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-dimmer)">{t}位</text>
          </g>
        );
      })}

      {/* エリア塗り */}
      <path d={fillD} fill="var(--accent)" fillOpacity="0.08" />

      {/* ライン */}
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* ドット */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />
      ))}

      {/* 最新値ラベル */}
      {points.length > 0 && (
        <text x={points[points.length - 1].x + 6} y={points[points.length - 1].y + 4}
          fontSize="11" fill="var(--accent)" fontWeight="700">
          {points[points.length - 1].pos}位
        </text>
      )}

      {/* X軸ラベル */}
      {xLabels.map(({ i, date }) => {
        const x = PL + (history.length === 1 ? chartW / 2 : (i / (history.length - 1)) * chartW);
        return (
          <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-dimmer)">
            {new Date(date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
          </text>
        );
      })}
    </svg>
  );
}

// ─── メインページ ─────────────────────────────────────
export default function SeoPage() {
  const [siteId,       setSiteId]       = useState('jube');
  const [keywords,     setKeywords]     = useState([]);
  const [competitors,  setCompetitors]  = useState([]);
  const [logs,         setLogs]         = useState([]);
  const [config,       setConfig]       = useState({ alertThreshold: 5, alertEmail: '' });
  const [selectedKw,   setSelectedKw]   = useState(null); // 選択中のキーワードオブジェクト
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [checking,     setChecking]     = useState(false);
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState('info');

  // キーワード追加フォーム
  const [showKwForm,   setShowKwForm]   = useState(false);
  const [kwInput,      setKwInput]      = useState('');
  const [kwSaving,     setKwSaving]     = useState(false);

  // 競合追加フォーム
  const [showCompForm, setShowCompForm] = useState(false);
  const [compDomain,   setCompDomain]   = useState('');
  const [compLabel,    setCompLabel]    = useState('');
  const [compSaving,   setCompSaving]   = useState(false);

  // アラート設定フォーム
  const [editConfig,   setEditConfig]   = useState(false);
  const [cfgThreshold, setCfgThreshold] = useState(5);
  const [cfgEmail,     setCfgEmail]     = useState('');
  const [cfgSaving,    setCfgSaving]    = useState(false);

  // CSV
  const fileRef = useRef(null);

  const ownDomain = SITES.find(s => s.siteId === siteId)?.domain || '';

  function showMsg(text, type) {
    setMsg(text); setMsgType(type || 'info');
    setTimeout(() => setMsg(''), 6000);
  }

  // ─── データ読み込み ──────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [kwRes, compRes, logRes, cfgRes] = await Promise.all([
        fetch(`/api/seo/keywords?siteId=${siteId}`).then(r => r.json()),
        fetch(`/api/seo/comparison?siteId=${siteId}`).then(r => r.json()),
        fetch(`/api/seo/logs?siteId=${siteId}&limit=10`).then(r => r.json()),
        fetch(`/api/seo/config?siteId=${siteId}`).then(r => r.json()),
      ]);
      setKeywords(kwRes.keywords || []);
      setCompetitors(compRes.competitors || []);
      setLogs(logRes.logs || []);
      if (cfgRes.config) {
        setConfig(cfgRes.config);
        setCfgThreshold(cfgRes.config.alertThreshold);
        setCfgEmail(cfgRes.config.alertEmail || '');
      }
    } catch (e) {
      showMsg('データ読み込みエラー: ' + e.message, 'error');
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { loadAll(); setSelectedKw(null); setHistory([]); }, [loadAll]);

  // キーワード選択時に履歴取得
  async function selectKeyword(kw) {
    setSelectedKw(kw);
    setHistory([]);
    try {
      const res = await fetch(`/api/seo/history/${kw.id}?limit=30`);
      const d   = await res.json();
      setHistory(d.history || []);
    } catch (e) {
      console.error('履歴取得エラー', e);
    }
  }

  // ─── サマリー計算 ────────────────────────────────────
  const activeKws    = keywords.filter(k => k.position != null);
  const avgRank      = activeKws.length
    ? (activeKws.reduce((s, k) => s + k.position, 0) / activeKws.length).toFixed(1)
    : null;
  const avgChange    = activeKws.filter(k => k.prevPosition != null).length
    ? (activeKws
        .filter(k => k.prevPosition != null)
        .reduce((s, k) => s + posDiff(k.position, k.prevPosition), 0)
        / activeKws.filter(k => k.prevPosition != null).length
      ).toFixed(1)
    : null;
  const lastCheck    = keywords.reduce((latest, k) => {
    if (!k.checkedAt) return latest;
    return !latest || new Date(k.checkedAt) > new Date(latest) ? k.checkedAt : latest;
  }, null);

  // ─── 操作ハンドラ ────────────────────────────────────
  async function handleCheck() {
    setChecking(true);
    const res  = await fetch('/api/seo/check', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId, sendReport: true }),
    });
    const data = await res.json();
    setChecking(false);
    if (data.success) showMsg('順位チェックをキューに登録しました。数分後に更新されます。', 'success');
    else showMsg('エラー: ' + (data.error || '不明'), 'error');
  }

  async function handleAddKeywords(e) {
    e.preventDefault();
    if (!kwInput.trim()) return;
    setKwSaving(true);
    const res  = await fetch('/api/seo/keywords', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId, keyword: kwInput }),
    });
    const data = await res.json();
    setKwSaving(false);
    if (data.success) {
      setKwInput(''); setShowKwForm(false);
      showMsg(`${data.count}件のキーワードを追加しました`, 'success');
      loadAll();
    } else {
      showMsg(data.error || '追加失敗', 'error');
    }
  }

  async function handleDeleteKeyword(id) {
    if (!confirm('このキーワードを削除しますか？')) return;
    await fetch('/api/seo/keywords', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    if (selectedKw?.id === id) { setSelectedKw(null); setHistory([]); }
    loadAll();
  }

  async function handleAddCompetitor(e) {
    e.preventDefault();
    if (!compDomain.trim()) return;
    setCompSaving(true);
    const res  = await fetch('/api/seo/competitors', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId, domain: compDomain.trim(), label: compLabel.trim() || compDomain.trim() }),
    });
    const data = await res.json();
    setCompSaving(false);
    if (data.success) {
      setCompDomain(''); setCompLabel(''); setShowCompForm(false);
      showMsg('競合サイトを追加しました', 'success');
      loadAll();
    } else {
      showMsg(data.error || '追加失敗', 'error');
    }
  }

  async function handleDeleteCompetitor(id) {
    if (!confirm('この競合サイトを削除しますか？')) return;
    await fetch('/api/seo/competitors', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    loadAll();
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setCfgSaving(true);
    const res  = await fetch('/api/seo/config', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId, alertThreshold: cfgThreshold, alertEmail: cfgEmail }),
    });
    const data = await res.json();
    setCfgSaving(false);
    if (data.success) {
      setConfig(data.config); setEditConfig(false);
      showMsg('アラート設定を保存しました', 'success');
    } else {
      showMsg(data.error || '保存失敗', 'error');
    }
  }

  function handleCsvExport() {
    window.location.href = `/api/seo/csv?siteId=${siteId}`;
  }

  async function handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('siteId', siteId);
    const res  = await fetch('/api/seo/csv', { method: 'POST', body: fd });
    const data = await res.json();
    e.target.value = '';
    if (data.success) {
      showMsg(`${data.imported}件インポート完了（${data.skipped}件スキップ）`, 'success');
      loadAll();
    } else {
      showMsg(data.error || 'インポート失敗', 'error');
    }
  }

  // ─── レンダリング ────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>

      {/* ── ヘッダー ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handleCsvExport} style={{ ...btn(false), fontSize: '12px' }}>
            ↓ CSVエクスポート
          </button>
          <button onClick={() => fileRef.current?.click()} style={{ ...btn(false), fontSize: '12px' }}>
            ↑ CSVインポート
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvImport} />
          <button onClick={() => window.open(`/api/seo/pdf?siteId=${siteId}`, '_blank')} style={{ ...btn(false), fontSize: '12px' }}>
            📄 PDFレポート
          </button>
          <button onClick={handleCheck} disabled={checking} style={{ ...btn(true), opacity: checking ? 0.6 : 1 }}>
            {checking ? '処理中…' : '▶ 今すぐ取得'}
          </button>
        </div>
      </div>

      {/* ── メッセージ ── */}
      {msg && (
        <div style={{
          borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px',
          background: msgType === 'error' ? '#fff0f0' : '#f0fdf4',
          border: `1px solid ${msgType === 'error' ? '#fca5a5' : '#86efac'}`,
          color:  msgType === 'error' ? '#b91c1c' : '#15803d',
        }}>{msg}</div>
      )}

      {/* ── サイトタブ ── */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {SITES.map(s => (
          <button key={s.siteId} onClick={() => setSiteId(s.siteId)} style={{
            padding: '5px 16px', borderRadius: '6px', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            background: siteId === s.siteId ? 'var(--accent)' : 'var(--bg-input)',
            color:      siteId === s.siteId ? '#fff'          : 'var(--text-main)',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── サマリーカード ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>管理キーワード数</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)' }}>{keywords.length}</div>
        </div>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>平均順位（今回）</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)' }}>
            {avgRank != null ? `${avgRank}位` : '—'}
          </div>
        </div>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>前回比 平均変動</div>
          <div style={{ fontSize: '28px', fontWeight: 800,
            color: avgChange == null ? 'var(--text-main)' : avgChange > 0 ? '#16a34a' : avgChange < 0 ? '#dc2626' : 'var(--text-main)' }}>
            {avgChange != null
              ? (avgChange > 0 ? `▲ +${avgChange}` : avgChange < 0 ? `▼ ${avgChange}` : `±0`)
              : '—'}
          </div>
        </div>
      </div>

      {/* ── メインエリア（左:キーワード一覧 / 右:グラフ+競合） ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* ── 左パネル：キーワード一覧 ── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>キーワード一覧</span>
              {lastCheck && (
                <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginLeft: '8px' }}>
                  最終取得: {fmtDateFull(lastCheck)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => { setShowKwForm(v => !v); setShowCompForm(false); }}
                style={{ ...btn(false), fontSize: '12px', padding: '4px 10px' }}>
                ＋ キーワード
              </button>
              <button onClick={() => { setShowCompForm(v => !v); setShowKwForm(false); }}
                style={{ ...btn(false), fontSize: '12px', padding: '4px 10px' }}>
                ＋ 競合
              </button>
            </div>
          </div>

          {/* キーワード追加フォーム */}
          {showKwForm && (
            <div style={{ background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
              <form onSubmit={handleAddKeywords}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                    キーワード（1行1件）
                  </label>
                  <textarea value={kwInput} onChange={e => setKwInput(e.target.value)}
                    placeholder={'成田 トイレ リフォーム\nキッチン リフォーム 千葉'}
                    rows={3} style={{ ...inp, width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" disabled={kwSaving} style={{ ...btn(true), padding: '5px 14px', fontSize: '12px' }}>
                    {kwSaving ? '追加中…' : '追加'}
                  </button>
                  <button type="button" onClick={() => setShowKwForm(false)}
                    style={{ ...btn(false), padding: '5px 14px', fontSize: '12px' }}>
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 競合追加フォーム */}
          {showCompForm && (
            <div style={{ background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
              <form onSubmit={handleAddCompetitor}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>ドメイン</label>
                    <input type="text" value={compDomain} onChange={e => setCompDomain(e.target.value)}
                      placeholder="example.co.jp" style={{ ...inp, width: '180px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>表示名</label>
                    <input type="text" value={compLabel} onChange={e => setCompLabel(e.target.value)}
                      placeholder="会社名" style={{ ...inp, width: '140px' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" disabled={compSaving} style={{ ...btn(true), padding: '5px 14px', fontSize: '12px' }}>
                    {compSaving ? '追加中…' : '追加'}
                  </button>
                  <button type="button" onClick={() => setShowCompForm(false)}
                    style={{ ...btn(false), padding: '5px 14px', fontSize: '12px' }}>
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* キーワードリスト */}
          {loading ? (
            <p style={{ color: 'var(--text-dimmer)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>読み込み中…</p>
          ) : keywords.length === 0 ? (
            <p style={{ color: 'var(--text-dimmer)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
              キーワードが登録されていません
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {keywords.map(kw => (
                <div key={kw.id}
                  onClick={() => selectKeyword(kw)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                    background: selectedKw?.id === kw.id ? 'var(--accent)11' : 'transparent',
                    border: selectedKw?.id === kw.id ? '1px solid var(--accent)44' : '1px solid transparent',
                    transition: 'background 0.1s',
                  }}>
                  {/* キーワード名 */}
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text-main)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kw.keyword}
                  </span>
                  {/* 順位 */}
                  <span style={{ minWidth: '70px', textAlign: 'right' }}>
                    <RankBadge position={kw.position} prevPosition={kw.prevPosition} />
                  </span>
                  {/* 削除 */}
                  <button onClick={e => { e.stopPropagation(); handleDeleteKeyword(kw.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-dimmer)', fontSize: '13px', padding: '0 2px' }}
                    title="削除">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 右パネル：グラフ + 競合リスト ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* グラフカード */}
          <div style={card}>
            {selectedKw ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-main)' }}>
                  順位推移グラフ —{' '}
                  <span style={{ color: 'var(--accent)' }}>{selectedKw.keyword}</span>
                </div>
                <TrendChart history={history} ownDomain={ownDomain} />
              </>
            ) : (
              <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-dimmer)', fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>📈</span>
                <span>左のキーワードを選択すると推移グラフを表示します</span>
              </div>
            )}
          </div>

          {/* 競合サイト一覧カード */}
          <div style={card}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
              競合サイト
              {selectedKw && <span style={{ fontWeight: 400, color: 'var(--text-dimmer)', marginLeft: '6px' }}>
                — {selectedKw.keyword}
              </span>}
            </div>
            {competitors.length === 0 ? (
              <p style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>競合サイトが登録されていません</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {competitors.map((c, i) => {
                  // 選択キーワードの最新チェック時の順位を取得
                  const compKw = selectedKw
                    ? keywords.find(k => k.id === selectedKw.id)
                    : null;
                  return (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 8px', borderRadius: '6px',
                      background: i % 2 === 0 ? 'var(--bg-sidebar)' : 'transparent',
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', minWidth: '20px' }}>
                        {i + 1}.
                      </span>
                      <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{c.label}</span>
                      <a href={`https://${c.domain}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: '11px', color: 'var(--text-dimmer)', textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}>
                        {c.domain} ↗
                      </a>
                      <button onClick={() => handleDeleteCompetitor(c.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-dimmer)', fontSize: '12px', padding: '0 2px' }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 下段：アラート設定 + 取得ログ ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>

        {/* アラート設定 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>アラート設定</span>
            {!editConfig && (
              <button onClick={() => setEditConfig(true)}
                style={{ ...btn(false), fontSize: '11px', padding: '3px 10px' }}>変更</button>
            )}
          </div>

          {editConfig ? (
            <form onSubmit={handleSaveConfig}>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'block', marginBottom: '6px' }}>
                  変動アラート閾値
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {THRESHOLDS.map(t => (
                    <label key={t} style={{ fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="radio" name="threshold" value={t}
                        checked={cfgThreshold === t} onChange={() => setCfgThreshold(t)} />
                      ±{t}位以上
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                  通知先メールアドレス
                </label>
                <input type="email" value={cfgEmail} onChange={e => setCfgEmail(e.target.value)}
                  placeholder="your@email.com" style={{ ...inp, width: '260px' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" disabled={cfgSaving} style={{ ...btn(true), fontSize: '12px', padding: '5px 14px' }}>
                  {cfgSaving ? '保存中…' : '保存'}
                </button>
                <button type="button" onClick={() => setEditConfig(false)}
                  style={{ ...btn(false), fontSize: '12px', padding: '5px 14px' }}>キャンセル</button>
              </div>
            </form>
          ) : (
            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: 'var(--text-dimmer)', width: '120px' }}>変動アラート閾値</span>
                <span style={{ fontWeight: 600 }}>±{config.alertThreshold}位以上</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: 'var(--text-dimmer)', width: '120px' }}>通知先メール</span>
                <span style={{ fontWeight: 600 }}>{config.alertEmail || '未設定'}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: 'var(--text-dimmer)', width: '120px' }}>自動取得</span>
                <span style={{ fontWeight: 600 }}>毎月1日・15日 09:00</span>
              </div>
            </div>
          )}
        </div>

        {/* 取得ログ */}
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>取得ログ</div>
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-dimmer)', fontSize: '12px' }}>ログがありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {logs.map(log => (
                <div key={log.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '12px', padding: '4px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ color: 'var(--text-dimmer)', minWidth: '100px' }}>
                    {fmtDateFull(log.startedAt)}
                  </span>
                  <span style={{
                    fontWeight: 700, minWidth: '60px',
                    color: log.status === 'success' ? '#16a34a'
                         : log.status === 'error'   ? '#dc2626'
                         : '#f59e0b',
                  }}>
                    {log.status === 'success' ? '✓ 正常完了'
                   : log.status === 'error'   ? '✕ エラー'
                   : '… 実行中'}
                  </span>
                  {log.count != null && (
                    <span style={{ color: 'var(--text-sub)' }}>{log.count}件取得</span>
                  )}
                  {log.error && (
                    <span style={{ color: '#dc2626', fontSize: '11px', flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={log.error}>
                      {log.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
