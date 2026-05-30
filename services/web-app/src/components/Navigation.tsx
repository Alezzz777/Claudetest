import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

interface NavItem {
  path: string;
  label: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { path: '/operator', label: 'Operator', roles: ['OPERATOR', 'ENGINEER', 'ADMIN'] },
  { path: '/dispatcher', label: 'Dispatcher', roles: ['DISPATCHER', 'ENGINEER', 'ADMIN'] },
  { path: '/quality', label: 'Quality', roles: ['QUALITY_CONTROLLER', 'ENGINEER', 'ADMIN'] },
  { path: '/technologist', label: 'Technologist', roles: ['ENGINEER', 'ADMIN'] },
  { path: '/admin', label: 'Admin', roles: ['ADMIN'] },
];

export default function Navigation(): React.ReactElement {
  const { user, logout } = useAuthStore();

  if (!user) return <></>;

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => user.roles.includes(r)),
  );

  return (
    <nav style={{
      width: 200,
      minHeight: '100vh',
      background: '#f5f5f5',
      borderRight: '1px solid #e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ padding: '20px 16px', borderBottom: '1px solid #e0e0e0' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#1976d2' }}>MES</span>
      </div>

      <div style={{ flex: 1, padding: '8px 0' }}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'block',
              padding: '10px 16px',
              color: isActive ? '#1976d2' : '#333',
              background: isActive ? '#e3f2fd' : 'transparent',
              textDecoration: 'none',
              fontWeight: isActive ? 600 : 400,
              borderLeft: isActive ? '3px solid #1976d2' : '3px solid transparent',
              fontSize: 14,
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div style={{ padding: 16, borderTop: '1px solid #e0e0e0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {user.roles.map((r) => (
            <span key={r} style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>{r}</span>
          ))}
        </div>
        <button
          onClick={logout}
          style={{ width: '100%', padding: '6px 0', background: '#fff', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: '#333' }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
