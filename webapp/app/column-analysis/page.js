'use client';

import { useState, useEffect, useCallback } from 'react';
import { SITE_META, getSiteMeta } from '@/lib/siteMeta';

const SITES = Object.entries(SITE_META)
  .sort((a, b) => (a[1].order || 99) - (b[1].order || 99))
  .map(([siteId, meta]) => ({ siteId, name: meta.name, shortName: meta.shortName }));

const CATEGORY_COLORS = [
  '#2563eb','#7c3aed','#db2777','#dc2626','#d97706',
  '#16a34a','#0891b2','#4f46e5','#be185d','#c2410c',
  '#65a30d','#0284c7','#9d174d','#92400e','#1e3a5f',
];
function getCategoryColor(i) { return CATEGORY_COLORS[i % CATEGORY_COLORS.length]; }

function PriorityBadge({ priority }) {
  const hi = priority === 'high';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 600, flexShrink: 0,
      background: hi ? '#fef2f2' : '#fffbeb',
      color:      hi ? '#dc2626'  : '#d97706',
      border:     '1px solid ' + (hi ? '#fecaca' : '#fde68a'),
    }}>
      {hi ? '優先度高' : '優先度中'}
    </span>
  );
}

export default function ColumnAnalysisPage() {
  const [siteId, setSiteId]       = useState('jube');
  const [posts, setPosts]         = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [analysis, setAnalysis]   = useState(null);
  const [error, setError]         = useState('');
  const [activeTab, setActiveTab] = useState('categories');
  const [seoKeywords, setSeoKeywords] = useState([]);

  const siteMeta = getSiteMeta(siteId);

  // SEOキーワード取得
  useEffect(() => {
    fetch(`/api/seo/keywords?siteId=${siteId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setSeoKeywords(d.keywords || []); })
      .catch(() => {});
  }, [siteId]);

  // 記事取得（DBから）
  const fetchPosts = useCallback(async (sid) => {
    setPostsLoading(true);
    setError('');
    setPosts([]);
    setAnalysis(null);
    try {
      const res  = await fetch(`/api/column-analysis/posts?siteId=${sid}`);
      const data = await res.json();
      if (data.success) {
        setPosts(data.posts || []);
      } else {
        setError(data.error || '記事取得に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  // サイト変更時に自動取得
  useEffect(() => {
    fetchPosts(siteId);
  }, [siteId, fetchPosts]);

  // AI分析実行
  async function runAnalysis() {
    if (posts.length === 0) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const res  = await fetch('/api/column-analysis/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          siteId,
          posts:       posts.slice(0, 80),
          seoKeywords: seoKeywords.map(k => ({ keyword: k.keyword, position: k.position })),
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setAnalysis(data.result);
        setActiveTab('categories');
      } else {
        setError(data.error || 'AI分析に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  // カテゴリ集計
  const categoryStats = analysis ? (() => {
    const map = {};
    (analysis.articleCategories || []).forEach(a => {
      if (!map[a.category]) map[a.category] = { name: a.category, count: 0, articles: [] };
      map[a.category].count++;
      map[a.category].articles.push(a);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  })() : [];

  const totalArticles = analysis ? (analysis.articleCategories || []).length : 0;
  const maxCount      = categoryStats.length > 0 ? categoryStats[0].count : 1;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px' }}>
      {/* ページヘッダー */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
          コラム分析 / リライト
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-sub)', margin: '4px 0 0' }}>
          AIがコラム記事を自動分類し、リライト候補・カテゴリギャップを特定します
        </p>
      </div>

      {/* コントロールパネル */}
      <div style={{
        background: '#ffffff', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '14px 20px',
        marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      }}>
        {/* サイトタブ */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {SITES.map(s => {
            const sm  = getSiteMeta(s.siteId);
            const act = s.siteId === siteId;
            return (
              <button key={s.siteId}
                onClick={() => setSiteId(s.siteId)}
                style={{
                  padding: '6px 14px', borderRadius: '8px',
                  border:     act ? ('1.5px solid ' + sm.color) : '1.5px solid var(--border)',
                  background: act ? sm.bg : 'transparent',
                  color:      act ? sm.color : 'var(--text-sub)',
                  fontSize: '13px', fontWeight: act ? 700 : 500, cursor: 'pointer',
                }}
              >
                {s.shortName}
              </button>
            );
          })}
        </div>

        {/* 記事数バッジ */}
        {!postsLoading && posts.length > 0 && (
          <span style={{
            fontSize: '12px', color: 'var(--text-sub)',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            padding: '3px 10px', borderRadius: '99px',
          }}>
            {posts.length}件のコラム
          </span>
        )}
        {postsLoading && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>取得中…</span>
        )}

        <div style={{ flex: 1 }} />

        {/* 再取得ボタン */}
        <button onClick={() => fetchPosts(siteId)} disabled={postsLoading}
          style={{
            padding: '7px 14px', borderRadius: '8px',
            border: '1.5px solid var(--border)', background: 'transparent',
            color: 'var(--text-sub)', fontSize: '13px', fontWeight: 500,
            cursor: postsLoading ? 'default' : 'pointer',
          }}
        >
          🔄 再取得
        </button>

        {/* AI分析ボタン */}
        <button onClick={runAnalysis}
          disabled={loading || postsLoading || posts.length === 0}
          style={{
            padding: '8px 18px', borderRadius: '8px', border: 'none',
            background: (loading || postsLoading || posts.length === 0) ? 'var(--border)' : '#7c3aed',
            color:      (loading || postsLoading || posts.length === 0) ? 'var(--text-muted)' : '#ffffff',
            fontSize: '13px', fontWeight: 600,
            cursor: (loading || postsLoading || posts.length === 0) ? 'default' : 'pointer',
          }}
        >
          {loading ? '🤖 AI分析中…' : 'AI分析実行'}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '8px', padding: '10px 16px',
          color: '#dc2626', fontSize: '13px', marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {/* AI分析中 */}
      {loading && (
        <div style={{
          background: '#f5f3ff', border: '1px solid #ddd6fe',
          borderRadius: '10px', padding: '24px',
          marginBottom: '20px', textAlign: 'center', color: '#6d28d9',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🤖</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>AIがコラム記事を分析中…</div>
          <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>
            {posts.length}件の記事を分類しています（30〜60秒）
          </div>
        </div>
      )}

      {/* 記事あり・分析前 */}
      {!loading && posts.length > 0 && !analysis && !error && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: '10px', padding: '14px 18px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '13px', color: '#166534',
        }}>
          <span style={{ fontSize: '18px' }}>✅</span>
          <span><strong>{posts.length}件</strong>のコラム記事をDBから取得しました。「AI分析実行」で分析を開始できます。</span>
        </div>
      )}

      {/* 分析結果 */}
      {analysis && !loading && (
        <>
          {/* KPIカード */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px', marginBottom: '20px',
          }}>
            {[
              { label: '分析記事数',     value: totalArticles,                         unit: '件',  color: 'var(--text-main)' },
              { label: 'カテゴリ数',     value: categoryStats.length,                  unit: '種類', color: '#7c3aed' },
              { label: 'リライト候補',   value: (analysis.rewriteCandidates || []).length, unit: '件',  color: '#dc2626' },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: '#ffffff', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '14px 18px',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '4px' }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: kpi.color }}>
                  {kpi.value}
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)', marginLeft: '4px' }}>{kpi.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* タブ */}
          <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'categories', label: '📊 カテゴリ分析' },
              { key: 'rewrite',    label: `✏️ リライト候補（${(analysis.rewriteCandidates || []).length}件）` },
              { key: 'gaps',       label: '💡 カテゴリギャップ' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px', border: 'none', background: 'transparent',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  color:     activeTab === tab.key ? 'var(--accent)' : 'var(--text-sub)',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: '-1px', borderRadius: 0,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ===== カテゴリ分析 ===== */}
          {activeTab === 'categories' && (
            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>カテゴリ別記事分布</div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>AIが各記事のメインカテゴリを自動判定</div>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {categoryStats.map((cat, i) => {
                  const pct   = Math.round((cat.count / totalArticles) * 100);
                  const color = getCategoryColor(i);
                  return (
                    <div key={cat.name} style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', flex: 1 }}>{cat.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-sub)', fontWeight: 500 }}>{cat.count}件 ({pct}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--bg-base)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '99px', background: color,
                          width: (cat.count / maxCount * 100) + '%', transition: 'width 0.5s ease',
                        }} />
                      </div>
                      {/* 記事サンプル */}
                      <div style={{ marginTop: '4px', paddingLeft: '18px' }}>
                        {cat.articles.slice(0, 3).map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>›</span>
                            {a.url ? (
                              <a href={a.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: '11px', color: 'var(--text-sub)', textDecoration: 'none' }}
                                onMouseEnter={e => e.target.style.textDecoration='underline'}
                                onMouseLeave={e => e.target.style.textDecoration='none'}
                              >
                                {a.title}
                              </a>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>{a.title}</span>
                            )}
                          </div>
                        ))}
                        {cat.articles.length > 3 && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '12px' }}>
                            他{cat.articles.length - 3}件…
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== リライト候補 ===== */}
          {activeTab === 'rewrite' && (
            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>リライト優先候補</div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                  内容が古い・薄い・SEOキーワードとのズレが大きい記事
                </div>
              </div>
              <div style={{ padding: '4px 0' }}>
                {(analysis.rewriteCandidates || []).length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-sub)', fontSize: '13px' }}>
                    リライト候補はありません
                  </div>
                ) : (
                  (analysis.rewriteCandidates || []).map((item, i) => (
                    <div key={item.id || i} style={{
                      padding: '12px 20px',
                      borderBottom: i < (analysis.rewriteCandidates.length - 1) ? '1px solid var(--border)' : 'none',
                      display: 'flex', alignItems: 'flex-start', gap: '12px',
                    }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                        background: item.priority === 'high' ? '#fef2f2' : '#fffbeb',
                        border: '1px solid ' + (item.priority === 'high' ? '#fecaca' : '#fde68a'),
                        color: item.priority === 'high' ? '#dc2626' : '#d97706',
                        fontSize: '11px', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px',
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', textDecoration: 'none', flex: 1 }}
                              onMouseEnter={e => e.target.style.color='var(--accent)'}
                              onMouseLeave={e => e.target.style.color='var(--text-main)'}
                            >
                              {item.title}
                            </a>
                          ) : (
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', flex: 1 }}>{item.title}</span>
                          )}
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>{item.reason}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ===== カテゴリギャップ ===== */}
          {activeTab === 'gaps' && (
            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>不足カテゴリ・コンテンツギャップ</div>
                <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>
                  AIが特定した「このサイトに足りないコンテンツ領域」
                </div>
              </div>
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(analysis.categoryGaps || []).length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-sub)', fontSize: '13px' }}>
                    ギャップデータがありません
                  </div>
                ) : (
                  (analysis.categoryGaps || []).map((gap, i) => (
                    <div key={i} style={{
                      background: '#fafafa', border: '1px solid var(--border)',
                      borderRadius: '8px', padding: '12px 16px',
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                    }}>
                      <div style={{
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        borderRadius: '6px', padding: '4px 10px',
                        fontSize: '12px', fontWeight: 700, color: '#16a34a',
                        flexShrink: 0, marginTop: '1px', whiteSpace: 'nowrap',
                      }}>
                        💡 {gap.category}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
                        {gap.reason}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {(analysis.categoryGaps || []).length > 0 && (
                <div style={{
                  padding: '14px 20px', borderTop: '1px solid var(--border)',
                  background: '#fafafa', display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-sub)', flex: 1 }}>
                    上記のギャップカテゴリに対するコラムを生成しますか？
                  </span>
                  <a href="/column" style={{
                    padding: '7px 14px', borderRadius: '8px',
                    background: 'var(--accent)', color: '#ffffff',
                    fontSize: '12px', fontWeight: 600, textDecoration: 'none',
                  }}>
                    コラム生成へ →
                  </a>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 初期状態（記事なし） */}
      {!postsLoading && posts.length === 0 && !error && (
        <div style={{
          background: '#ffffff', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📝</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
            コラム記事がありません
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '16px' }}>
            「コラム生成」でコラムを作成すると、ここで分析できます。
          </div>
          <a href="/column" style={{
            padding: '8px 18px', borderRadius: '8px',
            background: 'var(--accent)', color: '#ffffff',
            fontSize: '13px', fontWeight: 600, textDecoration: 'none', display: 'inline-block',
          }}>
            コラム生成へ →
          </a>
        </div>
      )}
    </div>
  );
}
