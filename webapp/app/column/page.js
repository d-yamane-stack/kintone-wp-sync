'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSiteMeta, siteAvatarStyle } from '@/lib/siteMeta';

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

  // AI keyword recommendation state
  const [recommending, setRecommending] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState([]);
  const [recommendError, setRecommendError] = useState(null);

  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((d) => { if (d.success) setSites(d.sites); })
      .catch(() => {});
  }, []);

  const keywordList = keywords.split('\n').map((k) => k.trim()).filter(Boolean);

  // 文章（タイトル直指定）か単語キーワードかを判定
  // 15文字以上 or 文末句読点を含む → タイトルとして直接使用
  function isSentence(text) {
    if (!text) return false;
    if (/[。！？!?]/.test(text)) return true;
    return text.trim().length >= 15;
  }

  // AIキーワード提案
  async function handleRecommend() {
    setRecommending(true);
    setSuggestedKeywords([]);
    setRecommendError(null);
    try {
      const res = await fetch('/api/keywords/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, recentKeywords: keywordList }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.keywords)) {
        setSuggestedKeywords(data.keywords);
      } else {
        setRecommendError(data.error || '提案の取得に失敗しました');
      }
    } catch (err) {
      setRecommendError(err.message);
    } finally {
      setRecommending(false);
    }
  }

  // チップクリックでキーワードエリアに追加
  function addKeyword(kw) {
    setKeywords((prev) => {
      const lines = prev.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.includes(kw)) return prev; // 重複はスキップ
      return lines.length === 0 ? kw : prev.trimEnd() + '\n' + kw;
    });
    // 選択済みはチップから除去
    setSuggestedKeywords((prev) => prev.filter((k) => k !== kw));
  }

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
            type:        'column',
            siteId,
            keyword,
            directTitle: isSentence(keyword), // 文章ならタイトル直接使用
            audience:    '一般のお客様',
            tone:        '親しみやすく丁寧',
            cta:         '無料相談はこちら',
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
        setSuggestedKeywords([]);
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
      <form onSubmit={handleSubmit} className="rounded-lg p-6 space-y-5"
            style={{ background: 'var(--bg-card-solid)', border: '0.5px solid var(--border-mid)' }}>

        {sites.length > 0 && (
          <div>
            <label style={labelStyle}>サイト</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {sites.map((s) => {
                const sm = getSiteMeta(s.siteId);
                const isActive = siteId === s.siteId;
                return (
                  <button
                    key={s.siteId}
                    type="button"
                    onClick={() => { setSiteId(s.siteId); setSuggestedKeywords([]); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                      border: '1.5px solid ' + (isActive ? sm.color : 'var(--border)'),
                      background: isActive ? sm.bg : 'transparent',
                      color: isActive ? sm.color : 'var(--text-muted)',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: '13px',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span style={siteAvatarStyle(s.siteId, 24)}>{sm.label}</span>
                    {s.siteName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* AIキーワード提案エリア */}
        <div style={{ borderRadius: '8px', border: '0.5px solid var(--border)', padding: '12px 14px',
                      background: 'rgba(124,127,254,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-sub)' }}>
              ✨ AIキーワード提案
            </span>
            <button
              type="button"
              onClick={handleRecommend}
              disabled={recommending}
              style={{
                fontSize: '11px',
                padding: '4px 12px',
                borderRadius: '20px',
                border: '1px solid var(--accent)',
                background: recommending ? 'var(--accent-dim)' : 'transparent',
                color: recommending ? 'var(--text-muted)' : 'var(--accent)',
                cursor: recommending ? 'default' : 'pointer',
                fontWeight: 500,
              }}
            >
              {recommending ? '生成中...' : '提案を生成'}
            </button>
          </div>

          {recommendError && (
            <p style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px' }}>{recommendError}</p>
          )}

          {suggestedKeywords.length > 0 ? (
            <>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                クリックでキーワードに追加
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {suggestedKeywords.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => addKeyword(kw)}
                    style={{
                      fontSize: '11px',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-base)',
                      color: 'var(--text-sub)',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--accent-dim)';
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.color = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--bg-base)';
                      e.currentTarget.style.borderColor = 'var(--border-light)';
                      e.currentTarget.style.color = 'var(--text-sub)';
                    }}
                  >
                    + {kw}
                  </button>
                ))}
              </div>
            </>
          ) : !recommending && suggestedKeywords.length === 0 && !recommendError ? (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              季節・SEO・AIOを考慮したキーワードをAIが提案します。
            </p>
          ) : null}
        </div>

        <div>
          <label style={labelStyle}>
            キーワード / タイトル <span style={{ color: '#f87171' }}>*</span>
            <span style={{ fontWeight: 400, marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              1行に1件（複数可）
            </span>
          </label>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={'外壁塗装の費用\n知らないと損！屋根塗装の正しい時期とは\nサイディングのメンテナンス'}
            rows={5}
            style={inputStyle}
            required
          />
          {keywordList.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
              {keywordList.map((k) => isSentence(k)
                ? `「${k}」タイトル直接使用`
                : `「${k}」タイトル自動生成`
              ).join(' / ')}
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
