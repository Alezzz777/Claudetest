import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Navigation from './components/Navigation';

// Lazy-loaded feature modules (code splitting per role)
const OperatorDashboard = lazy(() => import('./features/operator/OperatorDashboard'));
const DispatcherBoard = lazy(() => import('./features/dispatcher/DispatcherBoard'));
const QualityDashboard = lazy(() => import('./features/quality-controller/QualityDashboard'));
const AdminPanel = lazy(() => import('./features/admin/AdminPanel'));
const RecipeManager = lazy(() => import('./features/technologist/RecipeManager'));

function RequireAuth({ children, roles }: { children: React.ReactNode; roles: string[] }): React.ReactElement {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const hasRole = roles.some((r) => user.roles.includes(r));
  if (!hasRole) {
    return <div style={{ padding: 24 }}>Access denied: insufficient role</div>;
  }

  return <>{children}</>;
}

export default function App(): React.ReactElement {
  const { user } = useAuthStore();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {user && <Navigation />}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/operator" replace />} />

            <Route
              path="/operator/*"
              element={
                <RequireAuth roles={['OPERATOR', 'ENGINEER', 'ADMIN']}>
                  <OperatorDashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/dispatcher/*"
              element={
                <RequireAuth roles={['DISPATCHER', 'ENGINEER', 'ADMIN']}>
                  <DispatcherBoard />
                </RequireAuth>
              }
            />

            <Route
              path="/quality/*"
              element={
                <RequireAuth roles={['QUALITY_CONTROLLER', 'ENGINEER', 'ADMIN']}>
                  <QualityDashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/technologist/*"
              element={
                <RequireAuth roles={['ENGINEER', 'ADMIN']}>
                  <RecipeManager />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/*"
              element={
                <RequireAuth roles={['ADMIN']}>
                  <AdminPanel />
                </RequireAuth>
              }
            />

            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function LoginPage(): React.ReactElement {
  const { initKeycloak, handleCallback, isLoading, error, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code) {
      const verifier = sessionStorage.getItem('pkce_verifier');
      if (verifier) {
        sessionStorage.removeItem('pkce_verifier');
        void handleCallback(code, verifier);
      }
    }
  }, [location.search, handleCallback]);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const params = new URLSearchParams(location.search);
  const hasCode = !!params.get('code');

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 40, maxWidth: 360, width: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' }}>
        <h1 style={{ color: '#1976d2', marginTop: 0 }}>MES</h1>
        <p style={{ color: '#666', marginBottom: 24 }}>Manufacturing Execution System</p>

        {isLoading || hasCode ? (
          <div style={{ color: '#666' }}>
            <div style={{ marginBottom: 8 }}>⏳</div>
            {hasCode ? 'Completing login...' : 'Redirecting to Keycloak...'}
          </div>
        ) : (
          <>
            {error && (
              <div style={{ color: '#c62828', background: '#ffebee', borderRadius: 4, padding: 12, marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}
            <button
              onClick={() => void initKeycloak()}
              style={{
                width: '100%',
                padding: '12px 0',
                background: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Login with Keycloak
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NotFound(): React.ReactElement {
  return <div style={{ padding: 24 }}><h2>404 — Page not found</h2></div>;
}
