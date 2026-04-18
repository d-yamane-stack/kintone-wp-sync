'use client';

import { useEffect, useState } from 'react';

const STATUS = {
  running: { label: '実行中', bg: '#1a2d4a', color: '#7ab8f5' },
  done:    { label: '完了',   bg: '#0e2e20', color: '#4ade80' },
  error:   { label: '失敗',   bg: '#2e1010', color: '#f87171' },
};

const JOB_TYPE_LABEL = {
  column:     'コラム生成',
  case_study: '施工事例取込',
};

export default function JobListPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (data.success) setJobs(data.jobs);
    } finally {
      setLoading(false);
    }
  }

  async function retryJob(jobId) {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('再実行をキューに登録しました');
        fetchJobs();
      } else {
        alert('エラー: ' + data.error);
      }
    } finally {
      setRetrying(null);
    }
  }

  async function deleteJob(jobId) {
    setDeleting(jobId);
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => { fetchJobs(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>ジョブ一覧</h1>
        <button
          onClick={fetchJobs}
          className="text-sm px-3 py-1.5 rounded"
          style={{
            border: '1px solid var(--border-light)',
            color: 'var(--text-sub)',
            background: 'var(--bg-card)',
          }}
        >
          更新
        </button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>読み込み中...</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ジョブがありません。コラム生成や施工事例取込を実行してください。
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const s = STATUS[job.status] || { label: job.status, bg: '#1e1e30', color: '#94a3b8' };
            return (
              <div key={job.id} className="rounded-lg p-4"
                   style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
                        {JOB_TYPE_LABEL[job.jobType] || job.jobType}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{job.siteId}</span>
                    </div>
                    {job.meta?.keyword && (
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-main)' }}>
                        {job.meta.keyword}
                      </p>
                    )}
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      開始: {new Date(job.startedAt).toLocaleString('ja-JP')}
                      {job.finishedAt && ` / 完了: ${new Date(job.finishedAt).toLocaleString('ja-JP')}`}
                    </p>
                    {job.errorMessage && (
                      <p className="text-xs mt-1 truncate" style={{ color: '#f87171' }}>{job.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium"
                          style={{ color: 'var(--text-muted)', background: 'var(--bg-base)',
                                   padding: '2px 8px', borderRadius: '12px',
                                   border: '1px solid var(--border)' }}>
                      {job._count.contentItems}件
                    </span>
                    {job.status === 'error' && (
                      <button
                        onClick={() => retryJob(job.id)}
                        disabled={retrying === job.id}
                        className="text-xs px-3 py-1 rounded font-medium disabled:opacity-50"
                        style={{ background: '#3b2506', color: '#fbbf24', border: '1px solid #78350f' }}
                      >
                        {retrying === job.id ? '...' : '再実行'}
                      </button>
                    )}
                    <button
                      onClick={() => deleteJob(job.id)}
                      disabled={deleting === job.id}
                      className="text-xs px-2 py-1 rounded disabled:opacity-50"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      title="削除"
                    >
                      {deleting === job.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>

                {job.contentItems.length > 0 && (
                  <div className="mt-3 pt-3 space-y-1.5"
                       style={{ borderTop: '1px solid var(--border)' }}>
                    {job.contentItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1 mr-2" style={{ color: 'var(--text-sub)' }}>
                          {item.generatedTitle || '（タイトル未生成）'}
                        </span>
                        {item.postResult?.wpEditUrl && (
                          <a
                            href={item.postResult.wpEditUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 font-medium px-2 py-0.5 rounded"
                            style={{ color: 'var(--accent)', background: 'var(--accent-dim)',
                                     border: '1px solid var(--border-light)' }}
                          >
                            WP編集
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
