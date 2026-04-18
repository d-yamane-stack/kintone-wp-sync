import './globals.css';

export const metadata = {
  title: 'コンテンツ自動運用',
  description: 'WordPress コンテンツ自動生成・管理ツール',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
          <span className="font-bold text-gray-800 text-lg">📋 コンテンツ管理</span>
          <a href="/" className="text-sm text-gray-600 hover:text-blue-600">ジョブ一覧</a>
          <a href="/column" className="text-sm text-gray-600 hover:text-blue-600">コラム生成</a>
          <a href="/case-study" className="text-sm text-gray-600 hover:text-blue-600">施工事例取込</a>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
