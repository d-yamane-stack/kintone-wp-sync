'use client';

import { useEffect, useState } from 'react';

const BUDGET_USD = 5.00; // 課金上限

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

  const columnCostJpy      = Math.ceil(stats.columnJobs * 0.01 * 150);
  const caseCostJpy        = Math.ceil(stats.caseStudyItems * 0.04 * 150);
  const pdfCostJpy         = Math.ceil((stats.pdfCount || 0) * 0.005 * 150);
  const analyzeCostJpy     = Math.ceil((stats.analyzeCount || 0) * 0.015 * 150);
  const rewriteCostJpy     = Math.ceil((stats.rewriteCount || 0) * 0.003 * 150);
  const rewriteExecCostJpy = Math.ceil((stats.rewriteExecCount || 0) * 0.008 * 150);

  const usedUsd      = parseFloat(stats.estimatedUsd) || 0;
  const remainingUsd = Math.max(0, BUDGET_USD - usedUsd);
  const usedPct      = Math.min(100, (usedUsd / BUDGET_USD) * 100);
  const barColor     = usedPct >= 90 ? '#ef4444' : usedPct >= 70 ? '#f59e0b' : '#22c55e';

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
        <div className="absolute right-0 top-full mt-2 rounded-xl z-50"
             style={{
               background: '#ffffff',
               border: '1px solid var(--border)',
               minWidth: '300px',
               boxShadow: 'var(--shadow-popup)',
             }}>

          {/* ── 残高バー ── */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                Claude API 残高
              </span>
              <span className="text-xs font-bold" style={{ color: remainingUsd < 0.5 ? '#ef4444' : 'var(--text-main)' }}>
                残り ${remainingUsd.toFixed(2)}
                <span className="font-normal" style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>
                  / ${BUDGET_USD.toFixed(2)}
                </span>
              </span>
            </div>
            <div style={{ background: 'var(--border)', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
              <div style={{
                width: usedPct + '%',
                height: '100%',
                background: barColor,
                borderRadius: '99px',
                transition: 'width 0.4s',
              }} />
            </div>
            <div className="flex justify-between mt-1" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              <span>使用 ${usedUsd.toFixed(2)}</span>
              <span>{usedPct.toFixed(1)}%</span>
            </div>
          </div>

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
                <span style={{ color: 'var(--text-sub)' }}>✍️ コラム生成</span>
                <span style={{ color: 'var(--text-muted)' }}>{stats.columnJobs}件 × ¥2</span>
                <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                  ¥{columnCostJpy.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-sub)' }}>🏗️ 施工事例取込</span>
                <span style={{ color: 'var(--text-muted)' }}>{stats.caseStudyItems}件 × ¥6</span>
                <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                  ¥{caseCostJpy.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-sub)' }}>📄 PDFレポート</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {stats.pdfCount > 0 ? `${stats.pdfCount}件 × ¥0.75` : '未生成'}
                </span>
                <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                  {stats.pdfCount > 0 ? `¥${pdfCostJpy.toLocaleString()}` : '¥0'}
                </span>
              </div>
              {/* コラム分析AI（実績があれば表示） */}
              {(stats.analyzeCount > 0 || stats.rewriteCount > 0 || stats.rewriteExecCount > 0) && (
                <>
                  {stats.analyzeCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-sub)' }}>🔬 コラム分析</span>
                      <span style={{ color: 'var(--text-muted)' }}>{stats.analyzeCount}回 × ¥2.25</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                        ¥{analyzeCostJpy.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {stats.rewriteCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-sub)' }}>📝 リライト提案</span>
                      <span style={{ color: 'var(--text-muted)' }}>{stats.rewriteCount}回 × ¥0.45</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                        ¥{rewriteCostJpy.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {stats.rewriteExecCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-sub)' }}>✏️ リライト実行</span>
                      <span style={{ color: 'var(--text-muted)' }}>{stats.rewriteExecCount}回 × ¥1.2</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)', minWidth: '48px', textAlign: 'right' }}>
                        ¥{rewriteExecCostJpy.toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              )}
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

          {/* SEO順位調査 */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>
                SEO順位調査（{stats.month}）
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: '#f0fdf4', color: '#15803d', fontSize: '10px', border: '1px solid #bbf7d0' }}>
                無料枠
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-sub)' }}>🔍 Serper.dev（競合）</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {stats.serperCount}/{stats.serperFreeLimit}件
                </span>
                <span className="font-medium" style={{ color: '#15803d' }}>¥0</span>
              </div>
              {/* Serper使用率バー */}
              {stats.serperCount > 0 && (
                <div style={{ background: 'var(--border)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: Math.min(100, (stats.serperCount / stats.serperFreeLimit) * 100) + '%',
                    height: '100%',
                    background: stats.serperCount / stats.serperFreeLimit > 0.8 ? '#ef4444' : '#22c55e',
                    borderRadius: '4px',
                    transition: 'width 0.3s',
                  }} />
                </div>
              )}
            </div>
          </div>

          {/* その他サービス */}
          <div className="px-4 pb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              その他サービス
            </p>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {[
                { name: 'Supabase', note: '無料枠内' },
                { name: 'Google APIs', note: 'GSC / GA4（無料）' },
                { name: 'サーバー', note: 'localhost（自PC）' },
              ].map((svc, i) => (
                <div key={svc.name}
                     className="flex items-center justify-between px-3 py-2 text-xs"
                     style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: '#fafafa' }}>
                  <span style={{ color: 'var(--text-sub)' }}>{svc.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{svc.note}</span>
                  <span className="font-medium" style={{ color: '#15803d' }}>¥0</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-3">
            <p style={{ color: 'var(--text-muted)', fontSize: '10px', lineHeight: '1.6' }}>
              ※ Claude API は平均トークン数から試算した参考値です。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
