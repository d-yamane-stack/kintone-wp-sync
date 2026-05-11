'use client';

import { usePathname, useRouter } from 'next/navigation';
import HeaderStats from './HeaderStats';

const PAGE_TITLES = {
  '/':                 'ダッシュボード',
  '/case-study':       '施工事例取込',
  '/column':           'コラム生成',
  '/column-analysis':  'コラム分析 / リライト',
  '/seo':              'SEO順位/競合調査',
};

const PAGE_SUBTITLES = {
  '/case-study':       'Kintoneの施工事例レコードをWordPressに自動投稿します',
  '/column':           'AIがSEOに最適化されたコラム記事を自動生成します',
  '/column-analysis':  'GSCデータとAIでコラム記事を分析し、リライト候補・カテゴリギャップを特定します',
  '/seo':              '競合サイトとのSEO順位を定期的に比較・分析します',
};

export default function TopBar() {
  const pathname = usePathname();
  const router   = useRouter();
  const title    = PAGE_TITLES[pathname] || 'コンテンツ自動運用';
  const subtitle = PAGE_SUBTITLES[pathname] || null;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <div className="topbar-wrapper" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: subtitle ? '10px 28px' : '14px 28px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-sidebar)',
      flexShrink: 0,
      boxShadow: '0 1px 0 var(--border)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-main)',
          letterSpacing: '0.01em',
        }}>
          {title}
        </span>
        {subtitle && (
          <span style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            letterSpacing: '0.01em',
          }}>
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <HeaderStats />
        <button
          onClick={handleLogout}
          title="ログアウト"
          style={{
            fontSize: '11px', padding: '4px 10px', borderRadius: '8px',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)', background: 'transparent',
            cursor: 'pointer',
          }}
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
