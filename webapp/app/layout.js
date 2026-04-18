import './globals.css';

export const metadata = {
  title: 'コンテンツ自動運用',
  description: 'WordPress コンテンツ自動生成・管理ツール',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ background: 'var(--bg-base)', color: 'var(--text-main)', minHeight: '100vh' }}>
        <nav style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)' }}
             className="px-6 py-4 flex items-center gap-8">
          <span className="font-bold text-lg tracking-wide" style={{ color: '#818cf8' }}>
            ⚡ コンテンツ管理
          </span>
          <a href="/" className="text-sm font-medium transition-colors duration-150"
             style={{ color: 'var(--text-muted)' }}>
            ジョブ一覧
          </a>
          <a href="/column" className="text-sm font-medium transition-colors duration-150"
             style={{ color: 'var(--text-muted)' }}>
            コラム生成
          </a>
          <a href="/case-study" className="text-sm font-medium transition-colors duration-150"
             style={{ color: 'var(--text-muted)' }}>
            施工事例取込
          </a>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
