'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SITE_META, getSiteMeta, siteAvatarStyle } from '@/lib/siteMeta';

const SITES_LOCAL = Object.entries(SITE_META)
  .sort((a, b) => (a[1].order || 99) - (b[1].order || 99))
  .map(([siteId, meta]) => ({ siteId, siteName: meta.name }));

const WP_STATUS = {
  publish: { label: '公開済み',  bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  future:  { label: '投稿予約',  bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  draft:   { label: '下書き',    bg: '#f4f4f5', color: '#71717a', border: '#e4e4e7' },
  trash:   { label: 'ゴミ箱',   bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
};

// ゴミ箱・ステータス不明は非表示対象
const HIDDEN_STATUSES = new Set(['trash', 'wp_deleted']);

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
  const [sites] = useState(SITES_LOCAL);
  const [siteId, setSiteId] = useState('jube');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // AI keyword recommendation state
  const [recommending, setRecommending] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState([]);
  const [recommendError, setRecommendError] = useState(null);

  // 生成済みコラム一覧（右パネル）
  const [columnHistory, setColumnHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  // URLパラメータから初期キーワード・サイトを反映
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const kw  = params.get('keyword');
    const sid = params.get('siteId');
    if (kw)  setKeywords(prev => (prev ? prev : kw));
    if (sid && SITE_META[sid]) setSiteId(sid);
  }, []);

  // サイト切替時にコラム履歴を取得
  const fetchHistory = useCallback(async (sid) => {
    setHistoryLoading(true);
    try {
      const res  = await fetch('/api/jobs', { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) return;
      // columnタイプ & 該当サイトのジョブを収集
      const items = [];
      (data.jobs || [])
        .filter(j => j.jobType === 'column' && j.siteId === sid)
        .forEach(j => {
          (j.contentItems || []).forEach(item => {
            items.push({
              jobId:        j.id,
              keyword:      j.meta?.keyword || '',
              title:        item.generatedTitle || '',
              status:       item.postResult?.postStatus || null,
              // 公開日: 公開済み・予約のみ wpPublishedAt が入っている。未公開は null
              publishedAt:  item.postResult?.wpPublishedAt || null,
              // ソート用: 公開日が無ければジョブ作成日時を使う（並び順を安定させるため）
              sortAt:       item.postResult?.wpPublishedAt || j.finishedAt || j.startedAt,
              wpEditUrl:    item.postResult?.wpEditUrl || null,
              jobStatus:    j.status,
              errorMsg:     item.errorMessage || j.errorMessage || null,
            });
          });
          // contentItemsが空でもジョブ自体を表示（実行中など）
          if ((j.contentItems || []).length === 0) {
            items.push({
              jobId:       j.id,
              keyword:     j.meta?.keyword || '',
              title:       '',
              status:      null,
              publishedAt: null,
              sortAt:      j.startedAt,
              wpEditUrl:   null,
              jobStatus:   j.status,
              errorMsg:    j.errorMessage || null,
            });
          }
        });
      // WP削除済み・表示不要な記事を除外
      const completedJobStatuses = new Set(['success', 'done', 'done_with_errors']);
      const visibleItems = items.filter(it => {
        // ゴミ箱・削除済みステータスは非表示
        if (HIDDEN_STATUSES.has(it.status)) return false;
        // 表示可能なステータスがあれば表示
        if (it.status) return true;
        // ステータス無し + 実行中/エラーのジョブは表示（処理中を見せる）
        if (!completedJobStatuses.has(it.jobStatus)) return true;
        // ステータス無し + 完了済み = WP未投稿 or 削除済み → 非表示
        return false;
      });
      // ソート（新しい順）: sortAt（公開日 or ジョブ作成日）で安定的に並べる
      visibleItems.sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
      setColumnHistory(visibleItems);
    } catch {}
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    fetchHistory(siteId);
  }, [siteId, fetchHistory]);

  // WPステータス同期（ダッシュボードと同じ /api/jobs/sync-wp を呼ぶ）
  async function handleSyncWp() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch('/api/jobs/sync-wp', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // 詳細メッセージを組み立て
        const parts = [];
        if (data.updated        > 0) parts.push(`✅ ${data.updated}件更新`);
        if (data.errors         > 0) parts.push(`❌ エラー${data.errors}件`);
        if (data.skippedNoId    > 0) parts.push(`⚠ WP投稿未完了${data.skippedNoId}件`);
        if (data.skippedNotFound > 0) parts.push(`ℹ 公開リスト未掲載${data.skippedNotFound}件`);
        const msg = parts.length > 0 ? parts.join(' / ') : '変更なし';
        setSyncMsg(msg + (data.errorDetails?.length > 0 ? `（${data.errorDetails[0]}）` : ''));
        if (data.updated > 0 || data.errors > 0) fetchHistory(siteId);
      } else {
        setSyncMsg('同期エラー: ' + (data.error || '不明'));
      }
    } catch (e) {
      setSyncMsg('同期エラー: ' + e.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 8000); // 詳細表示のため少し長めに
    }
  }

  const keywordList = keywords.split('\n').map((k) => k.trim()).filter(Boolean);

  function isSentence(text) {
    if (!text) return false;
    if (/[。！？!?]/.test(text)) return true;
    return text.trim().length >= 15;
  }

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

  function addKeyword(kw) {
    setKeywords((prev) => {
      const lines = prev.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.includes(kw)) return prev;
      return lines.length === 0 ? kw : prev.trimEnd() + '\n' + kw;
    });
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
            directTitle: isSentence(keyword),
            audience:    '一般のお客様',
            tone:        '親しみやすく丁寧',
            cta:         '無料相談はこちら',
          }),
        });
        const data = await res.json();
        if (data.success) { successCount++; }
        else { errorMsg = data.error || 'エラーが発生しました'; break; }
      }
      if (successCount > 0) {
        setResult({ ok: true, message: `${successCount}件のコラム生成をキューに登録しました。` });
        setKeywords('');
        setSuggestedKeywords([]);
        // 履歴を再取得
        setTimeout(() => fetchHistory(siteId), 1500);
      } else {
        setResult({ ok: false, message: errorMsg });
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const sm = getSiteMeta(siteId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '20px', alignItems: 'start', maxWidth: '1100px' }}>

      {/* ── 左：入力フォーム ── */}
      <form onSubmit={handleSubmit} className="rounded-xl p-6 space-y-5"
            style={{ background: '#ffffff', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>

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

        {/* AIキーワード提案 */}
        <div style={{ borderRadius: '8px', border: '0.5px solid var(--border)', padding: '12px 14px',
                      background: 'rgba(124,127,254,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-sub)' }}>✨ AIキーワード提案</span>
            <button type="button" onClick={handleRecommend} disabled={recommending}
              style={{
                fontSize: '11px', padding: '4px 12px', borderRadius: '20px',
                border: '1px solid var(--accent)',
                background: recommending ? 'var(--accent-dim)' : 'transparent',
                color: recommending ? 'var(--text-muted)' : 'var(--accent)',
                cursor: recommending ? 'default' : 'pointer', fontWeight: 500,
              }}>
              {recommending ? '生成中...' : '提案を生成'}
            </button>
          </div>
          {recommendError && <p style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px' }}>{recommendError}</p>}
          {suggestedKeywords.length > 0 ? (
            <>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>クリックでキーワードに追加</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {suggestedKeywords.map((kw) => (
                  <button key={kw} type="button" onClick={() => addKeyword(kw)}
                    style={{
                      fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
                      border: '1px solid var(--border-light)', background: 'var(--bg-base)',
                      color: 'var(--text-sub)', cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-dim)'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-base)'; e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-sub)'; }}
                  >+ {kw}</button>
                ))}
              </div>
            </>
          ) : !recommending && !recommendError ? (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>季節・SEO・AIOを考慮したキーワードをAIが提案します。</p>
          ) : null}
        </div>

        <div>
          <label style={labelStyle}>
            キーワード / タイトル <span style={{ color: '#f87171' }}>*</span>
            <span style={{ fontWeight: 400, marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>1行に1件（複数可）</span>
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
              {keywordList.map((k) => isSentence(k) ? `「${k}」タイトル直接使用` : `「${k}」タイトル自動生成`).join(' / ')}
            </p>
          )}
        </div>

        {result && (
          <div className="text-sm px-4 py-3 rounded"
               style={{ background: result.ok ? '#f0fdf4' : '#fef2f2', color: result.ok ? '#15803d' : '#dc2626', border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}` }}>
            {result.message}
            {result.ok && (
              <button type="button" onClick={() => router.push('/')} className="ml-3 underline" style={{ color: '#15803d' }}>
                ジョブ一覧を見る
              </button>
            )}
          </div>
        )}

        <button type="submit" disabled={submitting || keywordList.length === 0}
          className="w-full rounded py-2.5 text-sm font-semibold tracking-wide disabled:cursor-not-allowed"
          style={{
            background: submitting || keywordList.length === 0 ? 'var(--accent-dim)' : 'var(--accent)',
            color: submitting || keywordList.length === 0 ? 'var(--text-muted)' : '#fff',
            border: '1px solid var(--accent)',
          }}>
          {submitting ? '登録中...' : keywordList.length > 1 ? `${keywordList.length}件をまとめてキューに登録` : 'コラムをキューに登録'}
        </button>
      </form>

      {/* ── 右：生成済みコラム一覧 ── */}
      <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>

        {/* ヘッダー */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: '#fafafa' }}>
          <span style={siteAvatarStyle(siteId, 20)}>{sm.label}</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>生成済みコラム一覧</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>このシステムで生成したコラム（{sm.name}）</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {syncMsg && (
              <span style={{
                fontSize: '11px',
                color: syncMsg.includes('エラー') || syncMsg.includes('❌') ? '#dc2626'
                     : syncMsg.includes('⚠')  ? '#b45309'
                     : '#15803d',
                whiteSpace: 'nowrap',
                maxWidth: '300px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }} title={syncMsg}>
                {syncMsg}
              </span>
            )}
            <button
              onClick={handleSyncWp}
              disabled={syncing}
              title="WordPressの現在のステータスをDBに反映"
              style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: syncing ? 'var(--text-muted)' : 'var(--accent)', cursor: syncing ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
            >
              {syncing ? '同期中…' : 'WP同期'}
            </button>
          </div>
        </div>

        {/* リスト */}
        <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {historyLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>読み込み中…</div>
          ) : columnHistory.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              まだコラムが生成されていません
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                  {['公開日', 'タイトル', 'キーワード', 'ステータス'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columnHistory.map((item, i) => {
                  const st = WP_STATUS[item.status];
                  const isRunning = item.jobStatus === 'running';
                  const isError   = item.jobStatus === 'error' && !item.status;
                  const dateStr = item.publishedAt
                    ? new Date(item.publishedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
                    : '−';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      {/* 投稿日 */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '11px' }}>
                        {dateStr}
                      </td>
                      {/* タイトル */}
                      <td style={{ padding: '10px 14px', maxWidth: '260px' }}>
                        {item.wpEditUrl ? (
                          <a href={item.wpEditUrl} target="_blank" rel="noopener noreferrer"
                             style={{ color: 'var(--text-main)', textDecoration: 'none', fontWeight: 500, lineHeight: 1.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                             title={item.title || item.keyword}
                             onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                             onMouseLeave={e => e.currentTarget.style.color = 'var(--text-main)'}
                          >
                            {item.title || item.keyword || '（生成中）'}
                          </a>
                        ) : (
                          <span style={{ color: isRunning ? '#2563eb' : isError ? '#dc2626' : 'var(--text-sub)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                                title={item.title || item.keyword}>
                            {item.title || item.keyword || '（タイトル未生成）'}
                          </span>
                        )}
                      </td>
                      {/* キーワード */}
                      <td style={{ padding: '10px 14px', maxWidth: '160px' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-sub)', fontSize: '11px' }}
                              title={item.keyword}>
                          {item.keyword || '−'}
                        </span>
                      </td>
                      {/* ステータス */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {isRunning ? (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>⏳ 生成中</span>
                        ) : isError ? (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} title={item.errorMsg || ''}>✗ エラー</span>
                        ) : st ? (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>−</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
