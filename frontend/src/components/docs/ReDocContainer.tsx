'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type RedocGlobal = typeof window & {
  Redoc?: {
    init: (specUrl: string, options: Record<string, unknown>, element: HTMLElement) => void;
  };
};

const DEFAULT_SPEC_URL =
  process.env.NEXT_PUBLIC_API_SCHEMA_URL ??
  process.env.NEXT_PUBLIC_DOCS_SPEC_URL ??
  '/api/openapi.json';

const REDOC_SCRIPT_SRC = 'https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js';

const loadRedocScript = (): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if ((window as RedocGlobal).Redoc) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>('script[data-redoc-standalone]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Redoc script failed to load')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = REDOC_SCRIPT_SRC;
    script.async = true;
    script.dataset.redocStandalone = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Redoc script failed to load'));
    document.head.appendChild(script);
  });
};

const redocOptions = {
  hideDownloadButton: false,
  expandResponses: '200,201',
  scrollYOffset: 'calc(var(--header-height) + var(--safe-top))',
  theme: {
    spacing: {
      unit: 8,
    },
    typography: {
      fontSize: '16px',
      fontFamily: 'var(--font-sans)',
      headings: {
        fontFamily: 'var(--font-heading)',
      },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
    },
    colors: {
      primary: {
        main: '#365cff',
      },
      http: {
        get: '#1b9b5c',
        post: '#365cff',
        put: '#dd7a00',
        delete: '#da3a3a',
      },
    },
    sidebar: {
      width: '280px',
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
  },
} as const;

const ReDocContainer = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const specUrl = useMemo(() => DEFAULT_SPEC_URL, []);

  useEffect(() => {
    let isCancelled = false;

    loadRedocScript()
      .then(() => {
        if (isCancelled || !containerRef.current) {
          return;
        }
        const redocApi = (window as RedocGlobal).Redoc;
        if (!redocApi) {
          throw new Error('Redoc global API is not available after script load');
        }
        redocApi.init(specUrl, redocOptions as Record<string, unknown>, containerRef.current);
        setIsReady(true);
      })
      .catch((loadError) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error(loadError);
        }
        if (!isCancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Failed to load documentation. Please try again later.',
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [specUrl]);

  return (
    <section className="flex h-full flex-1 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-[-0.015em] text-[var(--color-text-primary)]">
          API Docs
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Актуальная OpenAPI-спецификация. Выберите метод или воспользуйтесь поиском по документации.
        </p>
      </header>
      <div
        className="docs-redoc-shell flex-1 overflow-hidden rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] shadow-sm"
        style={{ touchAction: 'pan-y' }}
      >
        <div ref={containerRef} className="docs-redoc-container h-full w-full overflow-y-auto" />
        {!isReady && !error ? (
          <div className="flex h-full w-full items-center justify-center p-6">
            <span className="text-sm text-[var(--color-text-secondary)]">Загрузка документации…</span>
          </div>
        ) : null}
        {error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-sm font-medium text-[var(--color-error)]">{error}</span>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Проверьте подключение или укажите переменную окружения NEXT_PUBLIC_API_SCHEMA_URL.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ReDocContainer;
