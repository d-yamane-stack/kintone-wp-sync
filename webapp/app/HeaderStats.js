'use client';

import { useEffect, useState } from 'react';

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

  const columnCost  = (stats.columnJobs * 0.07 * 150).toFixed(0);
  const caseCost    = (stats.caseStudyItems * 0.04 * 150).toFixed(0);

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
        <div className="absolute right-0 top-full mt-2 rounded-lg p-4 text-xs z-50"
             style={{
               background: 'var(--bg-card)',
               border: '1px solid var(--border-light)',
               minWidth: '240px',
               boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
             }}>
          <p className="font-semibold mb-3" style={{ color: 'var(--text-main)', fontSize: '13px' }}>
            {stats.month} コスト内訳
          </p>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-sub)' }}>コラム生成</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {stats.columnJobs}件 × ¥10.5
              </span>
              <span className="font-medium" style={{ color: 'var(--text-main)' }}>
                ¥{Number(columnCost).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-sub)' }}>施工事例取込</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {stats.caseStudyItems}件 × ¥6
              </span>
              <span className="font-medium" style={{ color: 'var(--text-main)' }}>
                ¥{Number(caseCost).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 flex justify-between items-center"
               style={{ borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-sub)' }}>合計（概算）</span>
            <span className="font-bold" style={{ color: 'var(--accent)', fontSize: '14px' }}>
              ¥{stats.estimatedJpy.toLocaleString()}
              <span className="ml-1" style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 400 }}>
                (${stats.estimatedUsd})
              </span>
            </span>
          </div>

          <p className="mt-3" style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: '1.5' }}>
            ※ Claude Sonnet 平均トークン数から試算した参考値。<br />
            実際の請求は Anthropic ダッシュボードで確認してください。
          </p>
        </div>
      )}
    </div>
  );
}
