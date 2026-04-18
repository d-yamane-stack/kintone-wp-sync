import './globals.css';
import HeaderStats from './HeaderStats';

export const metadata = {
  title: 'コンテンツ自動運用',
  description: 'WordPress コンテンツ自動生成・管理ツール',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ background: 'var(--bg-base)', color: 'var(--text-main)', minHeight: '100vh' }}>
        <nav style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)' }}
             className="px-6 py-3 flex items-center gap-6">
          <span className="font-bold text-base tracking-wide" style={{ color: 'var(--accent)' }}>
            ⚡ コンテンツ管理
          </span>
          <a href="/" className="text-sm font-medium"
             style={{ color: 'var(--text-sub)' }}>
            ジョブ一覧
          </a>
          <a href="/column" className="text-sm font-medium"
             style={{ color: 'var(--text-sub)' }}>
            コラム生成
          </a>
          <a href="/case-study" className="text-sm font-medium"
             style={{ color: 'var(--text-sub)' }}>
            施工事例取込
          </a>
          <HeaderStats />
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
