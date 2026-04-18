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
  resize: 'vertical',
};

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: '500',
  color: 'var(--text-sub)',
  marginBottom: '6px',
};

export default function ColumnPage() {
  const router = useRouter();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('jube');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((d) => { if (d.success) setSites(d.sites); })
      .catch(() => {});
  }, []);

  const keywordList = keywords.split('\n').map((k) => k.trim()).filter(Boolean);

  async function handleSubmit(e) {
    e.preventDefault();
    if (keywordList.length === 0) { alert('キーワードを入力してください'); return; }
    setSubmitting(true);
    setResult(null);
    try {
      let successCount = 0;
      let errorMsg = null;
      for (const keyword of keywordList) {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:     'column',
            siteId,
            keyword,
            audience: '一般のお客様',
            tone:     '親しみやすく丁寧',
            cta:      '無料相談はこちら',
          }),
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        } else {
          errorMsg = data.error || 'エラーが発生しました';
          break;
        }
      }
      if (successCount > 0) {
        setResult({ ok: true, message: `${successCount}件のコラム生成をキューに登録しました。` });
        setKeywords('');
      } else {
        setResult({ ok: false, message: errorMsg });
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-main)' }}>コラム生成</h1>

      <form onSubmit={handleSubmit} className="rounded-lg p-6 space-y-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {sites.length > 0 && (
          <div>
            <label style={labelStyle}>サイト</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              style={{ ...inputStyle, resize: 'none' }}
            >
              {sites.map((s) => (
                <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>
            キーワード <span style={{ color: '#f87171' }}>*</span>
            <span style={{ fontWeight: 400, marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              1行に1キーワード（複数可）
            </span>
          </label>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={'外壁塗装の費用\n屋根塗装の種類\nサイディングのメンテナンス'}
            rows={5}
            style={inputStyle}
            required
          />
          {keywordList.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
              {keywordList.length}件のキーワードを検出
            </p>
          )}
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
          disabled={submitting || keywordList.length === 0}
          className="w-full rounded py-2.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
          style={{
            background: submitting || keywordList.length === 0 ? 'var(--accent-dim)' : 'var(--accent)',
            color: submitting || keywordList.length === 0 ? 'var(--text-muted)' : '#fff',
            border: '1px solid var(--accent)',
          }}
        >
          {submitting
            ? '登録中...'
            : keywordList.length > 1
            ? `${keywordList.length}件をまとめてキューに登録`
            : 'コラムをキューに登録'}
        </button>
      </form>
    </div>
  );
}
