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
  login: (keycloakToken: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const KEYCLOAK_URL = import.meta.env['VITE_KEYCLOAK_URL'] ?? 'http://localhost:8080';
const KEYCLOAK_REALM = import.meta.env['VITE_KEYCLOAK_REALM'] ?? 'mes';
const KEYCLOAK_CLIENT_ID = import.meta.env['VITE_KEYCLOAK_CLIENT_ID'] ?? 'mes-web-app';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,

      login: async (keycloakToken: string) => {
        set({ isLoading: true, error: null });
        try {
          // Exchange Keycloak token for MES user info
          const response = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`, {
            headers: { Authorization: `Bearer ${keycloakToken}` },
          });

          if (!response.ok) throw new Error('Failed to fetch user info');

          const userInfo = await response.json() as {
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
              expiresAt: Date.now() + 300_000, // 5 min
            },
            isLoading: false,
          });
        } catch (err) {
          set({ error: String(err), isLoading: false });
        }
      },

      logout: () => {
        // Redirect to Keycloak logout
        const logoutUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`;
        window.location.href = logoutUrl;
        set({ user: null });
      },

      refreshToken: async () => {
        const { user } = get();
        if (!user) return;
        // Token refresh logic would call Keycloak token endpoint
        // Simplified: just log out if token is expired
        if (Date.now() > user.expiresAt) {
          get().logout();
        }
      },
    }),
    {
      name: 'mes-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
