import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';

type AdminTab = 'users' | 'audit' | 'schema-registry' | 'system';

/**
 * Admin Panel — user management, RBAC, audit log viewer, schema registry.
 */
export default function AdminPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  return (
    <div className="admin-panel">
      <header><h1>Admin Panel</h1></header>

      <nav className="tab-bar">
        {(['users', 'audit', 'schema-registry', 'system'] as AdminTab[]).map((tab) => (
          <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab.replace('-', ' ').toUpperCase()}
          </button>
        ))}
      </nav>

      <div className="tab-content">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'audit' && <AuditLogViewer />}
        {activeTab === 'schema-registry' && <SchemaRegistry />}
        {activeTab === 'system' && <SystemInfo />}
      </div>
    </div>
  );
}

function UserManagement(): React.ReactElement {
  return (
    <div>
      <h2>User Management</h2>
      <p>Users are provisioned in Keycloak. This panel shows MES-specific role assignments.</p>
      <button onClick={() => window.open(`${import.meta.env['VITE_KEYCLOAK_URL']}/admin`, '_blank')}>
        Open Keycloak Admin Console
      </button>
    </div>
  );
}

function AuditLogViewer(): React.ReactElement {
  return (
    <div>
      <h2>Audit Log</h2>
      <p>Cross-service immutable audit trail from admin-service.</p>
    </div>
  );
}

function SchemaRegistry(): React.ReactElement {
  return (
    <div>
      <h2>Event Schema Registry</h2>
      <p>Confluent Schema Registry at <a href="http://localhost:8081" target="_blank" rel="noreferrer">http://localhost:8081</a></p>
    </div>
  );
}

function SystemInfo(): React.ReactElement {
  return (
    <div>
      <h2>System Information</h2>
      <ul>
        <li>Kafka UI: <a href="http://localhost:8090" target="_blank" rel="noreferrer">http://localhost:8090</a></li>
        <li>Grafana: <a href="http://localhost:3001" target="_blank" rel="noreferrer">http://localhost:3001</a></li>
        <li>Prometheus: <a href="http://localhost:9090" target="_blank" rel="noreferrer">http://localhost:9090</a></li>
        <li>Keycloak: <a href="http://localhost:8080" target="_blank" rel="noreferrer">http://localhost:8080</a></li>
      </ul>
    </div>
  );
}
