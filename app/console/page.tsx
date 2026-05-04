'use client';

import { useEffect } from 'react';

const target =
  process.env.NEXT_PUBLIC_CONSOLE_APP_URL?.trim() || 'http://localhost:3001';

export default function ConsoleRedirectPage() {
  useEffect(() => {
    window.location.href = target;
  }, []);

  return (
    <main className='mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center'>
      <h1 className='text-2xl font-semibold text-slate-900'>Console Moved</h1>
      <p className='mt-3 text-sm leading-6 text-slate-600'>
        Internal admin console now runs as an independent app.
      </p>
      <p className='mt-2 text-sm leading-6 text-slate-600'>
        Redirecting to <span className='font-medium text-slate-900'>{target}</span>.
      </p>
      <a
        href={target}
        className='mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white'
      >
        Open Console
      </a>
    </main>
  );
}
