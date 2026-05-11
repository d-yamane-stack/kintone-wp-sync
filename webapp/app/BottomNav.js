'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './Sidebar';

// スマホ向けに短縮したラベル
const MOBILE_LABELS = {
  '/':                'ダッシュボード',
  '/case-study':      '施工事例取込',
  '/column':          'コラム生成',
  '/column-analysis': '分析/リライト',
  '/seo':             'SEO調査',
};

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {NAV.map(({ href, Icon }) => {
        // /column が /column-analysis に誤マッチしないよう厳密判定
        const isActive = href === '/'
          ? pathname === '/'
          : pathname === href || pathname.startsWith(href + '/');
        const label = MOBILE_LABELS[href] || href;
        return (
          <Link
            key={href}
            href={href}
            className={isActive ? 'active' : ''}
          >
            <span className="nav-icon"><Icon /></span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
