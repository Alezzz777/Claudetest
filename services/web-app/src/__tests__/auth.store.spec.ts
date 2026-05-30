import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '../store/auth.store';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock window.location
const mockLocation = { href: '' };
vi.stubGlobal('window', { location: mockLocation, crypto: globalThis.crypto });

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: false, error: null, keycloakInitialized: false });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auth.store', () => {
  describe('login()', () => {
    it('sets user with correct fields from mocked userinfo response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          mes_roles: ['OPERATOR'],
          tenant_id: 'tenant-abc',
        }),
      });

      await useAuthStore.getState().login('test-token');

      const { user } = useAuthStore.getState();
      expect(user).not.toBeNull();
      expect(user?.userId).toBe('user-123');
      expect(user?.email).toBe('test@example.com');
      expect(user?.displayName).toBe('Test User');
      expect(user?.roles).toEqual(['OPERATOR']);
      expect(user?.tenantId).toBe('tenant-abc');
      expect(user?.accessToken).toBe('test-token');
    });

    it('uses default roles when mes_roles is absent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'u1', email: 'a@b.com', name: 'A' }),
      });

      await useAuthStore.getState().login('tok');

      expect(useAuthStore.getState().user?.roles).toEqual(['VIEWER']);
    });

    it('sets error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      await useAuthStore.getState().login('bad-token');

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().error).toBeTruthy();
    });
  });

  describe('logout()', () => {
    it('clears user state', () => {
      useAuthStore.setState({
        user: {
          userId: 'u1', email: 'a@b.com', displayName: 'A', roles: ['ADMIN'],
          tenantId: 'default', accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 100_000,
        },
      });

      useAuthStore.getState().logout();

      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('isTokenExpired()', () => {
    it('returns true when expiresAt < Date.now()', () => {
      useAuthStore.setState({
        user: {
          userId: 'u1', email: 'a@b.com', displayName: 'A', roles: [],
          tenantId: 'default', accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() - 1,
        },
      });

      expect(useAuthStore.getState().isTokenExpired()).toBe(true);
    });

    it('returns false when expiresAt > Date.now()', () => {
      useAuthStore.setState({
        user: {
          userId: 'u1', email: 'a@b.com', displayName: 'A', roles: [],
          tenantId: 'default', accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 60_000,
        },
      });

      expect(useAuthStore.getState().isTokenExpired()).toBe(false);
    });

    it('returns true when user is null', () => {
      useAuthStore.setState({ user: null });
      expect(useAuthStore.getState().isTokenExpired()).toBe(true);
    });
  });

  describe('refreshToken()', () => {
    it('calls logout() when no refreshToken present', async () => {
      useAuthStore.setState({
        user: {
          userId: 'u1', email: 'a@b.com', displayName: 'A', roles: [],
          tenantId: 'default', accessToken: 'tok', refreshToken: '', expiresAt: Date.now() - 1,
        },
      });

      await useAuthStore.getState().refreshToken();

      // After logout, user should be null
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('updates tokens on successful refresh', async () => {
      useAuthStore.setState({
        user: {
          userId: 'u1', email: 'a@b.com', displayName: 'A', roles: [],
          tenantId: 'default', accessToken: 'old-tok', refreshToken: 'ref-tok', expiresAt: Date.now() - 1,
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-tok',
          refresh_token: 'new-ref',
          expires_in: 300,
        }),
      });

      await useAuthStore.getState().refreshToken();

      expect(useAuthStore.getState().user?.accessToken).toBe('new-tok');
      expect(useAuthStore.getState().user?.refreshToken).toBe('new-ref');
    });
  });
});
