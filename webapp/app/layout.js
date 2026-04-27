import './globals.css';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export const metadata = {
  title: 'コンテンツ自動運用',
  description: 'WordPress コンテンツ自動生成・管理ツール',
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
