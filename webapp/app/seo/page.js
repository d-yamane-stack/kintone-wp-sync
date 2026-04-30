'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── 定数 ───────────────────────────────────────────────
const SITES = [
  { siteId: 'jube',   label: '重兵衛',  domain: 'jube.co.jp' },
  { siteId: 'nurube', label: 'ぬりべえ', domain: 'nuribe.jp'  },
];
const THRESHOLDS = [3, 5, 10];

// ─── スタイル定数 ─────────────────────────────────────
const card = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border)',
  borderRadius: '10px',
  padding:      '18px',
};
const inp = {
  background:   'var(--bg-input)',
  border:       '1px solid var(--border)',
  borderRadius: '6px',
  padding:      '7px 11px',
  fontSize:     '13px',
  color:        'var(--text-main)',
  outline:      'none',
};
const btn = (primary) => ({
  padding:      '7px 16px',
  borderRadius: '6px',
  border:       'none',
  cursor:       'pointer',
  fontSize:     '13px',
  fontWeight:   600,
  background:   primary ? 'var(--accent)' : 'var(--bg-input)',
  color:        primary ? '#fff'          : 'var(--text-main)',
});

// ─── ユーティリティ ────────────────────────────────────
function fmtDateFull(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
    + ' ' + dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function posDiff(cur, prev) {
  if (cur == null || prev == null) return null;
  return Math.round(prev) - Math.round(cur);
}

// ─── サブコンポーネント ────────────────────────────────

function RankBadge({ position, prevPosition }) {
  if (position == null) return <span style={{ color: 'var(--text-dimmer)', fontSize: '11px' }}>圏外</span>;
  const pos  = Math.round(position);
  const diff = posDiff(position, prevPosition);
  const col  = diff == null ? 'var(--text-main)' : diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : 'var(--text-main)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2px' }}>
      <strong style={{ fontSize: '13px', color: col }}>{pos}位</strong>
      {diff != null && diff !== 0 && (
        <span style={{ fontSize: '10px', color: col }}>{diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}</span>
      )}
    </span>
  );
}

// ─── SVG 折れ線グラフ ─────────────────────────────────
function TrendChart({ history, ownDomain }) {
  if (!history || history.length === 0) {
    return (
      <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-dimmer)', fontSize: '13px' }}>
        順位データがありません
      </div>
    );
  }
  const W = 480, H = 140, PL = 34, PR = 10, PT = 10, PB = 24;
  const chartW = W - PL - PR, chartH = H - PT - PB, MAX_RANK = 20;
  const points = history.map((h, i) => {
    const pos = h.domains[ownDomain];
    const x   = PL + (history.length === 1 ? chartW / 2 : (i / (history.length - 1)) * chartW);
    const y   = pos != null ? PT + ((pos - 1) / (MAX_RANK - 1)) * chartH : null;
    return { x, y, pos, date: h.checkedAt };
  }).filter(p => p.y != null);

  if (points.length === 0) {
    return (
      <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-dimmer)', fontSize: '13px' }}>
        圏外のため表示できません
      </div>
    );
  }
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fillD = pathD + ` L ${points[points.length-1].x.toFixed(1)} ${(H-PB).toFixed(1)} L ${points[0].x.toFixed(1)} ${(H-PB).toFixed(1)} Z`;
  const yTicks = [1, 5, 10, 15, 20];
  const labelStep = Math.max(1, Math.ceil(history.length / 5));
  const xLabels   = history.map((h, i) => ({ i, date: h.checkedAt })).filter((_, i) => i % labelStep === 0 || i === history.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTicks.map(t => {
        const y = PT + ((t - 1) / (MAX_RANK - 1)) * chartH;
        return (
          <g key={t}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--border)" strokeWidth="0.5" />
            <text x={PL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-dimmer)">{t}位</text>
          </g>
        );
      })}
      <path d={fillD} fill="var(--accent)" fillOpacity="0.08" />
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />)}
      {points.length > 0 && (
        <text x={points[points.length-1].x + 5} y={points[points.length-1].y + 4}
          fontSize="10" fill="var(--accent)" fontWeight="700">
          {points[points.length-1].pos}位
        </text>
      )}
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

// ─── SERP Top10 パネル ────────────────────────────────
function SerpPanel({ entries, ownDomain, competitors, checkedAt }) {
  if (!entries || entries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '200px', color: 'var(--text-dimmer)', gap: '8px' }}>
        <span style={{ fontSize: '28px' }}>🔍</span>
        <span style={{ fontSize: '13px' }}>次回の順位取得後に表示されます</span>
      </div>
    );
  }

  const compSet      = new Set(competitors.map(c => c.domain));
  const compLabelMap = Object.fromEntries(competitors.map(c => [c.domain, c.label]));

  return (
    <div>
      {checkedAt && (
        <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '10px' }}>
          取得日時: {fmtDateFull(checkedAt)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {entries.map(e => {
          const isOwn  = e.domain === ownDomain;
          const isComp = compSet.has(e.domain);
          return (
            <a key={e.id || e.position} href={e.url} target="_blank" rel="noreferrer"
               style={{
                 display: 'flex', alignItems: 'flex-start', gap: '10px',
                 padding: '7px 10px', borderRadius: '7px', textDecoration: 'none', color: 'inherit',
                 background: isOwn  ? 'rgba(99,102,241,0.07)'
                           : isComp ? '#fff5f5'
                           : 'transparent',
                 border: isOwn  ? '1px solid rgba(99,102,241,0.2)'
                       : isComp ? '1px solid #fca5a533'
                       : '1px solid transparent',
               }}>
              <span style={{
                minWidth: '22px', fontWeight: 800, fontSize: '13px', lineHeight: '1.6',
                color: isOwn ? 'var(--accent)' : isComp ? '#dc2626' : 'var(--text-dimmer)',
              }}>
                {e.position}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px', fontWeight: isOwn || isComp ? 700 : 500,
                  color: 'var(--text-main)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.5',
                }}>
                  {e.title || e.url}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{e.domain}</span>
                  {isOwn && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)',
                      background: 'rgba(99,102,241,0.1)', padding: '1px 6px', borderRadius: '10px' }}>
                      自社
                    </span>
                  )}
                  {isComp && !isOwn && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626',
                      background: '#fff0f0', padding: '1px 6px', borderRadius: '10px' }}>
                      {compLabelMap[e.domain] || '競合'}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: '2.2' }}>↗</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────
export default function SeoPage() {
  const [siteId,        setSiteId]        = useState('jube');
  const [keywords,      setKeywords]      = useState([]);
  const [competitors,   setCompetitors]   = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [config,        setConfig]        = useState({ alertThreshold: 5, alertEmail: '' });
  const [selectedKw,    setSelectedKw]    = useState(null);
  const [history,       setHistory]       = useState([]);
  const [serpEntries,   setSerpEntries]   = useState([]);
  const [serpCheckedAt, setSerpCheckedAt] = useState(null);
  const [rightTab,      setRightTab]      = useState('serp');
  const [loading,       setLoading]       = useState(true);
  const [checking,      setChecking]      = useState(false);
  const [msg,           setMsg]           = useState('');
  const [msgType,       setMsgType]       = useState('info');

  const [showKwForm,    setShowKwForm]    = useState(false);
  const [kwInput,       setKwInput]       = useState('');
  const [kwSaving,      setKwSaving]      = useState(false);
  const [kwListOpen,    setKwListOpen]    = useState(true);
  const [showCompForm,  setShowCompForm]  = useState(false);
  const [compDomain,    setCompDomain]    = useState('');
  const [compLabel,     setCompLabel]     = useState('');
  const [compSaving,    setCompSaving]    = useState(false);
  const [editConfig,    setEditConfig]    = useState(false);
  const [cfgThreshold,  setCfgThreshold]  = useState(5);
  const [cfgEmail,      setCfgEmail]      = useState('');
  const [cfgSaving,     setCfgSaving]     = useState(false);
  const selectedKwRef = useRef(null);

  const ownDomain      = SITES.find(s => s.siteId === siteId)?.domain || '';
  const siteCompetitors = competitors.filter(c => c.siteId === siteId);

  function showMsg(text, type) {
    setMsg(text); setMsgType(type || 'info');
    setTimeout(() => setMsg(''), 6000);
  }

  // ─── データ読み込み ──────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [kwRes, logRes, cfgRes] = await Promise.all([
        fetch(`/api/seo/keywords?siteId=${siteId}`).then(r => r.json()),
        fetch(`/api/seo/logs?siteId=${siteId}&limit=10`).then(r => r.json()),
        fetch(`/api/seo/config?siteId=${siteId}`).then(r => r.json()),
      ]);
      setKeywords(kwRes.keywords   || []);
      setCompetitors(kwRes.competitors || []);
      setLogs(logRes.logs   || []);
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

  useEffect(() => {
    loadAll();
    setSelectedKw(null); setHistory([]); setSerpEntries([]);
  }, [loadAll]);

  async function selectKeyword(kw) {
    const myId = kw.id;
    selectedKwRef.current = myId;
    setSelectedKw(kw);
    setHistory([]); setSerpEntries([]);
    const [histRes, serpRes] = await Promise.all([
      fetch(`/api/seo/history/${kw.id}?limit=30`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/seo/serp/${kw.id}`).then(r => r.json()).catch(() => ({})),
    ]);
    // 別のキーワードが選択されていたら破棄（race condition防止）
    if (selectedKwRef.current !== myId) return;
    setHistory(histRes.history     || []);
    setSerpEntries(serpRes.entries || []);
    setSerpCheckedAt(serpRes.checkedAt || null);
  }

  // ─── サマリー計算 ────────────────────────────────────
  const top10Count    = keywords.filter(k => k.position != null && k.position <= 10).length;
  const top10Rate     = keywords.length ? Math.round((top10Count / keywords.length) * 100) : 0;
  const risingCount   = keywords.filter(k => k.prevPosition != null && k.position != null && k.position < k.prevPosition).length;
  const droppingCount = keywords.filter(k => k.prevPosition != null && k.position != null && k.position > k.prevPosition).length;
  const unrankedCount = keywords.filter(k => k.position == null).length;
  const lastCheck     = keywords.reduce((latest, k) => {
    if (!k.checkedAt) return latest;
    return !latest || new Date(k.checkedAt) > new Date(latest) ? k.checkedAt : latest;
  }, null);

  // ─── 操作ハンドラ ────────────────────────────────────
  async function handleCheck() {
    setChecking(true);
    const res  = await fetch('/api/seo/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, sendReport: true }),
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, keyword: kwInput }),
    });
    const data = await res.json();
    setKwSaving(false);
    if (data.success) {
      setKwInput(''); setShowKwForm(false);
      showMsg(`${data.count}件のキーワードを追加しました`, 'success');
      loadAll();
    } else showMsg(data.error || '追加失敗', 'error');
  }

  async function handleDeleteKeyword(id) {
    if (!confirm('このキーワードを削除しますか？')) return;
    await fetch('/api/seo/keywords', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (selectedKw?.id === id) { setSelectedKw(null); setHistory([]); setSerpEntries([]); }
    loadAll();
  }

  function handleCompDomainChange(e) {
    const val = e.target.value;
    // URLが貼り付けられたらドメインを自動抽出
    if (val.startsWith('http://') || val.startsWith('https://')) {
      try {
        const domain = new URL(val).hostname.replace(/^www\./, '');
        setCompDomain(domain);
        if (!compLabel) setCompLabel(domain);
      } catch {
        setCompDomain(val);
      }
    } else {
      setCompDomain(val);
    }
  }

  async function handleAddCompetitor(e) {
    e.preventDefault();
    if (!compDomain.trim()) return;
    setCompSaving(true);
    const res  = await fetch('/api/seo/competitors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, domain: compDomain.trim(), label: compLabel.trim() || compDomain.trim() }),
    });
    const data = await res.json();
    setCompSaving(false);
    if (data.success) {
      setCompDomain(''); setCompLabel(''); setShowCompForm(false);
      showMsg('競合サイトを追加しました', 'success'); loadAll();
    } else showMsg(data.error || '追加失敗', 'error');
  }

  async function handleDeleteCompetitor(id) {
    if (!confirm('この競合サイトを削除しますか？')) return;
    await fetch('/api/seo/competitors', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadAll();
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setCfgSaving(true);
    const res  = await fetch('/api/seo/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, alertThreshold: cfgThreshold, alertEmail: cfgEmail }),
    });
    const data = await res.json();
    setCfgSaving(false);
    if (data.success) { setConfig(data.config); setEditConfig(false); showMsg('保存しました', 'success'); }
    else showMsg(data.error || '保存失敗', 'error');
  }

  function handleCsvExport() { window.location.href = `/api/seo/csv?siteId=${siteId}`; }

  // キーワード行のグリッド列（競合ありなし）
  const hasComp    = siteCompetitors.length > 0;
  const gridCols   = `1fr ${hasComp ? '64px ' : ''}64px 18px`;

  // ─── レンダリング ────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1300px' }}>

      {/* ── ヘッダー ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={handleCsvExport} style={{ ...btn(false), fontSize: '12px' }}>↓ CSV</button>
          <button onClick={() => window.open(`/api/seo/pdf?siteId=${siteId}`, '_blank')} style={{ ...btn(false), fontSize: '12px' }}>
            📄 PDF
          </button>
        </div>
        <button onClick={handleCheck} disabled={checking}
          style={{ ...btn(true), opacity: checking ? 0.6 : 1 }}>
          {checking ? '処理中…' : '▶ 今すぐ取得'}
        </button>
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
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        {SITES.map(s => (
          <button key={s.siteId} onClick={() => setSiteId(s.siteId)} style={{
            padding: '5px 18px', borderRadius: '6px', border: '1px solid var(--border)',
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

        {/* Top10率 */}
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>Top10率</div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
            {top10Rate}<span style={{ fontSize: '16px' }}>%</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '6px' }}>
            {top10Count} / {keywords.length} キーワード
          </div>
        </div>

        {/* 変動 */}
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '8px' }}>前回比 変動</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>▲{risingCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '4px' }}>上昇</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>▼{droppingCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '4px' }}>下降</div>
            </div>
          </div>
        </div>

        {/* 圏外 */}
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>圏外キーワード</div>
          <div style={{ fontSize: '30px', fontWeight: 800, lineHeight: 1,
            color: unrankedCount > 0 ? '#f59e0b' : 'var(--text-main)' }}>
            {unrankedCount}<span style={{ fontSize: '16px' }}>件</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginTop: '6px' }}>
            {lastCheck ? `最終取得: ${fmtDateFull(lastCheck)}` : '未取得'}
          </div>
        </div>
      </div>

      {/* ── メインエリア ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* ── 左: キーワード一覧 ── */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>キーワード一覧</span>
              <button onClick={() => setKwListOpen(v => !v)}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px',
                  cursor: 'pointer', fontSize: '10px', padding: '2px 7px', color: 'var(--text-dimmer)' }}>
                {kwListOpen ? '小窓 ▼' : '全表示 ▲'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button onClick={() => { setShowKwForm(v => !v); setShowCompForm(false); }}
                style={{ ...btn(false), fontSize: '11px', padding: '4px 10px' }}>＋ キーワード</button>
              <button onClick={() => { setShowCompForm(v => !v); setShowKwForm(false); }}
                style={{ ...btn(false), fontSize: '11px', padding: '4px 10px' }}>＋ 競合</button>
            </div>
          </div>

          {/* フォーム類（常に表示） */}
          {(<>

          {/* キーワード追加フォーム */}
          {showKwForm && (
            <div style={{ background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
              <form onSubmit={handleAddKeywords}>
                <textarea value={kwInput} onChange={e => setKwInput(e.target.value)}
                  placeholder={'成田 トイレ リフォーム\nキッチン リフォーム 千葉'}
                  rows={3} style={{ ...inp, width: '100%', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" disabled={kwSaving} style={{ ...btn(true), padding: '5px 14px', fontSize: '12px' }}>
                    {kwSaving ? '追加中…' : '追加'}
                  </button>
                  <button type="button" onClick={() => setShowKwForm(false)}
                    style={{ ...btn(false), padding: '5px 14px', fontSize: '12px' }}>キャンセル</button>
                </div>
              </form>
            </div>
          )}

          {/* 競合追加フォーム */}
          {showCompForm && (
            <div style={{ background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
              <form onSubmit={handleAddCompetitor}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <input type="text" value={compDomain} onChange={handleCompDomainChange}
                    placeholder="URL または example.co.jp" style={{ ...inp, width: '210px' }} />
                  <input type="text" value={compLabel} onChange={e => setCompLabel(e.target.value)}
                    placeholder="表示名" style={{ ...inp, width: '110px' }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" disabled={compSaving} style={{ ...btn(true), padding: '5px 14px', fontSize: '12px' }}>
                    {compSaving ? '追加中…' : '追加'}
                  </button>
                  <button type="button" onClick={() => setShowCompForm(false)}
                    style={{ ...btn(false), padding: '5px 14px', fontSize: '12px' }}>キャンセル</button>
                </div>
              </form>
            </div>
          )}

          {/* 登録済み競合バッジ */}
          {siteCompetitors.length > 0 && (
            <div style={{ marginBottom: '10px', padding: '8px 10px',
              background: 'var(--bg-sidebar)', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '4px' }}>登録済み競合</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {siteCompetitors.map(c => (
                  <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px',
                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                    background: '#fff0f0', color: '#dc2626', border: '1px solid #fca5a533' }}>
                    {c.label}
                    <button onClick={() => handleDeleteCompetitor(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: '#dc2626', fontSize: '11px', padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* テーブルヘッダー */}
          {!loading && keywords.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '4px',
              padding: '3px 8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontWeight: 600 }}>キーワード</span>
              {hasComp && <span style={{ fontSize: '10px', color: '#dc262699', fontWeight: 600, textAlign: 'right' }}>競合best</span>}
              <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontWeight: 600, textAlign: 'right' }}>自社</span>
              <span />
            </div>
          )}

          {/* キーワードリスト（小窓 or 展開） */}
          <div style={{
            maxHeight: kwListOpen ? 'none' : '280px',
            overflowY: kwListOpen ? 'visible' : 'auto',
            borderRadius: kwListOpen ? 0 : '6px',
            border: kwListOpen ? 'none' : '1px solid var(--border)',
          }}>
            {loading ? (
              <p style={{ color: 'var(--text-dimmer)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>読み込み中…</p>
            ) : keywords.length === 0 ? (
              <p style={{ color: 'var(--text-dimmer)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                キーワードが登録されていません
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {keywords.map(kw => {
                  const isSelected = selectedKw?.id === kw.id;

                  // 競合best（最も順位が良い＝数値が小さい）
                  const compEntries = Object.entries(kw.competitorPositions || {})
                    .filter(([, pos]) => pos != null);
                  const bestComp = compEntries.reduce(
                    (best, [dom, pos]) => (best.pos == null || pos < best.pos ? { dom, pos } : best),
                    { dom: null, pos: null }
                  );

                  return (
                    <div key={kw.id} onClick={() => selectKeyword(kw)}
                      style={{
                        display: 'grid', gridTemplateColumns: gridCols, gap: '4px',
                        alignItems: 'center', padding: '7px 8px', borderRadius: '6px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
                        border:     isSelected ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        transition: 'background 0.1s',
                      }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {kw.keyword}
                      </span>

                      {hasComp && (
                        <span style={{ textAlign: 'right', fontSize: '12px', color: bestComp.pos != null ? '#dc2626' : 'var(--text-dimmer)' }}>
                          {bestComp.pos != null ? `${Math.round(bestComp.pos)}位` : '—'}
                        </span>
                      )}

                      <span style={{ textAlign: 'right' }}>
                        <RankBadge position={kw.position} prevPosition={kw.prevPosition} />
                      </span>

                      <button onClick={e => { e.stopPropagation(); handleDeleteKeyword(kw.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-dimmer)', fontSize: '12px', padding: 0 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          </>)
        </div>

        {/* ── 右: SERP / グラフパネル ── */}
        <div style={card}>
          {selectedKw ? (
            <>
              {/* 選択キーワード */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '2px' }}>選択中</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{selectedKw.keyword}</div>
              </div>

              {/* タブ */}
              <div style={{ display: 'flex', gap: '2px', marginBottom: '14px',
                background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '3px' }}>
                {[['serp', '🔍 SERP Top10'], ['graph', '📈 順位推移']].map(([tab, label]) => (
                  <button key={tab} onClick={() => setRightTab(tab)} style={{
                    flex: 1, padding: '5px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 600,
                    background: rightTab === tab ? '#fff' : 'transparent',
                    color:      rightTab === tab ? 'var(--text-main)' : 'var(--text-dimmer)',
                    boxShadow:  rightTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}>
                    {label}
                  </button>
                ))}
              </div>

              {rightTab === 'serp' ? (
                <SerpPanel
                  entries={serpEntries}
                  ownDomain={ownDomain}
                  competitors={siteCompetitors}
                  checkedAt={serpCheckedAt}
                />
              ) : (
                <TrendChart history={history} ownDomain={ownDomain} />
              )}
            </>
          ) : (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-dimmer)', fontSize: '13px', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '32px' }}>🔍</span>
              <span style={{ textAlign: 'center', lineHeight: 1.7 }}>
                左のキーワードを選択すると<br />SERP Top10・順位推移を表示します
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 下段: アラート設定 + 取得ログ ── */}
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
                  通知先メール
                </label>
                <input type="email" value={cfgEmail} onChange={e => setCfgEmail(e.target.value)}
                  placeholder="your@email.com" style={{ ...inp, width: '260px' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" disabled={cfgSaving}
                  style={{ ...btn(true), fontSize: '12px', padding: '5px 14px' }}>
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
                <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-dimmer)', minWidth: '100px' }}>{fmtDateFull(log.startedAt)}</span>
                  <span style={{ fontWeight: 700, minWidth: '56px',
                    color: log.status === 'success' ? '#16a34a' : log.status === 'error' ? '#dc2626' : '#f59e0b' }}>
                    {log.status === 'success' ? '✓ 正常' : log.status === 'error' ? '✕ エラー' : '… 実行中'}
                  </span>
                  {log.count != null && <span style={{ color: 'var(--text-sub)' }}>{log.count}件</span>}
                  {log.error && (
                    <span style={{ color: '#dc2626', fontSize: '11px', flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={log.error}>{log.error}</span>
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
