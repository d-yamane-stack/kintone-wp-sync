'use client';

import { usePathname } from 'next/navigation';
import HeaderStats from './HeaderStats';

const PAGE_TITLES = {
  '/':           'ダッシュボード',
  '/case-study': '施工事例取込',
  '/column':     'コラム生成',
};

export default function TopBar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || 'コンテンツ自動運用';

  return (
    <div className="topbar-wrapper" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 28px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-sidebar)',
      flexShrink: 0,
      boxShadow: '0 1px 0 var(--border)',
    }}>
      <span style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-main)',
        letterSpacing: '0.01em',
      }}>
        {title}
      </span>
      <HeaderStats />
    </div>
  );
}
