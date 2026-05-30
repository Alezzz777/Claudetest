import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MesUser {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthState {
  user: MesUser | null;
  isLoading: boolean;
  error: string | null;
  keycloakInitialized: boolean;
  login: (keycloakToken: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  initKeycloak: () => Promise<void>;
  handleCallback: (code: string, codeVerifier: string) => Promise<void>;
  isTokenExpired: () => boolean;
  getValidToken: () => Promise<string>;
}

const KEYCLOAK_URL = import.meta.env['VITE_KEYCLOAK_URL'] ?? 'http://localhost:8080';
const KEYCLOAK_REALM = import.meta.env['VITE_KEYCLOAK_REALM'] ?? 'mes';
const KEYCLOAK_CLIENT_ID = import.meta.env['VITE_KEYCLOAK_CLIENT_ID'] ?? 'mes-web-app';

function getRedirectUri(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/login`;
  }
  return 'http://localhost:5173/login';
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, 64);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,
      keycloakInitialized: false,

      login: async (keycloakToken: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(
            `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
            { headers: { Authorization: `Bearer ${keycloakToken}` } },
          );

          if (!response.ok) throw new Error('Failed to fetch user info');

          const userInfo = (await response.json()) as {
            sub: string;
            email: string;
            name: string;
            mes_roles?: string[];
            tenant_id?: string;
          };

          set({
            user: {
              userId: userInfo.sub,
              email: userInfo.email,
              displayName: userInfo.name,
              roles: userInfo.mes_roles ?? ['VIEWER'],
              tenantId: userInfo.tenant_id ?? 'default',
              accessToken: keycloakToken,
              refreshToken: '',
              expiresAt: Date.now() + 300_000,
            },
            isLoading: false,
            keycloakInitialized: true,
          });
        } catch (err) {
          set({ error: String(err), isLoading: false });
        }
      },

      logout: () => {
        const logoutUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`;
        set({ user: null, keycloakInitialized: false });
        window.location.href = logoutUrl;
      },

      refreshToken: async () => {
        const { user } = get();
        if (!user?.refreshToken) {
          get().logout();
          return;
        }

        try {
          const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: KEYCLOAK_CLIENT_ID,
            refresh_token: user.refreshToken,
          });

          const response = await fetch(
            `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            },
          );

          if (!response.ok) {
            get().logout();
            return;
          }

          const tokens = (await response.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
          };

          set({
            user: {
              ...user,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: Date.now() + tokens.expires_in * 1000,
            },
          });
        } catch {
          get().logout();
        }
      },

      initKeycloak: async () => {
        set({ isLoading: true });
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);
        sessionStorage.setItem('pkce_verifier', verifier);

        const authUrl = new URL(
          `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
        );
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', KEYCLOAK_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', getRedirectUri());
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('scope', 'openid profile email');

        window.location.href = authUrl.toString();
      },

      handleCallback: async (code: string, codeVerifier: string) => {
        set({ isLoading: true, error: null });
        try {
          const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: KEYCLOAK_CLIENT_ID,
            redirect_uri: getRedirectUri(),
            code,
            code_verifier: codeVerifier,
          });

          const tokenResponse = await fetch(
            `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            },
          );

          if (!tokenResponse.ok) throw new Error('Token exchange failed');

          const tokens = (await tokenResponse.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
          };

          const userInfoResponse = await fetch(
            `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } },
          );

          if (!userInfoResponse.ok) throw new Error('Failed to fetch user info');

          const userInfo = (await userInfoResponse.json()) as {
            sub: string;
            email: string;
            name: string;
            mes_roles?: string[];
            tenant_id?: string;
          };

          set({
            user: {
              userId: userInfo.sub,
              email: userInfo.email,
              displayName: userInfo.name,
              roles: userInfo.mes_roles ?? ['VIEWER'],
              tenantId: userInfo.tenant_id ?? 'default',
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: Date.now() + tokens.expires_in * 1000,
            },
            isLoading: false,
            keycloakInitialized: true,
          });
        } catch (err) {
          set({ error: String(err), isLoading: false });
        }
      },

      isTokenExpired: () => {
        const { user } = get();
        if (!user) return true;
        return Date.now() > user.expiresAt;
      },

      getValidToken: async () => {
        const { user } = get();
        if (!user) throw new Error('Not authenticated');

        if (user.expiresAt - Date.now() < 60_000) {
          await get().refreshToken();
        }

        const freshUser = get().user;
        if (!freshUser) throw new Error('Not authenticated after refresh');
        return freshUser.accessToken;
      },
    }),
    {
      name: 'mes-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
