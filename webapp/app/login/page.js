'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router   = useRouter();
  const [pw, setPw]       = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.success) {
        router.replace('/');
      } else {
        setError(data.error || 'ログインに失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg-base)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        background: '#ffffff',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-popup)',
        borderRadius: '16px',
        padding: '36px 32px',
        margin: '0 16px',
      }}>
        {/* ロゴ */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-main)', marginBottom: '4px' }}>
            RE<span style={{ color: 'var(--accent)' }}>‑</span>WRITE
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            WORDPRESS 自動運用
          </div>
        </div>

        {/* フォーム */}
        <form onSubmit={handleLogin}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600,
                          color: 'var(--text-sub)', marginBottom: '6px', letterSpacing: '0.03em' }}>
            パスワード
          </label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="パスワードを入力"
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px',
              fontSize: '14px',
              border: error ? '1.5px solid #dc2626' : '1.5px solid var(--border)',
              borderRadius: '10px',
              background: 'var(--bg-input)',
              color: 'var(--text-main)',
              outline: 'none',
              marginBottom: '8px',
            }}
          />
          {error && (
            <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !pw}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '10px',
              border: 'none',
              background: loading || !pw ? 'var(--border)' : 'var(--accent)',
              color: loading || !pw ? 'var(--text-muted)' : '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading || !pw ? 'default' : 'pointer',
              marginTop: error ? '0' : '4px',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
