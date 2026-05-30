import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSseStreamSimple } from '../services/realtime';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closeCalled = true;
  }

  // Helper: simulate open
  simulateOpen() {
    if (this.onopen) this.onopen();
  }

  // Helper: simulate message
  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  // Helper: simulate error
  simulateError() {
    if (this.onerror) this.onerror();
  }
}

vi.stubGlobal('EventSource', MockEventSource);

beforeEach(() => {
  MockEventSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useSseStreamSimple', () => {
  it('connected=true after onopen', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSseStreamSimple('http://localhost/events', onEvent));

    expect(result.current.connected).toBe(false);

    act(() => {
      MockEventSource.instances[0]?.simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it('connected=false after onerror', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSseStreamSimple('http://localhost/events', onEvent));

    act(() => {
      MockEventSource.instances[0]?.simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      MockEventSource.instances[0]?.simulateError();
    });
    expect(result.current.connected).toBe(false);
  });

  it('onEvent called when message received', () => {
    const onEvent = vi.fn();
    renderHook(() => useSseStreamSimple('http://localhost/events', onEvent));

    act(() => {
      MockEventSource.instances[0]?.simulateOpen();
      MockEventSource.instances[0]?.simulateMessage('{"type":"test"}');
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ data: '{"type":"test"}' }));
  });

  it('EventSource.close() called on unmount', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useSseStreamSimple('http://localhost/events', onEvent));

    const es = MockEventSource.instances[0];
    unmount();

    expect(es?.closeCalled).toBe(true);
  });

  it('does not connect when url is null', () => {
    const onEvent = vi.fn();
    renderHook(() => useSseStreamSimple(null, onEvent));
    expect(MockEventSource.instances.length).toBe(0);
  });

  it('reconnects after 3s on error', () => {
    const onEvent = vi.fn();
    renderHook(() => useSseStreamSimple('http://localhost/events', onEvent));

    expect(MockEventSource.instances.length).toBe(1);

    act(() => {
      MockEventSource.instances[0]?.simulateError();
    });

    // advance 3s
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(MockEventSource.instances.length).toBe(2);
  });
});
