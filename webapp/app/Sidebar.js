'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1"   y="1"   width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
      <rect x="8.5" y="1"   width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
      <rect x="1"   y="8.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 13V5.5L7.5 2L13 5.5V13H9.5V9H5.5V13H2Z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}

function IconPen() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M10.5 1.5L13.5 4.5L5 13H2V10L10.5 1.5Z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M2 13H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

const NAV = [
  { href: '/',           label: 'ダッシュボード', Icon: IconGrid     },
  { href: '/case-study', label: '施工事例取込',   Icon: IconBuilding },
  { href: '/column',     label: 'コラム生成',     Icon: IconPen      },
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
      <div style={{ padding: '0 16px 28px' }}>
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
        {NAV.map(({ href, label, Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={'sidebar-nav-item' + (isActive ? ' active' : '')}
            >
              <span style={{ width: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon />
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
