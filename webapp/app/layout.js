import './globals.css';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export const metadata = {
  title: 'p-write',
  description: '書く・直す・調べる。SEOコンテンツ運用を自動化。',
  viewport: 'width=device-width, initial-scale=1',
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
