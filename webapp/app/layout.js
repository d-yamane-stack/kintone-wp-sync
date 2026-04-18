import './globals.css';
import HeaderStats from './HeaderStats';

export const metadata = {
  title: 'コンテンツ自動運用',
  description: 'WordPress コンテンツ自動生成・管理ツール',
};

const navLinks = [
  { href: '/',           label: 'ジョブ一覧' },
  { href: '/column',     label: 'コラム生成' },
  { href: '/case-study', label: '施工事例取込' },
];

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ background: 'var(--bg-base)', color: 'var(--text-main)', minHeight: '100vh' }}>

        {/* ヘッダー上段: ロゴ + コスト */}
        <div style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)' }}>
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg"
                   style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>⚡</span>
              </div>
              <div>
                <p className="font-bold text-base leading-tight" style={{ color: 'var(--text-main)' }}>
                  コンテンツ自動運用
                </p>
                <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                  WordPress AI 生成・管理ツール
                </p>
              </div>
            </div>
            <HeaderStats />
          </div>
        </div>

        {/* ヘッダー下段: ナビ */}
        <div style={{ background: 'var(--bg-nav)', borderBottom: '2px solid var(--border)' }}>
          <div className="max-w-5xl mx-auto px-6 flex items-center gap-1">
            {navLinks.map(({ href, label }) => (
              <a key={href} href={href}
                 className="relative px-4 py-3 text-sm font-medium"
                 style={{ color: 'var(--text-sub)' }}>
                {label}
              </a>
            ))}
          </div>
        </div>

        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
