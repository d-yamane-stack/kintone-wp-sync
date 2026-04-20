import './globals.css';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export const metadata = {
  title: 'コンテンツ自動運用',
  description: 'WordPress コンテンツ自動生成・管理ツール',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        {/* サイドバー */}
        <Sidebar />

        {/* メインエリア */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: '100vh',
        }}>
          {/* トップバー: ページタイトル + コスト */}
          <TopBar />

          {/* コンテンツ */}
          <main style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 32px',
          }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
