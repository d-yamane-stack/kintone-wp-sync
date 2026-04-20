'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',           label: 'ダッシュボード', icon: '▣' },
  { href: '/case-study', label: '施工事例取込',   icon: '✦' },
  { href: '/column',     label: 'コラム生成',     icon: '✍' },
];

export { NAV };

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div style={{
      width: '200px',
      flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '0.5px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 0',
      minHeight: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* ロゴ */}
      <div style={{
        padding: '0 16px 28px',
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: '0.12em',
          fontFamily: 'Georgia, serif',
        }}>
          RE<span style={{ color: '#7c7ffe' }}>-</span>WRITE
        </div>
        <div style={{
          fontSize: '10px',
          color: '#374151',
          letterSpacing: '0.15em',
          marginTop: '3px',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}>
          WordPress 自動運用
        </div>
      </div>

      {/* ナビゲーション */}
      <nav>
        {NAV.map(({ href, label, icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={'sidebar-nav-item' + (isActive ? ' active' : '')}
            >
              <span style={{ fontSize: '13px', width: '16px', textAlign: 'center', flexShrink: 0 }}>
                {icon}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
