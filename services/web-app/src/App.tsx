import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';

// Lazy-loaded feature modules (code splitting per role)
const OperatorDashboard = lazy(() => import('./features/operator/OperatorDashboard'));
const DispatcherBoard = lazy(() => import('./features/dispatcher/DispatcherBoard'));
const QualityDashboard = lazy(() => import('./features/quality-controller/QualityDashboard'));
const AdminPanel = lazy(() => import('./features/admin/AdminPanel'));

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
  return (
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
  );
}

function LoginPage(): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div>
        <h1>MES Login</h1>
        <p>Redirecting to Keycloak...</p>
      </div>
    </div>
  );
}

function NotFound(): React.ReactElement {
  return <div style={{ padding: 24 }}><h2>404 — Page not found</h2></div>;
}
