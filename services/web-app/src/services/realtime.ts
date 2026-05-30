import { useEffect, useRef, useCallback, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';

const SSE_BASE = import.meta.env['VITE_SSE_URL'] ?? 'http://localhost:3000/events';

export type SseEventType =
  | 'production.order.started'
  | 'production.order.completed'
  | 'production.oee.measured'
  | 'quality.ncr.raised'
  | 'quality.measurement.recorded'
  | 'quality.hold.placed'
  | 'maintenance.equipment.failed'
  | 'inventory.lot.moved'
  | 'scheduling.schedule.replanned';

export interface SseEvent<T = unknown> {
  type: SseEventType;
  data: T;
  id: string;
  timestamp: string;
}

type EventHandler<T = unknown> = (event: SseEvent<T>) => void;

/**
 * Generic SSE hook — connects to a URL, reconnects on error.
 * Signature matches the spec: (url, onEvent) => { connected }
 */
export function useSseStreamSimple(
  url: string | null,
  onEvent: (event: MessageEvent) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;

    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const es = new EventSource(url as string);
      esRef.current = es;

      es.onopen = () => { if (!destroyed) setConnected(true); };

      es.onmessage = (e: MessageEvent) => {
        if (!destroyed) onEventRef.current(e);
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
        if (!destroyed) {
          timerRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
  }, [url]);

  return { connected };
}

/**
 * SSE hook that invalidates TanStack Query on specific event types.
 */
export function useSseInvalidation(
  url: string | null,
  queryClient: QueryClient,
  eventTypeToQueryKey: Record<string, string[]>,
): void {
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;
  const mapRef = useRef(eventTypeToQueryKey);
  mapRef.current = eventTypeToQueryKey;

  useSseStreamSimple(url, (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data as string) as { type?: string };
      if (parsed.type && mapRef.current[parsed.type]) {
        void qcRef.current.invalidateQueries({ queryKey: mapRef.current[parsed.type] });
      }
    } catch { /* ignore */ }
  });
}

/**
 * Full-featured SSE hook with topic subscription, exponential backoff,
 * and auth token embedding.
 */
export function useSseStream<T = unknown>(params: {
  topics: SseEventType[];
  onEvent: EventHandler<T>;
  enabled?: boolean;
}): { isConnected: boolean; error: string | null } {
  const { topics, onEvent, enabled = true } = params;
  const { user } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectDelay = useRef(1000);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!user?.accessToken || !enabled) return;

    const url = new URL(SSE_BASE);
    topics.forEach((t) => url.searchParams.append('topic', t));
    url.searchParams.set('token', user.accessToken);

    const es = new EventSource(url.toString());
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectDelay.current = 1000;
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data as string) as SseEvent<T>;
        onEventRef.current(parsed);
      } catch {
        console.warn('Failed to parse SSE message:', e.data);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      setError('SSE connection lost — reconnecting...');
      es.close();
      eventSourceRef.current = null;

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
        connect();
      }, reconnectDelay.current);
    };

    for (const topic of topics) {
      es.addEventListener(topic, (e: Event) => {
        const msgEvent = e as MessageEvent;
        try {
          const parsed = JSON.parse(msgEvent.data as string) as SseEvent<T>;
          onEventRef.current(parsed);
        } catch {
          console.warn(`Failed to parse event ${topic}`);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.accessToken, enabled, topics.join(',')]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  return { isConnected, error };
}

/**
 * WebSocket hook for bidirectional real-time communication.
 */
export function useWebSocket<T = unknown>(params: {
  path: string;
  onMessage: (msg: T) => void;
  enabled?: boolean;
}): { send: (data: unknown) => void; isConnected: boolean } {
  const { path, onMessage, enabled = true } = params;
  const { user } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!user?.accessToken || !enabled) return;

    const wsUrl = `${import.meta.env['VITE_WS_URL'] ?? 'ws://localhost:3000'}${path}?token=${user.accessToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (e: MessageEvent) => {
      try {
        onMessageRef.current(JSON.parse(e.data as string) as T);
      } catch { /* ignore */ }
    };

    return () => { ws.close(); };
  }, [user?.accessToken, path, enabled]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, isConnected };
}
