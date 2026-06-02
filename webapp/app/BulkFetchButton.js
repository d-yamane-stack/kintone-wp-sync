'use client';

import { useState, useEffect, useRef } from 'react';
import { analysisStore } from '@/lib/analysisStore';
import { useAllAnalysisStates } from '@/lib/useAnalysisStore';

// コラム分析・SEOが設定済みの対象サイト
const TARGET_SITES = ['jube', 'nurube'];

// 各処理の目安所要時間（秒）。残り時間カウントダウンの推定に使用。
// WP同期・SEOは非同期ジョブ（ローカルworker処理／ETAベース）、コラム分析はブラウザ実行（実完了を検知）。
const ETA = { wp: 40, analysis: 300, seo: 300 };
const TOTAL_ETA = Math.max(ETA.wp, ETA.analysis, ETA.seo);

function mmss(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 全データ一括取得ボタン（ダッシュボード右上）
 * WP同期 / コラム分析(jube・nurube) / SEO順位取得(jube・nurube) をまとめて実行し、
 * ボタン中央に残り時間（推定カウントダウン）を表示する。
 */
export default function BulkFetchButton() {
  const states = useAllAnalysisStates();   // コラム分析の進捗を購読（再描画トリガ）
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [, setTick] = useState(0);            // カウントダウン用の強制再描画
  const startRef = useRef(0);

  const running = phase === 'running';

  // 実行中は0.5秒ごとに再描画して残り時間を更新
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = running ? (Date.now() - startRef.current) / 1000 : 0;
  const wpDone = elapsed >= ETA.wp;              // WP同期は非同期ジョブのためETAで完了とみなす
  const analysisDone = TARGET_SITES.every(s => {
    const st = states[s] ? states[s].status : null;
    return st === 'done' || st === 'error';
  });
  const seoDone = elapsed >= ETA.seo;            // SEOは非同期のためETAで完了とみなす
  const allDone = running && wpDone && analysisDone && seoDone;

  const remaining = running ? Math.max(
    wpDone        ? 0 : ETA.wp       - elapsed,
    analysisDone  ? 0 : ETA.analysis - elapsed,
    seoDone       ? 0 : ETA.seo      - elapsed,
  ) : 0;

  // 全処理完了 → 「完了」表示 → 5秒後にアイドルへ
  useEffect(() => {
    if (!allDone) return;
    setPhase('done');
    const t = setTimeout(() => setPhase('idle'), 5000);
    return () => clearTimeout(t);
  }, [allDone]);

  function start() {
    if (running) return;
    startRef.current = Date.now();
    setPhase('running');
    setTick(t => t + 1);

    // ① WP同期（sync_wp ジョブを登録 → ローカルworkerが処理）
    fetch('/api/jobs/sync-wp', { method: 'POST' }).catch(() => {});

    // ② SEO順位取得（jube・nurube / 非同期ジョブ登録）
    TARGET_SITES.forEach(s => {
      fetch('/api/seo/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: s, sendReport: true }),
      }).catch(() => {});
    });

    // ③ コラム分析（jube・nurube / ブラウザ実行・並行）
    TARGET_SITES.forEach(s => { analysisStore.runAnalysis(s); });
  }

  // 進捗バー（経過/推定総時間）
  const pct = phase === 'done' ? 100 : running ? Math.min(100, (elapsed / TOTAL_ETA) * 100) : 0;

  let centerText, sub, bg, fg, border;
  if (phase === 'done') {
    centerText = '✓ 取得完了';
    sub        = '最新データに更新しました';
    bg = '#16a34a'; fg = '#fff'; border = '#16a34a';
  } else if (running) {
    centerText = remaining > 0 ? `残り ${mmss(remaining)}` : 'まもなく完了';
    sub        = '取得中… WP同期・分析・SEO';
    bg = '#eef2ff'; fg = 'var(--accent)'; border = 'var(--accent)';
  } else {
    centerText = '🔄 全データ一括取得';
    sub        = 'WP同期・コラム分析・SEO順位';
    bg = 'var(--accent)'; fg = '#fff'; border = 'var(--accent)';
  }

  return (
    <button
      onClick={start}
      disabled={running}
      title="WP同期・コラム分析(jube/nurube)・SEO順位取得(jube/nurube) をまとめて実行します"
      style={{
        position: 'relative', overflow: 'hidden',
        width: '220px', minHeight: '56px', borderRadius: '12px',
        border: `1px solid ${border}`, background: bg, color: fg,
        cursor: running ? 'default' : 'pointer',
        boxShadow: 'var(--shadow-card)', padding: '8px 16px', textAlign: 'center',
        transition: 'background .2s',
      }}
    >
      {running && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
          background: 'rgba(99,102,241,0.18)', transition: 'width .5s linear',
        }} />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: running ? '19px' : '14px', fontWeight: 700, lineHeight: 1.2 }}>{centerText}</div>
        <div style={{ fontSize: '10px', fontWeight: 500, opacity: 0.85, marginTop: '3px' }}>{sub}</div>
      </div>
    </button>
  );
}
