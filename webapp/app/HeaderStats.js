'use client';

import { useEffect, useState } from 'react';

const SERVICES = [
  {
    name: 'Claude API',
    note: 'Anthropic',
    paid: true,
    color: '#7c7ffe',
  },
  {
    name: 'Upstash Redis',
    note: '無料枠内',
    paid: false,
    color: '#4ade80',
  },
  {
    name: 'Supabase',
    note: '無料枠内',
    paid: false,
    color: '#4ade80',
  },
  {
    name: 'サーバー',
    note: 'localhost（自PC）',
    paid: false,
    color: '#4ade80',
  },
];

export default function HeaderStats() {
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => { if (d.success) setStats(d); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const columnCostJpy   = Math.ceil(stats.columnJobs * 0.07 * 150);
  const caseCostJpy     = Math.ceil(stats.caseStudyItems * 0.04 * 150);

  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
        style={{
          background: 'var(--accent-dim)',
          border: '1px solid var(--border-light)',
          color: 'var(--accent)',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{stats.month}</span>
        <span>概算 ≈ ¥{stats.estimatedJpy.toLocaleString()}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 rounded-lg z-50"
             style={{
               background: 'var(--bg-card)',
               border: '1px solid var(--border-light)',
               minWidth: '280px',
               boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
             }}>

          {/* Claude API 内訳 */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>
                Claude API（{stats.month}）
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '10px' }}>
                課金あり
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-sub)' }}>コラム生成</span>
                <span style={{ color: 'var(--text-muted)' }}>{stats.columnJobs}件 × ¥10.5</span>
                <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                  ¥{columnCostJpy.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-sub)' }}>施工事例取込</span>
                <span style={{ color: 'var(--text-muted)' }}>{stats.caseStudyItems}件 × ¥6</span>
                <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                  ¥{caseCostJpy.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2"
                 style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-sub)' }}>小計</span>
              <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>
                ¥{stats.estimatedJpy.toLocaleString()}
                <span className="ml-1 font-normal text-xs" style={{ color: 'var(--text-muted)' }}>
                  (${stats.estimatedUsd})
                </span>
              </span>
            </div>
          </div>

          {/* その他サービス */}
          <div className="px-4 pb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              その他サービス
            </p>
            <div className="rounded-lg overflow-hidden"
                 style={{ border: '1px solid var(--border)' }}>
              {SERVICES.slice(1).map((svc, i) => (
                <div key={svc.name}
                     className="flex items-center justify-between px-3 py-2 text-xs"
                     style={{
                       borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                       background: 'var(--bg-base)',
                     }}>
                  <span style={{ color: 'var(--text-sub)' }}>{svc.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{svc.note}</span>
                  <span className="font-medium" style={{ color: svc.color }}>¥0</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-3">
            <p style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: '1.6' }}>
              ※ Claude API は平均トークン数から試算した参考値です。<br />
              実際の請求は Anthropic ダッシュボードで確認してください。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
