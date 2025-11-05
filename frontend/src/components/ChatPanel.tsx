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
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { useEventChannel } from '@/hooks/useEventChannel';
import { listMessages, sendMessage } from '@/lib/chatApi';
import { t } from '@/lib/i18n';
import { getMe, type Profile } from '@/lib/profileApi';
import type { ChatMessage } from '@/types/chat';

type ChatPanelProps = {
  eventId: number;
};

type LocalChatMessage = ChatMessage & {
  pending?: boolean;

  localId?: number;
};

type ChatMessageEventPayload = {
  id: number;

  event: number;

  author: number;

  author_name: string;

  author_avatar: string | null;

  text: string;

  created_at: string;
};

type ChatTypingEventPayload = {
  event_id: number;

  user_id: number;

  user_name: string;
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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isStringValue = (value: unknown): value is string => typeof value === 'string';

const isChatMessageEventPayload = (value: unknown): value is ChatMessageEventPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    isFiniteNumber(data.id) &&
    isFiniteNumber(data.event) &&
    isFiniteNumber(data.author) &&
    isStringValue(data.author_name) &&
    (data.author_avatar === null || isStringValue(data.author_avatar)) &&
    isStringValue(data.text) &&
    isStringValue(data.created_at)
  );
};

const isChatTypingEventPayload = (value: unknown): value is ChatTypingEventPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    isFiniteNumber(data.event_id) && isFiniteNumber(data.user_id) && isStringValue(data.user_name)
  );
};

const ChatPanel = ({ eventId }: ChatPanelProps) => {
  const router = useRouter();

  const listRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);

  const messagesRef = useRef<LocalChatMessage[]>([]);

  const isAtBottomRef = useRef(true);
  const autoScrollSuppressRef = useRef(false);

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

  const {
    status: realtimeStatus,
    subscribe: subscribeToEventChannel,
    send: sendToEventChannel,
  } = useEventChannel(eventId);

  const typingTimeoutsRef = useRef<Map<number, number>>(new Map<number, number>());

  const typingDebounceRef = useRef<number | null>(null);

  const lastTypingSentRef = useRef<number>(0);

  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(
    () => new Map<number, string>(),
  );

  const replaceMessages = useCallback(
    (updater: (prev: LocalChatMessage[]) => LocalChatMessage[]) => {
      setMessages((prev) => {
        const updated = sortMessages(updater(prev));

        messagesRef.current = updated;

        return updated;
      });
    },
    [],
  );

  const clearTypingForUser = useCallback((userId: number) => {
    const timeoutId = typingTimeoutsRef.current.get(userId);

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);

      typingTimeoutsRef.current.delete(userId);
    }

    setTypingUsers((prev) => {
      if (!prev.has(userId)) {
        return prev;
      }

      const next = new Map(prev);

      next.delete(userId);

      return next;
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

  useEffect(() => {
    const timeoutsRef = typingTimeoutsRef;
    const debounceRef = typingDebounceRef;

    return () => {
      const timeouts = timeoutsRef.current;
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeouts.clear();

      const debounceId = debounceRef.current;
      if (debounceId !== null) {
        window.clearTimeout(debounceId);
        debounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    typingTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));

    typingTimeoutsRef.current.clear();

    if (typingDebounceRef.current !== null) {
      window.clearTimeout(typingDebounceRef.current);

      typingDebounceRef.current = null;
    }

    lastTypingSentRef.current = 0;

    setTypingUsers(() => new Map<number, string>());
  }, [eventId]);

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
      const message = error instanceof Error ? error.message : t('event.chat.panel.errors.initial');

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

  const mergeMessages = useCallback(
    (incoming: ChatMessage[]) => {
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

      if (additionsCount > 0) {
        requestAnimationFrame(() => scrollToBottom());
      }
    },
    [replaceMessages, scrollToBottom],
  );

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
    autoScrollSuppressRef.current = true;

    try {
      const response = await listMessages(eventId, {
        beforeId: firstServerMessage.id,

        pageSize: PAGE_SIZE,
      });

      const mapped = response.results.map(toLocalMessage);
      const existingIds = new Set(
        currentMessages.filter((item) => item.id > 0).map((item) => item.id),
      );
      const additions = mapped.filter((item) => !existingIds.has(item.id));

      if (additions.length === 0) {
        autoScrollSuppressRef.current = false;
        setHasMoreHistory(mapped.length === PAGE_SIZE);
        return;
      }

      replaceMessages((prev) => [...additions, ...prev]);

      setHasMoreHistory(mapped.length === PAGE_SIZE);

      if (container) {
        requestAnimationFrame(() => {
          const newHeight = container.scrollHeight;

          container.scrollTop = newHeight - previousHeight;
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('event.chat.panel.errors.history');

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
      const message = error instanceof Error ? error.message : t('event.chat.panel.errors.refresh');

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
    const currentIds = positiveIdsRef.current;

    const nextIds = new Set<number>();

    messages.forEach((item) => {
      if (item.id > 0) {
        nextIds.add(item.id);
      }
    });

    const newIds = Array.from(nextIds).filter((id) => !currentIds.has(id));

    positiveIdsRef.current = nextIds;

    if (autoScrollSuppressRef.current) {
      autoScrollSuppressRef.current = false;
      return;
    }

    if (newIds.length === 0) {
      return;
    }

    requestAnimationFrame(() => scrollToBottom());
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const container = listRef.current;
    const sentinel = topSentinelRef.current;

    if (!container || !sentinel) {
      return;
    }

    if (!hasMoreHistory) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMoreHistory && !loadMorePending && !initialLoading) {
            loadOlder().catch(() => undefined);
          }
        });
      },
      {
        root: container,
        rootMargin: '0px',
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreHistory, initialLoading, loadMorePending, loadOlder]);

  useEffect(() => {
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return;
    }

    const currentUserId = profile?.id ?? null;

    const unsubscribe = subscribeToEventChannel((message) => {
      if (message.type === 'chat.message' && isChatMessageEventPayload(message.payload)) {
        const payload = message.payload;

        if (payload.event !== eventId) {
          return;
        }

        const isOwnMessage = currentUserId !== null && payload.author === currentUserId;

        const serverMessage: LocalChatMessage = {
          id: payload.id,

          event: payload.event,

          author: payload.author,

          authorName: payload.author_name,

          authorAvatar: payload.author_avatar,

          isMe: isOwnMessage,

          text: payload.text,

          createdAt: payload.created_at,

          editedAt: undefined,

          pending: false,
        };

        replaceMessages((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === serverMessage.id);

          if (existingIndex >= 0) {
            const next = [...prev];

            const existing = next[existingIndex];

            next[existingIndex] = {
              ...existing,

              ...serverMessage,

              localId: existing.localId,

              pending: false,
            };

            return next;
          }

          if (isOwnMessage) {
            let replaced = false;

            const next = prev.map((item) => {
              if (
                item.pending &&
                item.author === serverMessage.author &&
                item.text === serverMessage.text
              ) {
                replaced = true;

                return {
                  ...item,

                  ...serverMessage,

                  pending: false,
                };
              }

              return item;
            });

            return replaced ? next : prev;
          }

          return [...prev, serverMessage];
        });

        clearTypingForUser(serverMessage.author);

        return;
      }

      if (message.type === 'chat.typing' && isChatTypingEventPayload(message.payload)) {
        const payload = message.payload;

        if (payload.event_id !== eventId) {
          return;
        }

        if (currentUserId !== null && payload.user_id === currentUserId) {
          return;
        }

        setTypingUsers((prev) => {
          const next = new Map(prev);

          next.set(payload.user_id, payload.user_name);

          return next;
        });

        const existingTimer = typingTimeoutsRef.current.get(payload.user_id);

        if (existingTimer !== undefined) {
          window.clearTimeout(existingTimer);
        }

        const timeoutId = window.setTimeout(() => {
          typingTimeoutsRef.current.delete(payload.user_id);

          setTypingUsers((prevMap) => {
            if (!prevMap.has(payload.user_id)) {
              return prevMap;
            }

            const next = new Map(prevMap);

            next.delete(payload.user_id);

            return next;
          });
        }, 3500);

        typingTimeoutsRef.current.set(payload.user_id, timeoutId);
      }
    });

    return unsubscribe;
  }, [clearTypingForUser, eventId, profile?.id, replaceMessages, subscribeToEventChannel]);

  const triggerTypingSignal = useCallback(() => {
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return;
    }

    const now = Date.now();

    if (now - lastTypingSentRef.current < 1000) {
      return;
    }

    sendToEventChannel({ type: 'chat.typing', payload: { event_id: eventId } });

    lastTypingSentRef.current = now;
  }, [eventId, sendToEventChannel]);

  const scheduleTypingSignal = useCallback(() => {
    if (typingDebounceRef.current !== null) {
      window.clearTimeout(typingDebounceRef.current);
    }

    typingDebounceRef.current = window.setTimeout(() => {
      typingDebounceRef.current = null;

      triggerTypingSignal();
    }, 900);
  }, [triggerTypingSignal]);

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;

      setComposerValue(nextValue);

      if (nextValue.trim().length === 0) {
        if (typingDebounceRef.current !== null) {
          window.clearTimeout(typingDebounceRef.current);

          typingDebounceRef.current = null;
        }

        return;
      }

      scheduleTypingSignal();
    },

    [scheduleTypingSignal],
  );

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

    if (typingDebounceRef.current !== null) {
      window.clearTimeout(typingDebounceRef.current);

      typingDebounceRef.current = null;
    }

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

      const message = error instanceof Error ? error.message : t('event.chat.panel.errors.send');

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

  const typingNames = useMemo(() => Array.from(typingUsers.values()), [typingUsers]);

  const typingIndicatorText = useMemo(() => {
    if (typingNames.length === 0) {
      return null;
    }

    if (typingNames.length === 1) {
      return t('event.chat.panel.typing.single', { name: typingNames[0] });
    }

    if (typingNames.length === 2) {
      return t('event.chat.panel.typing.double', { first: typingNames[0], second: typingNames[1] });
    }

    return t('event.chat.panel.typing.many', {
      first: typingNames[0],
      count: typingNames.length - 1,
    });
  }, [typingNames]);

  const realtimeStatusMeta = useMemo(() => {
    switch (realtimeStatus) {
      case 'connected':
        return { label: t('event.chat.status.connected'), dotClass: 'bg-emerald-500' };

      case 'connecting':
        return { label: t('event.chat.status.connecting'), dotClass: 'bg-amber-500' };

      default:
        return { label: t('event.chat.status.disconnected'), dotClass: 'bg-red-500' };
    }
  }, [realtimeStatus]);

  const renderAvatar = useCallback((message: LocalChatMessage) => {
    if (message.authorAvatar) {
      return (
        <Image
          src={message.authorAvatar}
          alt={t('event.chat.message.avatarAlt', { name: message.authorName })}
          width={40}
          height={40}
          sizes="40px"
          unoptimized
          className="h-10 w-10 rounded-full object-cover"
        />
      );
    }

    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent-primary)]">
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
          ? 'rounded-br-sm bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)]'
          : 'rounded-bl-sm border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] text-[var(--color-text-primary)]',
      ].join(' ');

      const nameClasses = [
        'text-xs',

        'font-semibold',

        isOwn ? 'text-white/80' : 'text-[var(--color-text-muted)]',
      ].join(' ');

      const timeClasses = [
        'mt-2',

        'text-[11px]',

        'uppercase',

        'tracking-wide',

        isOwn ? 'text-white/70' : 'text-[var(--color-text-muted)]',
      ].join(' ');

      return (
        <li
          key={`${message.id}-${message.localId ?? 'remote'}`}
          className={containerClasses}
          aria-busy={message.pending}
        >
          {!isOwn ? (
            renderAvatar(message)
          ) : (
            <div className="w-10 flex-shrink-0" aria-hidden="true" />
          )}

          <div className={wrapperClasses}>
            <p className={nameClasses}>{message.authorName}</p>

            <div className={bubbleClasses}>
              <p className="whitespace-pre-wrap break-words">{message.text}</p>

              <time className={timeClasses}>{formattedTime}</time>
            </div>
          </div>

          {isOwn ? (
            renderAvatar(message)
          ) : (
            <div className="w-10 flex-shrink-0" aria-hidden="true" />
          )}
        </li>
      );
    },

    [renderAvatar],
  );

  return (
    <section
      className="flex h-[var(--chat-h)] flex-col overflow-hidden rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] shadow-sm"
      style={{
        minHeight:
          'calc(100svh - var(--header-height) - var(--safe-top) - var(--safe-bottom) - var(--bottom-nav-height))',
        maxHeight:
          'calc(100svh - var(--header-height) - var(--safe-top) - var(--safe-bottom) - var(--bottom-nav-height))',
        touchAction: 'pan-y',
      }}
    >
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('event.chat.panel.title')}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)] shadow-sm">
            <span
              className={`h-2 w-2 rounded-full ${realtimeStatusMeta.dotClass}`}
              aria-hidden="true"
            />

            <span>{realtimeStatusMeta.label}</span>
          </span>

          <button
            type="button"
            onClick={() => fetchNewMessages().catch(() => undefined)}
            disabled={refreshPending || initialLoading}
            className="rounded-full border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)] disabled:opacity-60"
          >
            {refreshPending ? t('event.chat.panel.refreshing') : t('event.chat.panel.refresh')}
          </button>
        </div>
      </header>

      {initialError ? (
        <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{initialError}</p>

          <button
            type="button"
            onClick={() => loadInitial()}
            className="mt-4 btn btn--ghost btn--pill"
          >
            {t('event.chat.panel.retry')}
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 pt-4 sm:px-6">
        <div
          ref={listRef}
          className="relative flex-1 overflow-y-auto rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          style={{
            touchAction: 'pan-y',
            overscrollBehaviorY: 'contain',
            scrollBehavior: 'smooth',
            contentVisibility: 'auto',
            containIntrinsicSize: '720px',
          }}
        >
          {initialLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
              {t('event.chat.panel.loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
              {t('event.chat.panel.empty')}
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              <li aria-hidden="true">
                <div ref={topSentinelRef} className="h-1 w-full" />
              </li>
              {hasMoreHistory ? (
                <li className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => loadOlder().catch(() => undefined)}
                    disabled={loadMorePending || initialLoading}
                    className="btn btn--ghost btn--pill"
                  >
                    {loadMorePending
                      ? t('event.chat.panel.historyLoading')
                      : t('event.chat.panel.historyInline')}
                  </button>
                </li>
              ) : null}
              {messages.map((message) => renderMessage(message))}
            </ul>
          )}

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              className="absolute bottom-4 left-1/2 flex min-h-[48px] -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] shadow-lg transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-accent-primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)]"
              aria-live="polite"
            >
              {t('event.chat.panel.unread', { count: unreadCount })}
            </button>
          ) : null}
        </div>

        {typingIndicatorText ? (
          <div
            className="flex min-h-[48px] items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] shadow-sm"
            aria-live="polite"
            role="status"
          >
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)]"
              aria-hidden="true"
            />

            <span>{typingIndicatorText}</span>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleComposerSubmitEvent}
        className="border-t border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-4 sm:px-6"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + var(--space-sm))' }}
      >
        <label
          htmlFor="chat-message-input"
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]"
        >
          {t('event.chat.panel.input.label')}
        </label>

        {profileQuery.isError ? (
          <p className="mb-2 text-xs text-red-500">{t('event.chat.panel.errors.profile')}</p>
        ) : null}

        <textarea
          id="chat-message-input"
          value={composerValue}
          onChange={handleComposerChange}
          onKeyDown={handleComposerKeyDown}
          placeholder={t('event.chat.panel.input.placeholder')}
          rows={3}
          className="w-full min-h-[108px] resize-none rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm text-[var(--color-text-primary)] shadow-sm focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]"
          aria-label={t('event.chat.panel.input.ariaLabel')}
          enterKeyHint="send"
          disabled={profileQuery.isLoading || sendPending}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-muted)]">
          <span className="max-w-full">{t('event.chat.panel.input.helper')}</span>

          <div className="flex items-center gap-2">
            {sendError ? <span className="text-red-500">{sendError}</span> : null}

            <button
              type="submit"
              disabled={profileQuery.isLoading || sendPending || composerValue.trim().length === 0}
              className="btn btn--primary btn--pill"
              aria-label={t('event.chat.panel.sendAria')}
            >
              {sendPending ? t('event.chat.panel.sending') : t('event.chat.panel.send')}
            </button>
          </div>
        </div>
      </form>

      {toast ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            bottom: 'calc(var(--safe-bottom) + 1.5rem)',
            right: 'calc(var(--safe-right) + 1.5rem)',
          }}
        >
          <div className="pointer-events-auto rounded-xl bg-neutral-900/90 px-4 py-3 text-sm font-medium text-white shadow-lg">
            {toast.message}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default ChatPanel;
