'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useLang, LangToggle } from '@/components/LangContext';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get('from') || '/vault';
  const { t } = useLang();
  const l = t.login;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const oauthError = params.get('error');
  const [error, setError] = useState(oauthError ? l.errorNetwork : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const body = mode === 'register'
      ? { email, password, name }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        router.replace(from);
      } else {
        setError(data.error || l.errorInvalid);
      }
    } catch {
      setError(l.errorNetwork);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim() && password.trim() && (mode === 'login' || name.trim());

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--text)] flex items-center justify-center mb-4 shadow-vault-md">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Token Bank</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            {mode === 'register' ? l.registerSubtitle : l.subtitle}
          </p>
        </div>

        {/* Lang toggle */}
        <div className="flex justify-end mb-4">
          <LangToggle />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-[var(--radius-xl)] border border-[var(--border)] shadow-vault-md p-8 space-y-5">
          {/* Name (register only) */}
          {mode === 'register' && (
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest block mb-2">
                {l.nameLabel}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder={l.namePlaceholder}
                className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm bg-[var(--surface-raised)] focus:border-[var(--border-hover)] focus:bg-[var(--surface)] transition-colors duration-[var(--duration-normal)]"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest block mb-2">
              {l.emailLabel}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
              placeholder={l.emailPlaceholder}
              className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm bg-[var(--surface-raised)] focus:border-[var(--border-hover)] focus:bg-[var(--surface)] transition-colors duration-[var(--duration-normal)]"
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest block mb-2">
              {l.passwordLabel}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={l.passwordPlaceholder}
                className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 pr-10 text-sm bg-[var(--surface-raised)] focus:border-[var(--border-hover)] focus:bg-[var(--surface)] transition-colors duration-[var(--duration-normal)]"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-4)] hover:text-[var(--text-2)] transition-colors"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="focus-ring w-full py-2.5 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-40 transition-opacity duration-[var(--duration-fast)]"
          >
            {loading
              ? l.verifying
              : mode === 'register'
                ? l.createAccount
                : l.signIn}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[10px] text-[var(--text-4)] uppercase tracking-widest">{l.or ?? 'or'}</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Google Sign-in */}
          <a
            href={`/api/auth/google?from=${encodeURIComponent(from)}`}
            className="focus-ring w-full py-2.5 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors duration-[var(--duration-normal)] flex items-center justify-center gap-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.04 24.04 0 0 0 0 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {l.googleSignIn ?? 'Continue with Google'}
          </a>

          {/* Toggle login/register */}
          <p className="text-center text-xs text-[var(--text-3)]">
            {mode === 'login' ? l.noAccount : l.hasAccount}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-[var(--accent)] hover:underline font-medium"
            >
              {mode === 'login' ? l.goRegister : l.goLogin}
            </button>
          </p>
        </form>

        <p className="text-center text-[10px] text-[var(--text-4)] mt-6 font-mono">
          {l.footer}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
