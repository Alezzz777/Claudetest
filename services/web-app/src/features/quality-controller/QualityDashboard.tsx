import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qualityApi2, QualityPlanDto, NonConformanceDto } from '../../services/api';
import { useSseStream } from '../../services/realtime';
import { useAuthStore } from '../../store/auth.store';

type Tab = 'record-measurement' | 'non-conformances' | 'quality-plans';

export default function QualityDashboard(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('record-measurement');
  const queryClient = useQueryClient();

  const { isConnected } = useSseStream({
    topics: ['quality.ncr.raised', 'quality.measurement.recorded', 'quality.hold.placed'],
    onEvent: () => {
      void queryClient.invalidateQueries({ queryKey: ['non-conformances'] });
    },
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Quality Dashboard</h1>
        <span style={{ background: isConnected ? '#4caf50' : '#f44336', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12 }}>
          {isConnected ? 'LIVE' : 'RECONNECTING...'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['record-measurement', 'non-conformances', 'quality-plans'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px',
            background: activeTab === tab ? '#1976d2' : '#fff',
            color: activeTab === tab ? '#fff' : '#333',
            border: '1px solid #1976d2',
            borderRadius: 4,
            cursor: 'pointer',
          }}>
            {tab === 'record-measurement' ? 'Record Measurement' : tab === 'non-conformances' ? 'Non-Conformances' : 'Quality Plans'}
          </button>
        ))}
      </div>

      {activeTab === 'record-measurement' && <RecordMeasurementTab />}
      {activeTab === 'non-conformances' && <NonConformancesTab />}
      {activeTab === 'quality-plans' && <QualityPlansTab />}
    </div>
  );
}

function RecordMeasurementTab(): React.ReactElement {
  const { user } = useAuthStore();
  const [orderId, setOrderId] = useState('');
  const [operationId, setOperationId] = useState('');
  const [planId, setPlanId] = useState('');
  const [parameterId, setParameterId] = useState('');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ inSpec: boolean; nonConformanceId?: string } | null>(null);

  const { data: plans } = useQuery({
    queryKey: ['quality-plans'],
    queryFn: () => qualityApi2.listPlans(),
  });

  const selectedPlan = plans?.find((p) => p.planId === planId);

  const mutation = useMutation({
    mutationFn: () => qualityApi2.recordMeasurement({
      orderId,
      operationId,
      planId,
      parameterId,
      value: Number(value),
      measuredBy: user?.userId ?? 'unknown',
    }),
    onSuccess: (data) => setResult(data),
    onError: (e) => setResult(null),
  });

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ marginTop: 0 }}>Record Measurement</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Order ID"><input value={orderId} onChange={(e) => setOrderId(e.target.value)} style={inputStyle} /></Field>
        <Field label="Operation ID"><input value={operationId} onChange={(e) => setOperationId(e.target.value)} style={inputStyle} /></Field>
        <Field label="Quality Plan">
          <select value={planId} onChange={(e) => { setPlanId(e.target.value); setParameterId(''); }} style={inputStyle}>
            <option value="">Select plan...</option>
            {plans?.map((p) => <option key={p.planId} value={p.planId}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Parameter">
          <select value={parameterId} onChange={(e) => setParameterId(e.target.value)} style={inputStyle}>
            <option value="">Select parameter...</option>
            {selectedPlan?.specs.map((s) => <option key={s.parameterId} value={s.parameterId}>{s.name} ({s.uom})</option>)}
          </select>
        </Field>
        <Field label="Value"><input type="number" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} /></Field>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !orderId || !planId || !parameterId || !value}
          style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {mutation.isPending ? 'Recording...' : 'Record Measurement'}
        </button>

        {result !== null && (
          <div style={{
            padding: 16,
            borderRadius: 4,
            background: result.inSpec ? '#e8f5e9' : '#ffebee',
            color: result.inSpec ? '#2e7d32' : '#c62828',
            fontSize: 16,
            fontWeight: 600,
          }}>
            {result.inSpec
              ? '✓ IN SPEC'
              : `✗ OUT OF SPEC — NC opened${result.nonConformanceId ? `: ${result.nonConformanceId}` : ''}`}
          </div>
        )}
      </div>
    </div>
  );
}

function NonConformancesTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [closeTarget, setCloseTarget] = useState<NonConformanceDto | null>(null);

  const { data: ncPage, isLoading } = useQuery({
    queryKey: ['non-conformances', statusFilter],
    queryFn: () => qualityApi2.listNonConformances(statusFilter ? { status: statusFilter } : undefined),
  });

  const ncs = ncPage?.items ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Non-Conformances</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc' }}>
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">CLOSED</option>
          <option value="UNDER_REVIEW">UNDER REVIEW</option>
        </select>
      </div>

      {isLoading && <div>Loading...</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['NC ID', 'Order ID', 'Description', 'Status', 'Raised At', 'Actions'].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ncs.map((nc) => (
            <tr key={nc.ncId}>
              <td style={tdStyle}><code style={{ fontSize: 12 }}>{nc.ncId.slice(0, 8)}</code></td>
              <td style={tdStyle}>{nc.orderId.slice(0, 8)}</td>
              <td style={tdStyle}>{nc.description}</td>
              <td style={tdStyle}><StatusBadge status={nc.status} /></td>
              <td style={tdStyle}>{new Date(nc.raisedAt).toLocaleString()}</td>
              <td style={tdStyle}>
                {nc.status === 'OPEN' && (
                  <button onClick={() => setCloseTarget(nc)} style={{ padding: '4px 10px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                    Close NC
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {ncs.length === 0 && !isLoading && <div style={{ color: '#666', marginTop: 16 }}>No non-conformances found.</div>}

      {closeTarget && (
        <CloseNcModal
          nc={closeTarget}
          onClose={() => setCloseTarget(null)}
          onClosed={() => {
            void queryClient.invalidateQueries({ queryKey: ['non-conformances'] });
            setCloseTarget(null);
          }}
        />
      )}
    </div>
  );
}

function CloseNcModal({ nc, onClose, onClosed }: { nc: NonConformanceDto; onClose: () => void; onClosed: () => void }): React.ReactElement {
  const { user } = useAuthStore();
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => qualityApi2.closeNonConformance(nc.ncId, { closedBy: user?.userId ?? 'unknown', resolution }),
    onSuccess: onClosed,
    onError: (e) => setError(String(e)),
  });

  return (
    <Modal title={`Close NC: ${nc.ncId.slice(0, 8)}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#666' }}>{nc.description}</div>
        <Field label="Resolution">
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !resolution} style={{ padding: '8px 16px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {mutation.isPending ? 'Closing...' : 'Close NC'}
        </button>
      </div>
    </Modal>
  );
}

function QualityPlansTab(): React.ReactElement {
  const { data: plans, isLoading } = useQuery({
    queryKey: ['quality-plans'],
    queryFn: () => qualityApi2.listPlans(),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Quality Plans</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(plans ?? []).map((plan) => (
          <PlanCard key={plan.planId} plan={plan} />
        ))}
        {(plans ?? []).length === 0 && <div style={{ color: '#666' }}>No quality plans found.</div>}
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: QualityPlanDto }): React.ReactElement {
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{plan.name}</strong>
        <StatusBadge status={plan.status} />
      </div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Product: {plan.productCode} | {plan.specs.length} parameters</div>
      {plan.status !== 'ACTIVE' && (
        <button style={{ marginTop: 8, padding: '4px 12px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
          Activate Plan
        </button>
      )}
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

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, string> = {
    OPEN: '#f44336', CLOSED: '#9e9e9e', UNDER_REVIEW: '#ff9800',
    ACTIVE: '#388e3c', INACTIVE: '#9e9e9e', DRAFT: '#ff9800',
  };
  return (
    <span style={{ background: colors[status] ?? '#9e9e9e', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
      {status}
    </span>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 12px', background: '#f5f5f5', border: '1px solid #e0e0e0', textAlign: 'left', fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: 13 };
const inputStyle: React.CSSProperties = { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' };
