'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const inputStyle = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '14px',
  color: 'var(--text-main)',
  outline: 'none',
};

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: '500',
  color: 'var(--text-sub)',
  marginBottom: '6px',
};

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
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-main)' }}>施工事例取込</h1>

      <form onSubmit={handleSubmit} className="rounded-lg p-6 space-y-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {sites.length > 0 && (
          <div>
            <label style={labelStyle}>サイト</label>
            <select
              name="siteId"
              value={form.siteId}
              onChange={handleChange}
              style={inputStyle}
            >
              {sites.map((s) => (
                <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>取込件数</label>
          <select
            name="limit"
            value={form.limit}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="1">1件</option>
            <option value="3">3件</option>
            <option value="5">5件</option>
            <option value="10">10件</option>
          </select>
        </div>

        {result && (
          <div className="text-sm px-4 py-3 rounded"
               style={{
                 background: result.ok ? '#0e2e20' : '#2e1010',
                 color: result.ok ? '#4ade80' : '#f87171',
                 border: `1px solid ${result.ok ? '#14532d' : '#7f1d1d'}`,
               }}>
            {result.message}
            {result.ok && (
              <button type="button" onClick={() => router.push('/')}
                      className="ml-3 underline" style={{ color: '#4ade80' }}>
                ジョブ一覧を見る
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded py-2.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
          style={{
            background: submitting ? 'var(--accent-dim)' : 'var(--accent)',
            color: submitting ? 'var(--text-muted)' : '#fff',
            border: '1px solid var(--accent)',
          }}
        >
          {submitting ? '処理中...' : '施工事例を取り込む'}
        </button>
      </form>
    </div>
  );
}
