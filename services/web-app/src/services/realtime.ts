import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../store/auth.store';

const SSE_BASE = import.meta.env['VITE_SSE_URL'] ?? 'http://localhost:3000/events';

export type SseEventType =
  | 'production.order.started'
  | 'production.order.completed'
  | 'production.oee.measured'
  | 'quality.ncr.raised'
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
 * React hook for Server-Sent Events (SSE) real-time updates.
 *
 * Connects to the API gateway SSE endpoint which fans out Kafka events
 * to connected web clients. Automatically reconnects with exponential backoff.
 *
 * Usage:
 *   const { isConnected } = useSseStream({
 *     topics: ['production.order.started', 'production.oee.measured'],
 *     onEvent: (event) => console.log(event),
 *   });
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
      reconnectDelay.current = 1000; // reset backoff on success
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data as string) as SseEvent<T>;
        onEvent(parsed);
      } catch {
        console.warn('Failed to parse SSE message:', e.data);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      setError('SSE connection lost — reconnecting...');
      es.close();
      eventSourceRef.current = null;

      // Exponential backoff: 1s, 2s, 4s, ... max 30s
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
        connect();
      }, reconnectDelay.current);
    };

    // Listen to named events (by MES event type)
    for (const topic of topics) {
      es.addEventListener(topic, (e: Event) => {
        const msgEvent = e as MessageEvent;
        try {
          const parsed = JSON.parse(msgEvent.data as string) as SseEvent<T>;
          onEvent(parsed);
        } catch {
          console.warn(`Failed to parse event ${topic}`);
        }
      });
    }
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
 * Hook for WebSocket connection (used for bidirectional real-time features
 * like operator acknowledgements and live OEE gauges).
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

  useEffect(() => {
    if (!user?.accessToken || !enabled) return;

    const wsUrl = `${import.meta.env['VITE_WS_URL'] ?? 'ws://localhost:3000'}${path}?token=${user.accessToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (e: MessageEvent) => {
      try {
        onMessage(JSON.parse(e.data as string) as T);
      } catch { /* ignore parse errors */ }
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
