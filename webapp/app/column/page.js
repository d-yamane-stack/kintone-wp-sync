'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ColumnPage() {
  const router = useRouter();
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState({
    siteId:   'jube',
    keyword:  '',
    audience: '一般のお客様',
    tone:     '親しみやすく丁寧',
    cta:      '無料相談はこちら',
  });
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
    if (!form.keyword.trim()) { alert('キーワードを入力してください'); return; }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'column', ...form }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ ok: true, message: 'ジョブを登録しました。ジョブ一覧で進捗を確認できます。' });
        setForm((prev) => ({ ...prev, keyword: '' }));
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
      <h1 className="text-xl font-bold text-gray-800 mb-6">コラム生成</h1>

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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            キーワード <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="keyword"
            value={form.keyword}
            onChange={handleChange}
            placeholder="例: 外壁塗装の費用"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">想定読者</label>
          <input
            type="text"
            name="audience"
            value={form.audience}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">文体・トーン</label>
          <input
            type="text"
            name="tone"
            value={form.tone}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CTA文言</label>
          <input
            type="text"
            name="cta"
            value={form.cta}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
          {submitting ? '生成中...' : 'コラムを生成する'}
        </button>
      </form>
    </div>
  );
}
