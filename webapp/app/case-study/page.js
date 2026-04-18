'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CaseStudyPage() {
  const router = useRouter();
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState({ siteId: 'jube', limit: '3' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((d) => { if (d.success) setSites(d.sites); })
      .catch(() => {});
  }, []);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'case_study',
          siteId: form.siteId,
          limit: parseInt(form.limit, 10),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ ok: true, message: `${form.limit}件の施工事例取込をキューに登録しました。` });
      } else {
        setResult({ ok: false, message: data.error || 'エラーが発生しました' });
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-gray-800 mb-6">施工事例取込</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">

        {sites.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">サイト</label>
            <select
              name="siteId"
              value={form.siteId}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sites.map((s) => (
                <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">取込件数</label>
          <select
            name="limit"
            value={form.limit}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1">1件</option>
            <option value="3">3件</option>
            <option value="5">5件</option>
            <option value="10">10件</option>
          </select>
        </div>

        {result && (
          <div className={`text-sm px-4 py-3 rounded ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.message}
            {result.ok && (
              <button
                type="button"
                onClick={() => router.push('/')}
                className="ml-3 underline"
              >
                ジョブ一覧を見る
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? '処理中...' : '施工事例を取り込む'}
        </button>
      </form>
    </div>
  );
}
