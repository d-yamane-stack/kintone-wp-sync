import './globals.css';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export const metadata = {
  title: 'p-write',
  description: '書く・直す・調べる。SEOコンテンツ運用を自動化。',
  manifest: '/manifest.json',
  // ホーム画面追加用アイコン（iOSは apple-touch-icon、Androidは manifest を使用）
  icons: {
    icon: '/favicon-32x32.png',
    shortcut: '/favicon-32x32.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'p-write', statusBarStyle: 'default' },
};

// Next.js 16: viewport は metadata から分離（themeColor も viewport 側へ）
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6366f1',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        {/* サイドバー（PCのみ表示） */}
        <div className="sidebar-wrapper">
          <Sidebar />
        </div>

        {/* メインエリア */}
        <div className="main-wrapper">
          {/* トップバー */}
          <TopBar />

          {/* コンテンツ */}
          <main className="main-content">
            {children}
          </main>
        </div>

        {/* ボトムナビ（スマホのみ表示） */}
        <BottomNav />
      </body>
    </html>
  );
}
