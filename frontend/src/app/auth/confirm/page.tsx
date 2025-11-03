'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';

import { confirmRegistration, resendConfirmationEmail } from '@/lib/authApi';

type Status = 'idle' | 'loading' | 'success' | 'error';

type ConfirmState = {
  status: Status;
  message: string;
};

const ConfirmPage = (): JSX.Element => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<ConfirmState>({ status: 'idle', message: '' });
  const [isResending, setIsResending] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'Confirmation token is missing.' });
      return;
    }

    let cancelled = false;
    const run = async () => {
      setState({ status: 'loading', message: 'Confirming email…' });
      try {
        const response = await confirmRegistration(token);
        if (!cancelled) {
          setState({ status: 'success', message: response.message });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to confirm email.';
          setState({ status: 'error', message });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const statusContent = useMemo(() => {
    switch (state.status) {
      case 'loading':
        return <p className="text-neutral-700 dark:text-neutral-300">{state.message}</p>;
      case 'success':
        return (
          <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
            <p>{state.message}</p>
            <p>You can now sign in with your account.</p>
            <Link className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700" href="/login">
              Go to login
            </Link>
          </div>
        );
      case 'error':
        return <p className="text-red-600 dark:text-red-300">{state.message}</p>;
      default:
        return null;
    }
  }, [state]);

  const handleResend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isResending) {
      return;
    }

    const trimmed = resendEmail.trim();
    if (!trimmed) {
      setResendMessage('Enter the email you used during registration.');
      return;
    }

    setIsResending(true);
    setResendMessage(null);
    try {
      const response = await resendConfirmationEmail(trimmed);
      setResendMessage(response.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resend confirmation email.';
      setResendMessage(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-8 p-6">
      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Email confirmation</h1>
        {statusContent}
      </div>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Need a new link?</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Enter your registration email below and we will send another confirmation link.
        </p>
        <form className="space-y-3" onSubmit={handleResend}>
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Email
            <input
              type="email"
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={isResending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isResending ? 'Sending…' : 'Resend confirmation'}
          </button>
        </form>
        {resendMessage ? <p className="text-sm text-neutral-600 dark:text-neutral-400">{resendMessage}</p> : null}
      </div>
    </section>
  );
};

export default ConfirmPage;