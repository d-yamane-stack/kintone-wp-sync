'use client';

import { useEffect, useState } from 'react';

export default function HeaderStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => { if (d.success) setStats(d); })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div className="ml-auto flex items-center gap-4 text-xs"
         style={{ color: 'var(--text-muted)' }}>
      <span>{stats.month}</span>
      <span style={{ color: 'var(--text-sub)' }}>
        コラム <span style={{ color: 'var(--accent)' }}>{stats.columnJobs}</span>件
        ／施工事例 <span style={{ color: 'var(--accent)' }}>{stats.caseStudyItems}</span>件
      </span>
      <span className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
        概算 ≈ ¥{stats.estimatedJpy.toLocaleString()}
        <span className="ml-1" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
          (${stats.estimatedUsd})
        </span>
      </span>
    </div>
  );
}
