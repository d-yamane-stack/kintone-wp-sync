'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './Sidebar';

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {NAV.map(({ href, label, Icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
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
