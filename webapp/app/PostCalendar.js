'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSiteMeta, siteAvatarStyle } from '@/lib/siteMeta';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// コラムのWPステータス別カラー（page.js の WP_STATUS と整合）
const COLUMN_STATUS = {
  publish: { label: '公開',   color: '#15803d', bg: '#f0fdf4', dot: '#22c55e' },
  future:  { label: '予約',   color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  draft:   { label: '下書き', color: '#71717a', bg: '#f4f4f5', dot: '#a1a1aa' },
  error:   { label: 'エラー', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444' },
};
// リライトは種別自体を色で表現（紫）
const REWRITE_STATUS = {
  publish: { label: 'リライト公開', color: '#7c3aed' },
  posting: { label: 'リライト反映待ち', color: '#7c3aed' },
  error:   { label: 'リライト失敗',   color: '#dc2626' },
  manual:  { label: 'リライト（手動）', color: '#7c3aed' },
};
const REWRITE_DOT = '#8b5cf6';

function ym(y, m)        { return `${y}-${String(m + 1).padStart(2, '0')}`; }
function dkey(y, m, d)   { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

// イベント1件の色・ラベルを返す
function eventStyle(ev) {
  if (ev.type === 'rewrite') {
    const s = REWRITE_STATUS[ev.status] || REWRITE_STATUS.manual;
    return { dot: ev.status === 'error' ? '#ef4444' : REWRITE_DOT, color: s.color, label: s.label, icon: '🔄' };
  }
  const s = COLUMN_STATUS[ev.status] || COLUMN_STATUS.draft;
  return { dot: s.dot, color: s.color, label: s.label, icon: '✍️' };
}

const MAX_CHIPS = 3; // セル内に表示するチップ数の上限

export default function PostCalendar() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(true);
  const [siteFilter, setSiteFilter] = useState('all');
  const [selected, setSelected]     = useState(null); // 選択中の dateKey（詳細表示）

  const now = useMemo(() => new Date(), []);
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res  = await fetch('/api/calendar', { cache: 'no-store' });
        const data = await res.json();
        if (alive && data.success) setEvents(data.events || []);
      } catch { /* 取得失敗時は空表示 */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const todayKey = dkey(now.getFullYear(), now.getMonth(), now.getDate());

  // サイトフィルタ選択肢（イベントに登場するサイトのみ・order順）
  const siteOptions = useMemo(() => {
    const ids = Array.from(new Set(events.map(e => e.siteId)))
      .sort((a, b) => (getSiteMeta(a).order ?? 99) - (getSiteMeta(b).order ?? 99));
    return ['all', ...ids];
  }, [events]);

  // 表示月のイベントを日付キーでバケツ化
  const byDay = useMemo(() => {
    const prefix = ym(year, month);
    const map = {};
    for (const ev of events) {
      if (!ev.dateKey || !ev.dateKey.startsWith(prefix)) continue;
      if (siteFilter !== 'all' && ev.siteId !== siteFilter) continue;
      (map[ev.dateKey] ||= []).push(ev);
    }
    // 各日内はコラム→リライトの順、同種は公開系を先に
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.type === b.type ? 0 : a.type === 'column' ? -1 : 1));
    }
    return map;
  }, [events, year, month, siteFilter]);

  // 月内集計
  const monthEvents  = useMemo(() => Object.values(byDay).flat(), [byDay]);
  const colCount     = monthEvents.filter(e => e.type === 'column').length;
  const rewriteCount = monthEvents.filter(e => e.type === 'rewrite').length;

  // グリッドセル（日曜始まり・末尾を7の倍数までnull埋め）
  const cells = useMemo(() => {
    const startWd     = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < startWd; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  function shiftMonth(delta) {
    let m = month + delta, y = year;
    if (m < 0)  { m = 11; y -= 1; }
    if (m > 11) { m = 0;  y += 1; }
    setYear(y); setMonth(m); setSelected(null);
  }
  function goToday() { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(null); }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // 凡例チップ
  const legend = (dot, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {label}
    </span>
  );

  const navBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled}
      style={{
        fontSize: '13px', lineHeight: 1, width: 28, height: 28, borderRadius: '7px',
        border: '1px solid var(--border)', background: '#ffffff',
        color: disabled ? 'var(--text-dimmer)' : 'var(--text-sub)',
        cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
      }}>
      {label}
    </button>
  );

  return (
    <div className="rounded-xl mb-5"
         style={{ background: '#ffffff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
      {/* ── ヘッダー（折り畳み） ── */}
      <div onClick={() => setOpen(o => !o)}
           style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 16px',
                    background: '#fafafa', cursor: 'pointer', userSelect: 'none',
                    borderBottom: open ? '1px solid var(--border)' : 'none' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>📅 投稿カレンダー</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{year}年{month + 1}月</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px',
                         background: '#f0fdf4', color: '#15803d' }}>✍️ {colCount}</span>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px',
                         background: '#f5f3ff', color: '#7c3aed' }}>🔄 {rewriteCount}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '2px' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <div style={{ padding: '12px 14px 16px' }}>
          {/* ── 操作行: 月送り / 今月 / サイトフィルタ / 凡例 ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {navBtn('‹', () => shiftMonth(-1))}
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', minWidth: '92px', textAlign: 'center' }}>
                {year}年{month + 1}月
              </span>
              {navBtn('›', () => shiftMonth(1))}
              <button onClick={goToday} disabled={isCurrentMonth}
                style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '7px', marginLeft: '2px',
                         border: '1px solid ' + (isCurrentMonth ? 'var(--border)' : 'var(--accent)'),
                         background: isCurrentMonth ? '#ffffff' : 'var(--accent-dim)',
                         color: isCurrentMonth ? 'var(--text-dimmer)' : 'var(--accent)',
                         cursor: isCurrentMonth ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                今月
              </button>
            </div>

            {siteOptions.length > 1 && (
              <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); setSelected(null); }}
                style={{ fontSize: '12px', padding: '5px 8px', borderRadius: '6px',
                         border: '1px solid ' + (siteFilter !== 'all' ? 'var(--accent)' : 'var(--border)'),
                         color: siteFilter !== 'all' ? 'var(--accent)' : 'var(--text-muted)',
                         background: '#ffffff', cursor: 'pointer' }}>
                <option value="all">すべてのサイト</option>
                {siteOptions.filter(s => s !== 'all').map(sid => {
                  const sm = getSiteMeta(sid);
                  return <option key={sid} value={sid}>{sm.shortName || sm.name || sid}</option>;
                })}
              </select>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {legend('#22c55e', '公開')}
              {legend('#f59e0b', '予約')}
              {legend('#a1a1aa', '下書き')}
              {legend(REWRITE_DOT, 'リライト')}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              カレンダーを読み込み中…
            </div>
          ) : (<>
            {/* ── 曜日ヘッダー ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, padding: '2px 0',
                                      color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--text-muted)' }}>
                  {w}
                </div>
              ))}
            </div>

            {/* ── 日付グリッド ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {cells.map((d, idx) => {
                if (d == null) return <div key={'e' + idx} style={{ background: 'var(--bg-base)', borderRadius: '8px', minHeight: '88px', opacity: 0.4 }} />;
                const key     = dkey(year, month, d);
                const dayEvs  = byDay[key] || [];
                const isToday = key === todayKey;
                const isSel   = key === selected;
                const wd      = idx % 7;
                return (
                  <div key={key}
                       onClick={() => dayEvs.length > 0 && setSelected(isSel ? null : key)}
                       style={{
                         minHeight: '88px', borderRadius: '8px', padding: '4px 5px 5px',
                         border: '1px solid ' + (isSel ? 'var(--accent)' : isToday ? '#bfdbfe' : 'var(--border)'),
                         background: isSel ? 'var(--accent-dim)' : '#ffffff',
                         cursor: dayEvs.length > 0 ? 'pointer' : 'default',
                         display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden',
                       }}>
                    {/* 日付番号 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: isToday ? 700 : 500,
                        width: 18, height: 18, borderRadius: '50%',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday ? '#2563eb' : 'transparent',
                        color: isToday ? '#ffffff' : wd === 0 ? '#dc2626' : wd === 6 ? '#2563eb' : 'var(--text-sub)',
                      }}>{d}</span>
                      {dayEvs.length > 0 && (
                        <span style={{ fontSize: '9px', color: 'var(--text-dimmer)', fontWeight: 600 }}>{dayEvs.length}</span>
                      )}
                    </div>
                    {/* イベントチップ */}
                    {dayEvs.slice(0, MAX_CHIPS).map((ev, i) => {
                      const es = eventStyle(ev);
                      const sm = getSiteMeta(ev.siteId);
                      return (
                        <div key={i} title={`[${sm.shortName || ev.siteId}] ${es.label}：${ev.title}`}
                             style={{ display: 'flex', alignItems: 'center', gap: '3px',
                                      fontSize: '10px', lineHeight: 1.25, minWidth: 0,
                                      background: ev.type === 'rewrite' ? '#f5f3ff' : sm.bg,
                                      borderLeft: '2px solid ' + (ev.type === 'rewrite' ? REWRITE_DOT : sm.color),
                                      borderRadius: '3px', padding: '1px 3px' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: es.dot, flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                         color: 'var(--text-sub)' }}>
                            {ev.type === 'rewrite' ? '🔄' : ''}{ev.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayEvs.length > MAX_CHIPS && (
                      <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 600, paddingLeft: '2px' }}>
                        +{dayEvs.length - MAX_CHIPS}件
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── 選択日の詳細 ── */}
            {selected && (byDay[selected]?.length > 0) && (() => {
              const [yy, mm, dd] = selected.split('-').map(Number);
              const wd = new Date(yy, mm - 1, dd).getDay();
              const list = byDay[selected];
              return (
                <div style={{ marginTop: '12px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                                background: '#fafafa', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {mm}月{dd}日（{WEEKDAYS[wd]}）
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{list.length}件</span>
                    <button onClick={() => setSelected(null)}
                      style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)',
                               background: 'none', border: 'none', cursor: 'pointer' }}>✕ 閉じる</button>
                  </div>
                  <div>
                    {list.map((ev, i) => {
                      const es = eventStyle(ev);
                      const sm = getSiteMeta(ev.siteId);
                      const link = ev.wpEditUrl || ev.wpUrl;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                                              borderBottom: i < list.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '12px' }}>
                          <span style={siteAvatarStyle(ev.siteId, 20)}>{sm.label}</span>
                          <span style={{ fontSize: '13px', flexShrink: 0 }}>{es.icon}</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 8px', borderRadius: '20px',
                                         flexShrink: 0, background: ev.type === 'rewrite' ? '#f5f3ff' : (COLUMN_STATUS[ev.status] || COLUMN_STATUS.draft).bg,
                                         color: es.color }}>
                            {es.label}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, color: 'var(--text-sub)',
                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.title}
                          </span>
                          {link && (
                            <a href={link} target="_blank" rel="noopener noreferrer"
                               style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', flexShrink: 0,
                                        padding: '2px 8px', borderRadius: '5px', background: 'var(--accent-dim)' }}>
                              {ev.wpEditUrl ? 'WP編集' : '記事を見る'}
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 当月にイベントが無い場合 */}
            {monthEvents.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                {year}年{month + 1}月の投稿・リライトはありません。
              </div>
            )}
          </>)}
        </div>
      )}
    </div>
  );
}
