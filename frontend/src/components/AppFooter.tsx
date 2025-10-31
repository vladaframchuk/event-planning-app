"use client";

import { useMemo } from 'react';

import { useRealtimeStatus } from '@/context/realtimeStatus';

const AppFooter = () => {
  const status = useRealtimeStatus();

  const indicator = useMemo(() => {
    if (status === 'connected') {
      return {
        symbol: '✅',
        label: 'online',
        className: 'text-emerald-500 dark:text-emerald-400',
      };
    }
    if (status === 'connecting') {
      return {
        symbol: '⏳',
        label: 'reconnecting…',
        className: 'text-amber-500 dark:text-amber-400 animate-pulse',
      };
    }
    return {
      symbol: '⚠',
      label: 'offline',
      className: 'text-red-500 dark:text-red-400',
    };
  }, [status]);

  return (
    <footer className="border-t border-neutral-200 bg-white/80 py-3 text-sm text-neutral-600 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-300">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 sm:px-6 lg:px-8">
        <span className={`text-base ${indicator.className}`} aria-hidden>
          {indicator.symbol}
        </span>
        <span className="ml-2">realtime: {indicator.label}</span>
      </div>
    </footer>
  );
};

export default AppFooter;
