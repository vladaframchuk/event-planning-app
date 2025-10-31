import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAccessToken } from '@/lib/authClient';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export type EventChannelMessage = {
  type: string;
  payload?: unknown;
};

type Subscriber = (message: EventChannelMessage) => void;

const BACKOFF_DELAYS = [500, 1000, 2000, 5000, 10_000];
const HEARTBEAT_INTERVAL = 25_000;
const HEARTBEAT_TIMEOUT = 30_000;

const isBrowser = typeof window !== 'undefined';

const stripTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const resolveWebSocketBase = (): string | null => {
  // Собираем базовый адрес для WebSocket с учётом браузера и переменных окружения.
  const configuredWs = process.env.NEXT_PUBLIC_WS_URL?.trim() ?? '';
  const configuredHttp = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  const fallbackOrigin = isBrowser ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL?.trim() ?? '';
  const rawBase = [configuredWs, configuredHttp, fallbackOrigin].find(
    (value) => value !== undefined && value !== null && value.trim().length > 0,
  )?.trim() ?? '';

  if (rawBase.length === 0) {
    return null;
  }
  if (rawBase.startsWith('ws://') || rawBase.startsWith('wss://')) {
    return stripTrailingSlash(rawBase);
  }
  if (rawBase.startsWith('https://')) {
    return `wss://${stripTrailingSlash(rawBase.slice('https://'.length))}`;
  }
  if (rawBase.startsWith('http://')) {
    return `ws://${stripTrailingSlash(rawBase.slice('http://'.length))}`;
  }
  return `ws://${stripTrailingSlash(rawBase)}`;
};

const buildWebSocketUrl = (eventId: number, token: string): string | null => {
  if (!isBrowser) {
    return null;
  }
  const base = resolveWebSocketBase();
  if (!base) {
    return null;
  }
  return `${stripTrailingSlash(base)}/ws/events/${eventId}/?token=${encodeURIComponent(token)}`;
};

export function useEventChannel(eventId: number) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<EventChannelMessage | undefined>(undefined);

  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const heartbeatTimeoutRef = useRef<number | null>(null);
  const frameHandleRef = useRef<number | null>(null);
  const frameIsTimeoutRef = useRef(false);
  const pendingMessagesRef = useRef<EventChannelMessage[]>([]);
  const subscribersRef = useRef(new Set<Subscriber>());
  const lastMessageRef = useRef<EventChannelMessage | undefined>(undefined);

  const clearHeartbeatTimeout = useCallback(() => {
    if (!isBrowser) {
      return;
    }
    if (heartbeatTimeoutRef.current !== null) {
      window.clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (!isBrowser) {
      return;
    }
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    clearHeartbeatTimeout();
  }, [clearHeartbeatTimeout]);

  const clearPendingFrame = useCallback(() => {
    if (!isBrowser) {
      return;
    }
    if (frameHandleRef.current === null) {
      return;
    }
    if (frameIsTimeoutRef.current) {
      window.clearTimeout(frameHandleRef.current);
    } else {
      window.cancelAnimationFrame(frameHandleRef.current);
    }
    frameHandleRef.current = null;
  }, []);

  const deliverQueuedMessages = useCallback(() => {
    if (pendingMessagesRef.current.length === 0) {
      return;
    }
    const queue = pendingMessagesRef.current.slice();
    pendingMessagesRef.current.length = 0;
    for (const message of queue) {
      lastMessageRef.current = message;
      setLastMessage(message);
      subscribersRef.current.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('Realtime subscriber failed', error);
        }
      });
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!isBrowser) {
      return;
    }
    if (frameHandleRef.current !== null) {
      return;
    }
    const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    if (isVisible && typeof window.requestAnimationFrame === 'function') {
      frameIsTimeoutRef.current = false;
      frameHandleRef.current = window.requestAnimationFrame(() => {
        frameHandleRef.current = null;
        deliverQueuedMessages();
      });
      return;
    }
    frameIsTimeoutRef.current = true;
    frameHandleRef.current = window.setTimeout(() => {
      frameHandleRef.current = null;
      deliverQueuedMessages();
    }, 100);
  }, [deliverQueuedMessages]);

  const send = useCallback((message: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send realtime payload', error);
    }
  }, []);

  const subscribe = useCallback((handler: Subscriber) => {
    subscribersRef.current.add(handler);
    const snapshot = lastMessageRef.current;
    if (snapshot) {
      try {
        handler(snapshot);
      } catch (error) {
        console.error('Realtime subscriber failed', error);
      }
    }
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!isBrowser || !Number.isFinite(eventId) || eventId <= 0) {
      shouldReconnectRef.current = false;
      clearHeartbeat();
      clearPendingFrame();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch (error) {
          console.error('Failed to close realtime channel', error);
        }
      }
      socketRef.current = null;
      lastMessageRef.current = undefined;
      setLastMessage(undefined);
      pendingMessagesRef.current.length = 0;
      setStatus('disconnected');
      return;
    }

    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    lastMessageRef.current = undefined;
    setLastMessage(undefined);
    pendingMessagesRef.current.length = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }
      if (reconnectTimerRef.current !== null) {
        return;
      }
      const attempt = reconnectAttemptRef.current;
      const delay = BACKOFF_DELAYS[Math.min(attempt, BACKOFF_DELAYS.length - 1)];
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectAttemptRef.current = Math.min(attempt + 1, BACKOFF_DELAYS.length - 1);
        connect();
      }, delay);
    };

    const sendPing = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      try {
        socket.send(JSON.stringify({ type: 'ping' }));
        clearHeartbeatTimeout();
        heartbeatTimeoutRef.current = window.setTimeout(() => {
          heartbeatTimeoutRef.current = null;
          socket.close();
        }, HEARTBEAT_TIMEOUT);
      } catch (error) {
        console.error('Failed to send ping', error);
      }
    };

    const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatIntervalRef.current = window.setInterval(sendPing, HEARTBEAT_INTERVAL);
      sendPing();
    };

    const handleMessage = (event: MessageEvent) => {
      clearHeartbeatTimeout();
      let payload: unknown = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload) as unknown;
        } catch (error) {
          console.error('Failed to parse realtime message', error);
          return;
        }
      }
      if (typeof payload !== 'object' || payload === null) {
        return;
      }
      const data = payload as Record<string, unknown>;
      const type = typeof data.type === 'string' ? data.type : '';
      if (type.length === 0) {
        return;
      }
      if (type === 'pong') {
        return;
      }
      pendingMessagesRef.current.push({ type, payload: data.payload });
      scheduleFlush();
    };

    function connect() {
      if (!shouldReconnectRef.current) {
        return;
      }
      const token = getAccessToken();
      if (!token) {
        setStatus('disconnected');
        scheduleReconnect();
        return;
      }
      const url = buildWebSocketUrl(eventId, token);
      if (!url) {
        setStatus('disconnected');
        return;
      }
      try {
        setStatus('connecting');
        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.onopen = () => {
          reconnectAttemptRef.current = 0;
          setStatus('connected');
          startHeartbeat();
        };
        socket.onmessage = handleMessage;
        socket.onerror = (event) => {
          console.warn('Realtime channel error', event);
        };
        socket.onclose = (event) => {
          clearHeartbeat();
          clearPendingFrame();
          socketRef.current = null;
          setStatus('disconnected');
          if (shouldReconnectRef.current && (!event.wasClean || event.code !== 1000)) {
            const reason = event.reason?.trim().length ? event.reason : 'No reason provided';
            console.warn(
              `Realtime channel closed unexpectedly (code ${event.code}). Reconnecting soon.`,
              { eventId, reason },
            );
          }
          if (shouldReconnectRef.current) {
            scheduleReconnect();
          }
        };
      } catch (error) {
        console.error('Failed to open realtime channel', error);
        setStatus('disconnected');
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearHeartbeat();
      clearPendingFrame();
      clearReconnectTimer();
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch (error) {
          console.error('Failed to close realtime channel', error);
        }
      }
      socketRef.current = null;
    };
  }, [clearHeartbeat, clearPendingFrame, clearHeartbeatTimeout, eventId, scheduleFlush]);

  return useMemo(
    () => ({
      status,
      send,
      lastMessage,
      subscribe,
    }),
    [lastMessage, send, status, subscribe],
  );
}
