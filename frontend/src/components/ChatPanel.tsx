'use client';

import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { listMessages, sendMessage } from '@/lib/chatApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { ChatMessage } from '@/types/chat';

type ChatPanelProps = {
  eventId: number;
};

type LocalChatMessage = ChatMessage & {
  pending?: boolean;
  localId?: number;
};

const PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 12_000;
const AUTO_SCROLL_OFFSET_PX = 120;

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

const toLocalMessage = (message: ChatMessage): LocalChatMessage => ({
  ...message,
  pending: false,
});

const sortMessages = (items: LocalChatMessage[]): LocalChatMessage[] => {
  return [...items].sort((a, b) => {
    const timeDiff = a.createdAt.localeCompare(b.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    const aPending = (a.id ?? 0) < 0;
    const bPending = (b.id ?? 0) < 0;
    if (aPending !== bPending) {
      return aPending ? 1 : -1;
    }
    if (a.id === b.id) {
      return 0;
    }
    return a.id < b.id ? -1 : 1;
  });
};

const extractInitials = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '?';
  }
  const parts = trimmed.split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? '').filter(Boolean);
  return letters.join('') || trimmed[0].toUpperCase();
};

const isNearBottom = (element: HTMLElement): boolean => {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_OFFSET_PX;
};

const ChatPanel = ({ eventId }: ChatPanelProps) => {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<LocalChatMessage[]>([]);
  const isAtBottomRef = useRef(true);
  const positiveIdsRef = useRef<Set<number>>(new Set());

  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [loadMorePending, setLoadMorePending] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [composerValue, setComposerValue] = useState('');
  const [sendPending, setSendPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const profileQuery = useQuery<Profile, Error>({
    queryKey: ['profile', 'me'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const profile = profileQuery.data;

  const replaceMessages = useCallback((updater: (prev: LocalChatMessage[]) => LocalChatMessage[]) => {
    setMessages((prev) => {
      const updated = sortMessages(updater(prev));
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = listRef.current;
      if (!container) {
        return;
      }
      container.scrollTo({ top: container.scrollHeight, behavior });
      isAtBottomRef.current = true;
      setUnreadCount(0);
    },
    [setUnreadCount],
  );

  const syncPositiveIds = useCallback(
    (items: LocalChatMessage[]) => {
      const ids = new Set<number>();
      items.forEach((item) => {
        if (item.id > 0) {
          ids.add(item.id);
        }
      });
      positiveIdsRef.current = ids;
    },
    [positiveIdsRef],
  );

  useEffect(() => {
    syncPositiveIds(messages);
  }, [messages, syncPositiveIds]);

  useEffect(() => {
    if (!toast || typeof window === 'undefined') {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadInitial = useCallback(async () => {
    setInitialLoading(true);
    setInitialError(null);
    try {
      const firstPage = await listMessages(eventId, { page: 1, pageSize: PAGE_SIZE });
      const totalCount = firstPage.count;
      let latestPage = firstPage;

      if (totalCount > firstPage.results.length) {
        const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        if (totalPages > 1) {
          latestPage = await listMessages(eventId, { page: totalPages, pageSize: PAGE_SIZE });
        }
      }

      const loadedMessages = latestPage.results.map(toLocalMessage);
      replaceMessages(() => loadedMessages);
      syncPositiveIds(loadedMessages);

      setHasMoreHistory(totalCount > loadedMessages.length);

      requestAnimationFrame(() => scrollToBottom('auto'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось загрузить сообщения. Попробуйте ещё раз.';
      setInitialError(message);
    } finally {
      setInitialLoading(false);
    }
  }, [eventId, replaceMessages, scrollToBottom, syncPositiveIds]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const handleScroll = () => {
      const near = isNearBottom(container);
      isAtBottomRef.current = near;
      if (near) {
        setUnreadCount(0);
      }
    };
    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) {
      return;
    }
    let additionsCount = 0;
    replaceMessages((prev) => {
      const knownIds = new Map<number, number>();
      prev.forEach((item, index) => {
        if (item.id > 0) {
          knownIds.set(item.id, index);
        }
      });

      const next = [...prev];
      incoming.forEach((message) => {
        const existingIndex = knownIds.get(message.id);
        if (existingIndex !== undefined) {
          next[existingIndex] = { ...next[existingIndex], ...toLocalMessage(message) };
        } else {
          const mapped = toLocalMessage(message);
          next.push(mapped);
          knownIds.set(message.id, next.length - 1);
          additionsCount += 1;
        }
      });

      return next;
    });

    const container = listRef.current;
    if (!container) {
      return;
    }
    if (additionsCount === 0) {
      return;
    }
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom());
    } else {
      setUnreadCount((current) => current + additionsCount);
    }
  }, [replaceMessages, scrollToBottom]);

  const loadOlder = useCallback(async () => {
    if (loadMorePending) {
      return;
    }
    const currentMessages = messagesRef.current;
    const firstServerMessage = currentMessages.find((item) => item.id > 0);
    if (!firstServerMessage) {
      return;
    }
    const container = listRef.current;
    const previousHeight = container?.scrollHeight ?? 0;

    setLoadMorePending(true);
    try {
      const response = await listMessages(eventId, {
        beforeId: firstServerMessage.id,
        pageSize: PAGE_SIZE,
      });
      const mapped = response.results.map(toLocalMessage);
      replaceMessages((prev) => {
        const existing = new Set(prev.filter((item) => item.id > 0).map((item) => item.id));
        const additions = mapped.filter((item) => !existing.has(item.id));
        if (additions.length === 0) {
          return prev;
        }
        return [...additions, ...prev];
      });
      setHasMoreHistory(mapped.length === PAGE_SIZE);

      if (container) {
        requestAnimationFrame(() => {
          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - previousHeight;
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось загрузить историю сообщений.';
      setToast({ id: Date.now(), message });
    } finally {
      setLoadMorePending(false);
    }
  }, [eventId, loadMorePending, replaceMessages]);

  const fetchNewMessages = useCallback(async () => {
    if (initialLoading) {
      return;
    }
    if (refreshPending) {
      return;
    }
    const currentMessages = messagesRef.current;
    const lastServerMessage = [...currentMessages].reverse().find((item) => item.id > 0);
    if (!lastServerMessage) {
      await loadInitial();
      return;
    }
    setRefreshPending(true);
    try {
      const response = await listMessages(eventId, {
        afterId: lastServerMessage.id,
        pageSize: PAGE_SIZE,
      });
      mergeMessages(response.results);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось обновить чат. Попробуйте чуть позже.';
      setToast({ id: Date.now(), message });
    } finally {
      setRefreshPending(false);
    }
  }, [eventId, initialLoading, loadInitial, mergeMessages, refreshPending]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const interval = window.setInterval(() => {
      fetchNewMessages().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchNewMessages]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const currentIds = positiveIdsRef.current;
    const nextIds = new Set<number>();
    messages.forEach((item) => {
      if (item.id > 0) {
        nextIds.add(item.id);
      }
    });
    const newIds = Array.from(nextIds).filter((id) => !currentIds.has(id));
    positiveIdsRef.current = nextIds;
    if (newIds.length === 0) {
      return;
    }
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom());
    } else {
      setUnreadCount((current) => current + newIds.length);
    }
  }, [messages, scrollToBottom]);

  const handleComposerSubmit = useCallback(async () => {
    if (composerValue.trim().length === 0 || sendPending || !profile) {
      return;
    }

    const trimmed = composerValue.trim();
    const localId = Date.now();
    const optimisticMessage: LocalChatMessage = {
      id: -localId,
      localId,
      event: eventId,
      author: profile.id,
      authorName: profile.name ?? profile.email,
      authorAvatar: profile.avatar_url,
      isMe: true,
      text: trimmed,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    replaceMessages((prev) => [...prev, optimisticMessage]);
    setComposerValue('');
    setSendPending(true);
    setSendError(null);
    requestAnimationFrame(() => scrollToBottom());

    try {
      const serverMessage = await sendMessage(eventId, trimmed);
      replaceMessages((prev) =>
        prev.map((item) =>
          item.localId === localId ? { ...toLocalMessage(serverMessage) } : item,
        ),
      );
      router.refresh();
    } catch (error) {
      replaceMessages((prev) => prev.filter((item) => item.localId !== localId));
      const message =
        error instanceof Error ? error.message : 'Не удалось отправить сообщение. Попробуйте снова.';
      setSendError(message);
      setToast({ id: Date.now(), message });
    } finally {
      setSendPending(false);
    }
  }, [composerValue, eventId, profile, replaceMessages, router, scrollToBottom, sendPending]);

  const handleComposerSubmitEvent = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleComposerSubmit().catch(() => undefined);
    },
    [handleComposerSubmit],
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleComposerSubmit().catch(() => undefined);
      }
    },
    [handleComposerSubmit],
  );

  const oldestServerId = useMemo(() => {
    const firstServer = messages.find((message) => message.id > 0);
    return firstServer?.id ?? null;
  }, [messages]);

  const latestServerId = useMemo(() => {
    const lastServer = [...messages].reverse().find((message) => message.id > 0);
    return lastServer?.id ?? null;
  }, [messages]);

  const renderAvatar = useCallback((message: LocalChatMessage) => {
    if (message.authorAvatar) {
      return (
        <Image
          src={message.authorAvatar}
          alt={`Аватар пользователя ${message.authorName}`}
          width={40}
          height={40}
          sizes="40px"
          unoptimized
          className="h-10 w-10 rounded-full object-cover"
        />
      );
    }

    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-300 text-sm font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100">
        {extractInitials(message.authorName)}
      </div>
    );
  }, []);

  const renderMessage = useCallback(
    (message: LocalChatMessage) => {
      const isOwn = message.isMe;
      const formattedTime = timeFormatter.format(new Date(message.createdAt));
      const containerClasses = [
        'flex',
        'w-full',
        'gap-3',
        'sm:items-end',
        isOwn ? 'justify-end text-right' : 'justify-start text-left',
      ].join(' ');
      const wrapperClasses = [
        'flex',
        'max-w-[75%]',
        'flex-col',
        'gap-2',
        isOwn ? 'items-end' : 'items-start',
      ].join(' ');
      const bubbleClasses = [
        'w-fit',
        'max-w-full',
        'rounded-2xl',
        'px-4',
        'py-3',
        'text-sm',
        'leading-relaxed',
        'shadow-sm',
        isOwn
          ? 'rounded-br-sm bg-blue-600 text-white'
          : 'rounded-bl-sm bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
      ].join(' ');
      const nameClasses = [
        'text-xs',
        'font-semibold',
        isOwn ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-500 dark:text-neutral-400',
      ].join(' ');
      const timeClasses = [
        'mt-2',
        'text-[11px]',
        'uppercase',
        'tracking-wide',
        isOwn ? 'text-blue-100/80' : 'text-neutral-500 dark:text-neutral-400',
      ].join(' ');

      return (
        <li key={`${message.id}-${message.localId ?? 'remote'}`} className={containerClasses} aria-busy={message.pending}>
          {!isOwn ? renderAvatar(message) : <div className="w-10 flex-shrink-0" aria-hidden="true" />}
          <div className={wrapperClasses}>
            <p className={nameClasses}>{message.authorName}</p>
            <div className={bubbleClasses}>
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
              <time className={timeClasses}>{formattedTime}</time>
            </div>
          </div>
          {isOwn ? renderAvatar(message) : <div className="w-10 flex-shrink-0" aria-hidden="true" />}
        </li>
      );
    },
    [renderAvatar],
  );

  return (
    <section className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Чат события</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Здесь участники обсуждают детали и быстро делятся новостями.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchNewMessages().catch(() => undefined)}
          disabled={refreshPending || initialLoading}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {refreshPending ? 'Обновляем...' : 'Обновить'}
        </button>
      </header>

      {initialError ? (
        <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p>{initialError}</p>
          <button
            type="button"
            onClick={() => loadInitial()}
            className="mt-3 inline-flex items-center rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Повторить попытку
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => loadOlder()}
            disabled={!hasMoreHistory || loadMorePending || initialLoading}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {loadMorePending ? 'Загружаем...' : 'Подгрузить ещё'}
          </button>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {oldestServerId !== null && latestServerId !== null
              ? `ID ${oldestServerId} – ${latestServerId}`
              : 'Сообщений пока нет'}
          </span>
        </div>

        <div
          ref={listRef}
          className="relative flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {initialLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
              Загружаем сообщения...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
              Пока нет сообщений — будьте первым, кто начнёт разговор.
            </div>
          ) : (
            <ul className="flex flex-col gap-4">{messages.map((message) => renderMessage(message))}</ul>
          )}

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              aria-live="polite"
            >
              Новые сообщения ({unreadCount})
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleComposerSubmitEvent} className="border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <label htmlFor="chat-message-input" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Ваше сообщение
        </label>
        {profileQuery.isError ? (
          <p className="mb-2 text-xs text-red-500 dark:text-red-400">
            Не удалось загрузить данные профиля. Отправка сообщений может быть недоступна.
          </p>
        ) : null}
        <textarea
          id="chat-message-input"
          value={composerValue}
          onChange={(event) => setComposerValue(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Напишите что-нибудь и нажмите Enter, чтобы отправить"
          rows={3}
          className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          aria-label="Поле ввода сообщения"
          disabled={profileQuery.isLoading || sendPending}
        />
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-neutral-400 dark:text-neutral-500">
          <span>Shift+Enter — перенос строки</span>
          <div className="flex items-center gap-2">
            {sendError ? <span className="text-red-500 dark:text-red-400">{sendError}</span> : null}
            <button
              type="submit"
              disabled={profileQuery.isLoading || sendPending || composerValue.trim().length === 0}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60"
              aria-label="Отправить сообщение"
            >
              {sendPending ? 'Отправляем...' : 'Отправить'}
            </button>
          </div>
        </div>
      </form>

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50">
          <div className="pointer-events-auto rounded-xl bg-neutral-900/90 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-neutral-800/90">
            {toast.message}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default ChatPanel;
