'use client';

import { useEffect, useState } from 'react';

const STATUS_LABEL = {
  running: { label: '実行中', color: 'bg-blue-100 text-blue-700' },
  done:    { label: '完了',   color: 'bg-green-100 text-green-700' },
  error:   { label: '失敗',   color: 'bg-red-100 text-red-700' },
};

const JOB_TYPE_LABEL = {
  column:     'コラム生成',
  case_study: '施工事例取込',
};

export default function JobListPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);

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

  useEffect(() => { fetchJobs(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">ジョブ一覧</h1>
        <button
          onClick={fetchJobs}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100 text-gray-600"
        >
          更新
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">読み込み中...</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-500 text-sm">ジョブがありません。コラム生成や施工事例取込を実行してください。</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const s = STATUS_LABEL[job.status] || { label: job.status, color: 'bg-gray-100 text-gray-600' };
            return (
              <div key={job.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      <span className="text-xs text-gray-500">{JOB_TYPE_LABEL[job.jobType] || job.jobType}</span>
                      <span className="text-xs text-gray-400">{job.siteId}</span>
                    </div>
                    {job.meta?.keyword && (
                      <p className="text-sm font-medium text-gray-700 mb-1">キーワード: {job.meta.keyword}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      開始: {new Date(job.startedAt).toLocaleString('ja-JP')}
                      {job.finishedAt && ` / 完了: ${new Date(job.finishedAt).toLocaleString('ja-JP')}`}
                    </p>
                    {job.errorMessage && (
                      <p className="text-xs text-red-600 mt-1 truncate">{job.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">{job._count.contentItems}件</span>
                    {job.status === 'error' && (
                      <button
                        onClick={() => retryJob(job.id)}
                        disabled={retrying === job.id}
                        className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                      >
                        {retrying === job.id ? '...' : '再実行'}
                      </button>
                    )}
                  </div>
                </div>

                {job.contentItems.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3 space-y-1">
                    {job.contentItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 truncate flex-1 mr-2">
                          {item.generatedTitle || '（タイトル未生成）'}
                        </span>
                        {item.postResult?.wpEditUrl && (
                          <a
                            href={item.postResult.wpEditUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline shrink-0"
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
