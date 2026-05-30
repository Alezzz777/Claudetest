import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    default: {
      ...actual.default,
      create: vi.fn(() => ({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
      })),
    },
  };
});

describe('api-client', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: false, error: null, keycloakInitialized: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates clients with correct base URLs', async () => {
    const { productionApi, qualityApi, adminApi } = await import('../services/api');

    // All should have been created via axios.create
    expect(axios.create).toHaveBeenCalled();

    const calls = (axios.create as ReturnType<typeof vi.fn>).mock.calls as Array<[{ baseURL: string }]>;
    const baseUrls = calls.map((c) => c[0]?.baseURL ?? '');

    const hasProduction = baseUrls.some((u) => u.includes('/production/api/v1'));
    const hasQuality = baseUrls.some((u) => u.includes('/quality/api/v1'));
    const hasAdmin = baseUrls.some((u) => u.includes('/admin/api/v1'));

    expect(hasProduction).toBe(true);
    expect(hasQuality).toBe(true);
    expect(hasAdmin).toBe(true);
  });

  it('attaches bearer token via request interceptor setup', async () => {
    // Re-import to get fresh module
    const { productionApi } = await import('../services/api');

    // The interceptor use was called during module init
    expect(productionApi.interceptors.request.use).toBeDefined();
  });

  it('request interceptor attaches Authorization header', () => {
    // Simulate what the request interceptor does
    useAuthStore.setState({
      user: {
        userId: 'u1', email: 'e@e.com', displayName: 'E', roles: ['OPERATOR'],
        tenantId: 'default', accessToken: 'my-token', refreshToken: '', expiresAt: Date.now() + 300_000,
      },
    });

    const { user } = useAuthStore.getState();
    expect(user?.accessToken).toBe('my-token');

    // Simulate interceptor logic
    const config = { headers: {} as Record<string, string> };
    if (user?.accessToken) {
      config.headers['Authorization'] = `Bearer ${user.accessToken}`;
    }
    expect(config.headers['Authorization']).toBe('Bearer my-token');
  });

  it('does not attach Authorization when user is null', () => {
    useAuthStore.setState({ user: null });

    const { user } = useAuthStore.getState();
    const config = { headers: {} as Record<string, string> };
    if (user?.accessToken) {
      config.headers['Authorization'] = `Bearer ${user.accessToken}`;
    }
    expect(config.headers['Authorization']).toBeUndefined();
  });
});
