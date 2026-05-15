'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── 定数 ───────────────────────────────────────────────
const SITES = [
  { siteId: 'jube',   label: '重兵衛',  domain: 'jube.co.jp' },
  { siteId: 'nurube', label: 'ぬりべえ', domain: 'nuribe.jp'  },
];
const THRESHOLDS = [3, 5, 10];

// 店舗フィルター（キーワードテキストとの部分一致で絞り込む）
const STORE_FILTERS = {
  jube: [
    { id: 'all',     label: '全店' },
    { id: 'narita',  label: '成田',         areas: ['成田'] },
    { id: 'palna',   label: 'パルナ',       areas: ['パルナ', '稲敷', '佐原'] },
    { id: 'kashima', label: '鹿嶋・神栖',   areas: ['鹿嶋', '鹿島', '神栖'] },
    { id: 'ushiku',  label: '牛久・龍ヶ崎', areas: ['牛久', '龍ヶ崎', '阿見'] },
    { id: 'sakura',  label: '佐倉',         areas: ['佐倉'] },
    { id: 'kashiwa', label: '柏',           areas: ['柏'] },
    { id: 'togane',  label: '東金',         areas: ['東金'] },
    { id: 'asahi',   label: '旭・東総',     areas: ['旭', '東総'] },
    { id: 'mito',    label: '茨城・水戸',   areas: ['茨城', '水戸'] },
    { id: 'toride',  label: '取手・守谷',   areas: ['取手', '守谷'] },
    { id: 'chiba',   label: '千葉若葉',     areas: ['若葉', '千葉若葉'] },
  ],
  nurube: [
    { id: 'all',     label: '全店' },
    { id: 'narita',  label: '成田',         areas: ['成田'] },
    { id: 'palna',   label: 'パルナ',       areas: ['パルナ', '稲敷', '佐原'] },
    { id: 'kashima', label: '鹿嶋・神栖',   areas: ['鹿嶋', '鹿島', '神栖'] },
    { id: 'ushiku',  label: '牛久・龍ヶ崎', areas: ['牛久', '龍ヶ崎', '阿見'] },
    { id: 'sakura',  label: '佐倉',         areas: ['佐倉'] },
    { id: 'kashiwa', label: '柏',           areas: ['柏'] },
    { id: 'togane',  label: '東金',         areas: ['東金'] },
    { id: 'asahi',   label: '旭・東総',     areas: ['旭', '東総'] },
    { id: 'mito',    label: '茨城・水戸',   areas: ['茨城', '水戸'] },
    { id: 'toride',  label: '取手・守谷',   areas: ['取手', '守谷'] },
    { id: 'chiba',   label: '千葉若葉',     areas: ['若葉', '千葉若葉'] },
  ],
};

// ─── スタイル定数 ─────────────────────────────────────
const card = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border)',
  borderRadius: '10px',
  padding:      '14px',
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

// ─── CTR / 期待流入数 ─────────────────────────────────
const CTR_BY_RANK = [0, 31.7, 24.7, 18.7, 13.6, 9.5, 6.7, 5.0, 4.0, 3.2, 2.5];
function rankCTR(pos) {
  if (pos == null) return 0;
  const r = Math.round(pos);
  if (r < 1 || r > 20) return 0;
  return r <= 10 ? (CTR_BY_RANK[r] || 0) / 100 : 0.004;
}
function kwExpected(pos) {
  if (pos == null) return 0;
  return Math.round(rankCTR(pos) * 100);
}

// ─── インサイト計算 ───────────────────────────────────
function calcStrongKeywords(keywords) {
  return [...keywords]
    .filter(k => k.position != null && k.position <= 10)
    .sort((a, b) => a.position - b.position)
    .slice(0, 10);
}
function calcWeakKeywords(keywords) {
  const unranked = keywords.filter(k => k.position == null);
  const ranked   = [...keywords]
    .filter(k => k.position != null && k.position > 10)
    .sort((a, b) => b.position - a.position);
  return [...ranked, ...unranked].slice(0, 10);
}
function calcImprovementKeywords(keywords) {
  return [...keywords]
    .filter(k => k.position == null || k.position > 10)
    .map(k => {
      let score = 0;
      if (k.position != null) score += Math.max(0, 21 - k.position) * 2;
      if (k.prevPosition != null && k.position != null && k.position > k.prevPosition)
        score += (k.position - k.prevPosition) * 3;
      return { ...k, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);
}

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
function RankBadge({ position, prevPosition, small }) {
  if (position == null) return <span style={{ color: 'var(--text-dimmer)', fontSize: small ? '10px' : '11px' }}>圏外</span>;
  const pos  = Math.round(position);
  const diff = posDiff(position, prevPosition);
  const col  = diff == null ? 'var(--text-main)' : diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : 'var(--text-main)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2px' }}>
      <strong style={{ fontSize: small ? '12px' : '13px', color: col }}>{pos}位</strong>
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

// ─── SEO Top10 パネル ────────────────────────────────
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
                 background: isOwn ? 'rgba(99,102,241,0.07)' : isComp ? '#fff5f5' : 'transparent',
                 border: isOwn ? '1px solid rgba(99,102,241,0.2)' : isComp ? '1px solid #fca5a533' : '1px solid transparent',
               }}>
              <span style={{ minWidth: '22px', fontWeight: 800, fontSize: '13px', lineHeight: '1.6',
                color: isOwn ? 'var(--accent)' : isComp ? '#dc2626' : 'var(--text-dimmer)' }}>
                {e.position}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: isOwn || isComp ? 700 : 500,
                  color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.5' }}>
                  {e.title || e.url}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>{e.domain}</span>
                  {isOwn && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)',
                      background: 'rgba(99,102,241,0.1)', padding: '1px 6px', borderRadius: '10px' }}>自社</span>
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
  const [storeFilter,   setStoreFilter]   = useState('all');
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
  const [kwListOpen,    setKwListOpen]    = useState(false);
  const [kwSort,        setKwSort]        = useState('traffic');
  const [selectMode,      setSelectMode]      = useState(false);
  const [selectedIds,     setSelectedIds]     = useState(new Set());
  const [showExpectedTip, setShowExpectedTip] = useState(false);
  const [showCompForm,  setShowCompForm]  = useState(false);
  const [compDomain,    setCompDomain]    = useState('');
  const [compLabel,     setCompLabel]     = useState('');
  const [compSaving,    setCompSaving]    = useState(false);
  const [compSuggestions, setCompSuggestions] = useState([]);
  const [editConfig,    setEditConfig]    = useState(false);
  const [cfgThreshold,  setCfgThreshold]  = useState(5);
  const [cfgEmail,      setCfgEmail]      = useState('');
  const [cfgSaving,     setCfgSaving]     = useState(false);
  const selectedKwRef = useRef(null);

  const ownDomain       = SITES.find(s => s.siteId === siteId)?.domain || '';
  const siteCompetitors = competitors.filter(c => c.siteId === siteId);

  // ─── 店舗フィルター ──────────────────────────────────
  const storeFilters = STORE_FILTERS[siteId] || [{ id: 'all', label: '全店' }];
  const filteredKeywords = (() => {
    if (storeFilter === 'all') return keywords;
    const store = storeFilters.find(s => s.id === storeFilter);
    if (!store || !store.areas) return keywords;
    return keywords.filter(kw => store.areas.some(area => kw.keyword.includes(area)));
  })();

  function showMsg(text, type) {
    setMsg(text); setMsgType(type || 'info');
    setTimeout(() => setMsg(''), 6000);
  }

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
    setStoreFilter('all');
  }, [loadAll]);

  useEffect(() => {
    if (selectedKw && !filteredKeywords.find(k => k.id === selectedKw.id)) {
      setSelectedKw(null); setHistory([]); setSerpEntries([]);
    }
  }, [storeFilter]);

  // ─── エリア競合サジェスト ─────────────────────────────
  useEffect(() => {
    if (filteredKeywords.length === 0) { setCompSuggestions([]); return; }
    const ids = filteredKeywords.map(k => k.id).join(',');
    fetch(`/api/seo/competitor-suggestions?siteId=${siteId}&ownDomain=${encodeURIComponent(ownDomain)}&keywordIds=${ids}`)
      .then(r => r.json())
      .then(d => { if (d.success) setCompSuggestions(d.suggestions || []); })
      .catch(() => {});
  }, [filteredKeywords, siteId, ownDomain]);

  async function selectKeyword(kw) {
    const myId = kw.id;
    selectedKwRef.current = myId;
    setSelectedKw(kw);
    setHistory([]); setSerpEntries([]);
    const [histRes, serpRes] = await Promise.all([
      fetch(`/api/seo/history/${kw.id}?limit=30`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/seo/serp/${kw.id}`).then(r => r.json()).catch(() => ({})),
    ]);
    if (selectedKwRef.current !== myId) return;
    setHistory(histRes.history     || []);
    setSerpEntries(serpRes.entries || []);
    setSerpCheckedAt(serpRes.checkedAt || null);
  }

  // ─── サマリー計算 ─────────────────────────────────────
  const top10Count    = filteredKeywords.filter(k => k.position != null && k.position <= 10).length;
  const top10Rate     = filteredKeywords.length ? Math.round((top10Count / filteredKeywords.length) * 100) : 0;
  const risingCount   = filteredKeywords.filter(k => k.prevPosition != null && k.position != null && k.position < k.prevPosition).length;
  const droppingCount = filteredKeywords.filter(k => k.prevPosition != null && k.position != null && k.position > k.prevPosition).length;
  const totalExpected = filteredKeywords.reduce((s, k) => s + kwExpected(k.position), 0);
  let compWin = 0, compLose = 0;
  filteredKeywords.forEach(kw => {
    if (kw.position == null) return;
    const compPositions = Object.values(kw.competitorPositions || {}).filter(p => p != null);
    if (!compPositions.length) return;
    const bestComp = Math.min(...compPositions);
    if (kw.position < bestComp) compWin++;
    else if (kw.position > bestComp) compLose++;
  });

  const strongKeywords = calcStrongKeywords(filteredKeywords);
  const weakKeywords   = calcWeakKeywords(filteredKeywords);

  // 平均順位
  const rankedKws    = filteredKeywords.filter(k => k.position != null);
  const avgPosition  = rankedKws.length > 0
    ? Math.round(rankedKws.reduce((s, k) => s + k.position, 0) / rankedKws.length * 10) / 10
    : null;

  // 競合別 勝敗集計
  const compStats = siteCompetitors.map(comp => {
    let win = 0, lose = 0;
    filteredKeywords.forEach(kw => {
      if (kw.position == null) return;
      const cp = (kw.competitorPositions || {})[comp.domain];
      if (cp == null) return;
      if (kw.position < cp) win++;
      else if (kw.position > cp) lose++;
    });
    return { ...comp, win, lose };
  });

  const displayKeywords = kwSort === 'traffic'
    ? [...filteredKeywords].sort((a, b) => kwExpected(b.position) - kwExpected(a.position))
    : filteredKeywords;

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
    if (val.startsWith('http://') || val.startsWith('https://')) {
      try {
        const domain = new URL(val).hostname.replace(/^www\./, '');
        setCompDomain(domain);
        if (!compLabel) setCompLabel(domain);
      } catch { setCompDomain(val); }
    } else { setCompDomain(val); }
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

  async function handleBulkDelete() {
    if (!selectedIds.size) return;
    if (!confirm(`選択した${selectedIds.size}件のキーワードを削除しますか？`)) return;
    await Promise.all([...selectedIds].map(id =>
      fetch('/api/seo/keywords', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    ));
    if (selectedKw && selectedIds.has(selectedKw.id)) {
      setSelectedKw(null); setHistory([]); setSerpEntries([]);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
    loadAll();
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleVolumeSave(id, val) {
    const volume = val === '' ? null : parseInt(val, 10);
    if (val !== '' && isNaN(volume)) { return; }
    await fetch('/api/seo/keywords', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, searchVolume: volume }),
    });
    loadAll();
  }

  const hasComp  = siteCompetitors.length > 0;
  const gridCols = `${selectMode ? '22px ' : ''}1fr ${hasComp ? '52px ' : ''}48px 52px${selectMode ? '' : ' 18px'}`;

  // ─── レンダリング ────────────────────────────────────
  return (
    <div className="seo-wrap" style={{ padding: '0 0 20px', maxWidth: '1300px' }}>
    <style>{`
      @media (max-width: 767px) {
        .seo-wrap { padding: 10px !important; }
        .seo-topbar { flex-wrap: wrap !important; gap: 6px !important; }
        .seo-all-cards {
          grid-template-columns: repeat(2, 1fr) !important;
        }
        .seo-wide-card { grid-column: span 2 !important; }
        .seo-main-grid { grid-template-columns: 1fr !important; }
        .seo-main-grid > * { min-width: 0; overflow: hidden; }
        .seo-kw-card { height: auto !important; }
        .seo-kw-list-scroll { max-height: 260px !important; flex: none !important; }
        .seo-right-panel { height: auto !important; overflow-y: visible !important; }
        .seo-bottom-grid { grid-template-columns: 1fr !important; }
        .seo-comp-inputs { flex-direction: column !important; }
        .seo-comp-inputs input { width: 100% !important; box-sizing: border-box !important; }
        .seo-store-filter { flex-wrap: nowrap !important; overflow-x: auto !important; }
        .seo-kw-header { flex-wrap: wrap !important; gap: 5px !important; }
      }
      @media (min-width: 768px) {
        .seo-kw-card {
          display: flex !important;
          flex-direction: column !important;
          height: 620px !important;
          box-sizing: border-box !important;
        }
        .seo-kw-list-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }
        .seo-kw-list-scroll {
          flex: 1 !important; max-height: none !important;
          overflow-y: auto !important; overflow-x: hidden !important; min-height: 0;
        }
        .seo-right-panel {
          height: 620px !important; overflow: hidden !important; box-sizing: border-box !important;
          display: flex !important; flex-direction: column !important;
        }
        .seo-right-content {
          flex: 1 !important; overflow-y: auto !important; min-height: 0 !important;
        }
      }
    `}</style>

      {/* ── トップバー: サイトタブ + アクションボタン（1行） ── */}
      <div className="seo-topbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px', gap: '8px',
      }}>
        {/* 左: サイトタブ */}
        <div style={{ display: 'flex', gap: '4px' }}>
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
        {/* 右: CSV / PDF / 今すぐ取得 */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={handleCsvExport} style={{ ...btn(false), fontSize: '12px', padding: '5px 12px' }}>↓ CSV</button>
          <button onClick={() => window.open(`/api/seo/pdf?siteId=${siteId}`, '_blank')}
            style={{ ...btn(false), fontSize: '12px', padding: '5px 12px' }}>📄 PDF</button>
          <button onClick={handleCheck} disabled={checking}
            style={{ ...btn(true), opacity: checking ? 0.6 : 1 }}>
            {checking ? '処理中…' : '▶ 今すぐ取得'}
          </button>
        </div>
      </div>

      {/* ── メッセージ ── */}
      {msg && (
        <div style={{
          borderRadius: '6px', padding: '8px 14px', fontSize: '13px', marginBottom: '10px',
          background: msgType === 'error' ? '#fff0f0' : '#f0fdf4',
          border: `1px solid ${msgType === 'error' ? '#fca5a5' : '#86efac'}`,
          color:  msgType === 'error' ? '#b91c1c' : '#15803d',
        }}>{msg}</div>
      )}

      {/* ── 店舗フィルターバー ── */}
      <div className="seo-store-filter" style={{
        display: 'flex', gap: '5px', marginBottom: '12px',
        padding: '8px 12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        WebkitOverflowScrolling: 'touch',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', alignSelf: 'center',
          flexShrink: 0, marginRight: '2px', fontWeight: 600 }}>店舗</span>
        {storeFilters.map(s => {
          const isActive = storeFilter === s.id;
          const cnt = s.id !== 'all' && s.areas
            ? keywords.filter(kw => s.areas.some(area => kw.keyword.includes(area))).length
            : null;
          return (
            <button key={s.id} onClick={() => setStoreFilter(s.id)} style={{
              padding: '3px 10px', borderRadius: '20px',
              border: isActive ? 'none' : '1px solid var(--border)',
              cursor: 'pointer', fontSize: '12px', fontWeight: isActive ? 700 : 500,
              background: isActive ? 'var(--accent)' : 'var(--bg-input)',
              color:      isActive ? '#fff'          : 'var(--text-main)',
              flexShrink: 0, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
              {s.label}
              {cnt != null && cnt > 0 && (
                <span style={{
                  marginLeft: '4px', fontSize: '10px',
                  background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--bg-sidebar)',
                  color: isActive ? '#fff' : 'var(--text-dimmer)',
                  padding: '1px 4px', borderRadius: '8px',
                }}>{cnt}</span>
              )}
            </button>
          );
        })}
        {storeFilter !== 'all' && (
          <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', alignSelf: 'center',
            marginLeft: '4px', flexShrink: 0 }}>
            {filteredKeywords.length}件表示中
          </span>
        )}
      </div>

      {/* ── カードグリッド（KPI 4枚 + インサイト 2枚、1行） ── */}
      <div className="seo-all-cards" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 2fr 2fr',
        gap: '10px',
        marginBottom: '16px',
        alignItems: 'stretch',
      }}>

        {/* ① 平均順位（新規） */}
        <div style={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '4px' }}>平均順位</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>
            {avgPosition != null
              ? <>{avgPosition}<span style={{ fontSize: '14px' }}>位</span></>
              : <span style={{ fontSize: '16px', color: 'var(--text-dimmer)' }}>—</span>
            }
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
            {rankedKws.length} / {filteredKeywords.length} KW
          </div>
        </div>

        {/* ② Top10率 */}
        <div style={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '4px' }}>Top10率</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
            {top10Rate}<span style={{ fontSize: '14px' }}>%</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
            {top10Count} / {filteredKeywords.length} KW
          </div>
        </div>

        {/* ② 前回比変動 */}
        <div style={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>前回比 変動</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>▲{risingCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>上昇</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>▼{droppingCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>下降</div>
            </div>
          </div>
        </div>

        {/* ③ 期待流入数 */}
        <div style={{ ...card, textAlign: 'center', position: 'relative',
          display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
            期待流入数
            <button onClick={() => setShowExpectedTip(v => !v)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%',
                width: '13px', height: '13px', cursor: 'pointer', fontSize: '9px', color: 'var(--text-dimmer)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
              i
            </button>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0891b2', lineHeight: 1 }}>
            {totalExpected.toLocaleString()}<span style={{ fontSize: '12px' }}>/月</span>
          </div>

          {showExpectedTip && (
            <>
              <div onClick={() => setShowExpectedTip(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.25)' }} />
              <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 'min(360px, calc(100vw - 32px))', zIndex: 201,
                background: '#ffffff', borderRadius: '10px', border: '1px solid var(--border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '16px', textAlign: 'left',
                fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.7,
              }}>
                <button onClick={() => setShowExpectedTip(false)}
                  style={{ position: 'absolute', top: '10px', right: '12px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '16px', color: 'var(--text-dimmer)', lineHeight: 1, padding: 0 }}>×</button>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', fontSize: '12px' }}>
                  期待流入数（Estimated Traffic）の算出根拠
                </div>
                <div style={{ marginBottom: '8px' }}>現在の順位から月間訪問者数を予測した指標です。</div>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>算出式: 検索数 × 順位別CTR</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0',
                  border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', fontSize: '10px' }}>
                  {['順位','CTR','順位','CTR'].map((h, i) => (
                    <div key={i} style={{ padding: '3px 6px', background: 'var(--bg-sidebar)',
                      borderBottom: '1px solid var(--border)',
                      borderRight: i < 3 ? '1px solid var(--border)' : 'none',
                      fontWeight: 600, color: 'var(--text-dimmer)' }}>{h}</div>
                  ))}
                  {[['1位','31.7%','6位','6.7%'],['2位','24.7%','7位','5.0%'],['3位','18.7%','8位','4.0%'],
                    ['4位','13.6%','9位','3.2%'],['5位','9.5%','10位','2.5%'],['','','11位〜','0.4%']
                  ].map(([r1,c1,r2,c2], i) => (
                    <div key={i} style={{ display: 'contents' }}>
                      {[r1,c1,r2,c2].map((val, j) => (
                        <div key={j} style={{
                          padding: '3px 6px',
                          borderBottom: i < 5 ? '1px solid var(--border)' : 'none',
                          borderRight: j < 3 ? '1px solid var(--border)' : 'none',
                          background: i % 2 === 0 ? '#fff' : 'var(--bg-sidebar)',
                          color: j % 2 === 0 ? 'var(--text-dimmer)' : 'var(--text-main)',
                        }}>{val}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '8px' }}>
                  ※月間100検索を仮定した参考値
                </div>
              </div>
            </>
          )}
        </div>

        {/* ④ 競合勝敗 */}
        <div style={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '6px' }}>競合勝敗</div>
          {(compWin + compLose) > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{compWin}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>勝ち</div>
                </div>
                <div style={{ width: '1px', background: 'var(--border)' }} />
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>{compLose}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '3px' }}>負け</div>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '4px' }}>
                勝率 {Math.round(compWin / (compWin + compLose) * 100)}%
              </div>
            </>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>競合未登録</div>
          )}
        </div>

        {/* ⑤ 強い・弱いキーワード */}
        <div className="seo-wide-card" style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
          {/* 強い */}
          <div style={{ paddingRight: '10px', borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a',
              marginBottom: '7px', flexShrink: 0 }}>
              💪 強いKW
            </div>
            {strongKeywords.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>データなし</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {strongKeywords.map((kw, i) => (
                  <div key={kw.id} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '3px 6px', borderRadius: '5px',
                    background: i === 0 ? 'rgba(22,163,74,0.06)' : 'transparent',
                  }}>
                    <span style={{ fontSize: '10px', color: i === 0 ? '#16a34a' : 'var(--text-dimmer)',
                      fontWeight: 700, minWidth: '13px', flexShrink: 0 }}>{i + 1}</span>
                    <span title={kw.keyword} style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--text-main)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {kw.keyword}
                    </span>
                    <RankBadge position={kw.position} prevPosition={kw.prevPosition} small />
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* 弱い */}
          <div style={{ paddingLeft: '10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626',
              marginBottom: '7px', flexShrink: 0 }}>
              📉 弱いKW
            </div>
            {weakKeywords.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>データなし</div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {weakKeywords.map((kw, i) => (
                  <div key={kw.id} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '3px 6px', borderRadius: '5px',
                  }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-dimmer)',
                      fontWeight: 700, minWidth: '13px', flexShrink: 0 }}>{i + 1}</span>
                    <span title={kw.keyword} style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--text-main)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {kw.keyword}
                    </span>
                    <RankBadge position={kw.position} prevPosition={kw.prevPosition} small />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ⑦ 競合他社 */}
        <div className="seo-wide-card" style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)',
            marginBottom: '6px', flexShrink: 0 }}>
            🏢 競合他社
          </div>
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>

            {/* 登録済み競合 */}
            {siteCompetitors.length === 0 && compSuggestions.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-dimmer)' }}>競合未登録</div>
            )}
            {siteCompetitors.map(comp => {
              const stat    = compStats.find(s => s.id === comp.id) || { win: 0, lose: 0 };
              const total   = stat.win + stat.lose;
              const winRate = total > 0 ? Math.round(stat.win / total * 100) : null;
              return (
                <div key={comp.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <a href={`https://${comp.domain}`} target="_blank" rel="noreferrer"
                    style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: '#dc2626',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      minWidth: 0, textDecoration: 'none' }}
                    title={comp.domain}>
                    {comp.label} ↗
                  </a>
                  <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>{stat.win}勝</span>
                  <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>{stat.lose}敗</span>
                  {winRate != null && (
                    <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', flexShrink: 0 }}>{winRate}%</span>
                  )}
                </div>
              );
            })}

            {/* おすすめ競合（SERPから自動抽出） */}
            {compSuggestions.length > 0 && (
              <>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dimmer)',
                  letterSpacing: '0.06em', marginTop: siteCompetitors.length > 0 ? '4px' : '0',
                  borderTop: siteCompetitors.length > 0 ? '1px solid var(--border)' : 'none',
                  paddingTop: siteCompetitors.length > 0 ? '4px' : '0',
                }}>
                  💡 エリア主要会社
                </div>
                {compSuggestions.map(s => (
                  <div key={s.domain} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <a href={s.url || `https://${s.domain}`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, fontSize: '11px', fontWeight: 500, color: 'var(--text-sub)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        minWidth: 0, textDecoration: 'none' }}
                      title={s.domain}>
                      {s.domain} ↗
                    </a>
                    <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      最高{s.bestPosition}位
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      {s.count}KW
                    </span>
                    <button
                      onClick={() => { setCompDomain(s.domain); setCompLabel(s.domain); setShowCompForm(true); setShowKwForm(false); }}
                      style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', cursor: 'pointer',
                        background: 'var(--accent-dim)', color: 'var(--accent)',
                        border: '1px solid var(--accent)', fontWeight: 700, flexShrink: 0, lineHeight: 1.6 }}>
                      ＋登録
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── メインエリア ── */}
      <div className="seo-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* ── 左: キーワード一覧 ── */}
        <div className="seo-kw-card" style={card}>

          {/* ── ヘッダー1行 ── */}
          <div className="seo-kw-header" style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: '8px', flexWrap: 'wrap',
          }}>
            {/* タイトル */}
            <span style={{ fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>キーワード一覧</span>

            {/* 登録済み競合チップ（インライン） */}
            {siteCompetitors.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '2px',
                fontSize: '11px', padding: '2px 7px', borderRadius: '10px',
                background: '#fff0f0', color: '#dc2626', border: '1px solid #fca5a533',
                cursor: 'default',
              }}>
                {c.label}
                <button onClick={() => handleDeleteCompetitor(c.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#dc2626', fontSize: '12px', padding: 0, lineHeight: 1,
                }}>×</button>
              </span>
            ))}

            {/* スペーサー */}
            <span style={{ flex: 1 }} />

            {/* ユーティリティボタン群 */}
            {selectMode && selectedIds.size > 0 && (
              <button onClick={handleBulkDelete} style={{
                background: '#dc2626', border: 'none', borderRadius: '6px',
                cursor: 'pointer', fontSize: '11px', padding: '4px 10px',
                color: '#fff', fontWeight: 700,
              }}>
                削除 {selectedIds.size}件
              </button>
            )}
            <button onClick={() => { setSelectMode(v => { if (v) setSelectedIds(new Set()); return !v; }); }} style={{
              background: selectMode ? 'var(--accent-dim)' : 'transparent',
              border: '1px solid var(--border)', borderRadius: '6px',
              cursor: 'pointer', fontSize: '11px', padding: '4px 8px',
              color: selectMode ? 'var(--accent)' : 'var(--text-dimmer)',
              fontWeight: selectMode ? 700 : 400,
            }}>
              {selectMode ? '✕ 解除' : '選択'}
            </button>
            <button onClick={() => setKwListOpen(v => !v)} style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px',
              cursor: 'pointer', fontSize: '11px', padding: '4px 8px', color: 'var(--text-dimmer)',
            }}>
              {kwListOpen ? '▼ 縮小' : '▲ 全表示'}
            </button>
            <button onClick={() => { setShowKwForm(v => !v); setShowCompForm(false); }} style={{
              background: showKwForm ? 'var(--accent)' : 'var(--bg-input)',
              border: '1px solid var(--border)', borderRadius: '6px',
              cursor: 'pointer', fontSize: '11px', padding: '4px 10px',
              color: showKwForm ? '#fff' : 'var(--text-main)', fontWeight: 600,
            }}>＋ KW</button>
            <button onClick={() => { setShowCompForm(v => !v); setShowKwForm(false); }} style={{
              background: showCompForm ? 'var(--accent)' : 'var(--bg-input)',
              border: '1px solid var(--border)', borderRadius: '6px',
              cursor: 'pointer', fontSize: '11px', padding: '4px 10px',
              color: showCompForm ? '#fff' : 'var(--text-main)', fontWeight: 600,
            }}>＋ 競合</button>
          </div>

          {/* KW追加フォーム */}
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
                <div className="seo-comp-inputs" style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
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

          <div className="seo-kw-list-area">
          {!loading && filteredKeywords.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '4px',
              padding: '3px 8px', marginBottom: '2px' }}>
              {selectMode && <span />}
              <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontWeight: 600 }}>キーワード</span>
              {hasComp && <span style={{ fontSize: '10px', color: '#dc262699', fontWeight: 600, textAlign: 'right' }}>競合</span>}
              <span style={{ fontSize: '10px', color: 'var(--text-dimmer)', fontWeight: 600, textAlign: 'right' }}>自社</span>
              <button onClick={() => setKwSort(s => s === 'traffic' ? 'default' : 'traffic')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'right',
                  fontSize: '10px', fontWeight: 600,
                  color: kwSort === 'traffic' ? 'var(--accent)' : 'var(--text-dimmer)' }}>
                流入{kwSort === 'traffic' ? '▼' : '↕'}
              </button>
              {!selectMode && <span />}
            </div>
          )}

          <div className="seo-kw-list-scroll" style={{
            maxHeight: kwListOpen ? 'none' : '280px',
            overflowY: 'auto', overflowX: 'hidden',
            borderRadius: kwListOpen ? 0 : '6px',
            border: kwListOpen ? 'none' : '1px solid var(--border)',
          }}>
            {loading ? (
              <p style={{ color: 'var(--text-dimmer)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>読み込み中…</p>
            ) : filteredKeywords.length === 0 ? (
              <p style={{ color: 'var(--text-dimmer)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                {keywords.length === 0 ? 'キーワードが登録されていません' : 'この店舗のキーワードがありません'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {displayKeywords.map(kw => {
                  const isSelected = selectedKw?.id === kw.id;
                  const compEntries = Object.entries(kw.competitorPositions || {})
                    .filter(([, pos]) => pos != null);
                  const bestComp = compEntries.reduce(
                    (best, [dom, pos]) => (best.pos == null || pos < best.pos ? { dom, pos } : best),
                    { dom: null, pos: null }
                  );
                  const isChecked = selectedIds.has(kw.id);
                  return (
                    <div key={kw.id}
                      onClick={() => selectMode ? toggleSelect(kw.id) : selectKeyword(kw)}
                      style={{
                        display: 'grid', gridTemplateColumns: gridCols, gap: '4px',
                        alignItems: 'center', padding: '7px 8px', borderRadius: '6px',
                        cursor: 'pointer',
                        background: isChecked ? '#fef9f0' : isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
                        border: isChecked ? '1px solid #f59e0b33' : isSelected ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        transition: 'background 0.1s',
                      }}>
                      {selectMode && (
                        <input type="checkbox" checked={isChecked}
                          onChange={() => toggleSelect(kw.id)} onClick={e => e.stopPropagation()}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px' }} />
                      )}
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
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
                      <span style={{ textAlign: 'right', fontSize: '11px',
                        color: kw.position != null ? '#0891b2' : 'var(--text-dimmer)', fontWeight: 600 }}>
                        {kw.position != null ? kwExpected(kw.position) : '—'}
                      </span>
                      {!selectMode && (
                        <button onClick={e => { e.stopPropagation(); handleDeleteKeyword(kw.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-dimmer)', fontSize: '12px', padding: 0 }}>×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '6px', marginBottom: 0 }}>
            ※圏外 = 21位以下を指します。
          </p>
          </div>
        </div>

        {/* ── 右: SEO Top10 / グラフパネル ── */}
        <div className="seo-right-panel" style={card}>
          {selectedKw ? (
            <>
              {/* キーワード名 + タブボタン（1行） */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '8px', marginBottom: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '1px' }}>選択中</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedKw.keyword}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0,
                  background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '3px' }}>
                  {[['serp', '🔍 Top10'], ['graph', '📈 推移']].map(([tab, label]) => (
                    <button key={tab} onClick={() => setRightTab(tab)} style={{
                      padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 600,
                      background: rightTab === tab ? '#fff' : 'transparent',
                      color:      rightTab === tab ? 'var(--text-main)' : 'var(--text-dimmer)',
                      boxShadow:  rightTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* コンテンツ: flex-1 で残り全高を占有、自身でスクロール */}
              <div className="seo-right-content">
                {rightTab === 'serp' ? (
                  <SerpPanel entries={serpEntries} ownDomain={ownDomain}
                    competitors={siteCompetitors} checkedAt={serpCheckedAt} />
                ) : (
                  <TrendChart history={history} ownDomain={ownDomain} />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-dimmer)', fontSize: '13px', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '32px' }}>🔍</span>
              <span style={{ textAlign: 'center', lineHeight: 1.7 }}>
                左のキーワードを選択すると<br />SEO Top10・順位推移を表示します
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 下段: アラート設定 + 取得ログ ── */}
      <div className="seo-bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>

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
                  <span style={{
                    fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
                    background: log.trigger === 'auto' ? '#eff6ff' : '#f0fdf4',
                    color:      log.trigger === 'auto' ? '#2563eb' : '#16a34a',
                    border:     `1px solid ${log.trigger === 'auto' ? '#bfdbfe' : '#bbf7d0'}`,
                  }}>
                    {log.trigger === 'auto' ? '自動' : '手動'}
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
