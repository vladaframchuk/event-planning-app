'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';

import { confirmEmailChange } from '@/lib/authApi';

type Status = 'idle' | 'loading' | 'success' | 'error';

type ViewState = {
  status: Status;
  message: string;
};

const EmailChangeConfirmPage = (): JSX.Element => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<ViewState>({ status: 'idle', message: '' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'Confirmation token is missing.' });
      return;
    }

    let cancelled = false;
    const run = async () => {
      setState({ status: 'loading', message: 'Updating email…' });
      try {
        const response = await confirmEmailChange(token);
        if (!cancelled) {
          setState({ status: 'success', message: response.detail });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to update email.';
          setState({ status: 'error', message });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-6 p-6">
      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Email updated</h1>
        {state.status === 'loading' ? (
          <p className="text-neutral-700 dark:text-neutral-300">{state.message}</p>
        ) : null}
        {state.status === 'success' ? (
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <p>{state.message}</p>
            <p>For security reasons, please sign in again.</p>
            <Link className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700" href="/login">
              Go to login
            </Link>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <p className="text-red-600 dark:text-red-300">{state.message}</p>
        ) : null}
      </div>
    </section>
  );
};

export default EmailChangeConfirmPage;