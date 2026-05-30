import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApiClient, UserDto } from '../../services/api';

type AdminTab = 'users' | 'roles' | 'audit';

export default function AdminPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Admin Panel</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['users', 'roles', 'audit'] as AdminTab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px',
            background: activeTab === tab ? '#1976d2' : '#fff',
            color: activeTab === tab ? '#fff' : '#333',
            border: '1px solid #1976d2',
            borderRadius: 4,
            cursor: 'pointer',
          }}>
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
}

function UsersTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showAddUser, setShowAddUser] = useState(false);

  const { data: usersPage, isLoading, error } = useQuery({
    queryKey: ['users', page],
    queryFn: () => adminApiClient.listUsers({ page }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => adminApiClient.deactivateUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {String(error)}</div>;

  const users = usersPage?.items ?? [];
  const total = usersPage?.total ?? 0;
  const pageSize = usersPage?.pageSize ?? 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Users ({total})</h2>
        <button onClick={() => setShowAddUser(true)} style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Add User
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Email', 'Display Name', 'Roles', 'Tenant', 'Status', 'Actions'].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.userId}>
              <td style={tdStyle}>{user.email}</td>
              <td style={tdStyle}>{user.displayName}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {user.roles.map((r) => (
                    <span key={r} style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{r}</span>
                  ))}
                </div>
              </td>
              <td style={tdStyle}>{user.tenantId}</td>
              <td style={tdStyle}>
                <span style={{ background: user.active ? '#e8f5e9' : '#ffebee', color: user.active ? '#2e7d32' : '#c62828', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                  {user.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </td>
              <td style={tdStyle}>
                {user.active && (
                  <button
                    onClick={() => deactivateMutation.mutate(user.userId)}
                    disabled={deactivateMutation.isPending}
                    style={{ padding: '4px 10px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {users.length === 0 && <div style={{ color: '#666', marginTop: 16 }}>No users found.</div>}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle}>← Prev</button>
          <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle}>Next →</button>
        </div>
      )}

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onAdded={() => {
            void queryClient.invalidateQueries({ queryKey: ['users'] });
            setShowAddUser(false);
          }}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }): React.ReactElement {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantId, setTenantId] = useState('default');
  const [rolesInput, setRolesInput] = useState('VIEWER');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => adminApiClient.createUser({
      email,
      displayName,
      tenantId,
      roles: rolesInput.split(',').map((r) => r.trim()).filter(Boolean),
    }),
    onSuccess: onAdded,
    onError: (e) => setError(String(e)),
  });

  return (
    <Modal title="Add User" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
        <Field label="Display Name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Tenant ID"><input value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={inputStyle} /></Field>
        <Field label="Roles (comma-separated)"><input value={rolesInput} onChange={(e) => setRolesInput(e.target.value)} style={inputStyle} placeholder="VIEWER,OPERATOR" /></Field>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !email} style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {mutation.isPending ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </Modal>
  );
}

function RolesTab(): React.ReactElement {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState('');
  const [scopeType, setScopeType] = useState('GLOBAL');
  const [result, setResult] = useState('');

  const { data: usersPage } = useQuery({
    queryKey: ['users', 1],
    queryFn: () => adminApiClient.listUsers({ page: 1 }),
  });

  const users = usersPage?.items ?? [];
  const selectedUser = users.find((u) => u.userId === selectedUserId);

  const mutation = useMutation({
    mutationFn: () => adminApiClient.assignRole(selectedUserId, { role, scopeType, assignedBy: 'admin' }),
    onSuccess: () => setResult(`Role "${role}" assigned successfully.`),
    onError: (e) => setResult(`Error: ${String(e)}`),
  });

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Assign Roles</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Select User">
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={inputStyle}>
            <option value="">Choose user...</option>
            {users.map((u) => <option key={u.userId} value={u.userId}>{u.email}</option>)}
          </select>
        </Field>

        {selectedUser && (
          <div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>Current roles:</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {selectedUser.roles.map((r) => (
                <span key={r} style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{r}</span>
              ))}
            </div>
          </div>
        )}

        <Field label="Role to Assign">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            <option value="">Select role...</option>
            {['VIEWER', 'OPERATOR', 'DISPATCHER', 'QUALITY_CONTROLLER', 'ENGINEER', 'ADMIN'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>

        <Field label="Scope Type">
          <select value={scopeType} onChange={(e) => setScopeType(e.target.value)} style={inputStyle}>
            <option value="GLOBAL">GLOBAL</option>
            <option value="TENANT">TENANT</option>
            <option value="WORK_CENTER">WORK_CENTER</option>
          </select>
        </Field>

        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !selectedUserId || !role} style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {mutation.isPending ? 'Assigning...' : 'Assign Role'}
        </button>

        {result && (
          <div style={{ padding: 12, background: result.startsWith('Error') ? '#ffebee' : '#e8f5e9', borderRadius: 4, color: result.startsWith('Error') ? '#c62828' : '#2e7d32' }}>
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditTab(): React.ReactElement {
  return (
    <div style={{ padding: 24, background: '#f5f5f5', borderRadius: 4, color: '#666' }}>
      <h2 style={{ marginTop: 0 }}>Audit Log</h2>
      <p>Audit log coming soon.</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 360, maxWidth: 480, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label>
      <div style={{ fontSize: 13, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 12px', background: '#f5f5f5', border: '1px solid #e0e0e0', textAlign: 'left', fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: 13 };
const inputStyle: React.CSSProperties = { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' };
const pageBtnStyle: React.CSSProperties = { padding: '6px 12px', background: '#fff', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' };
