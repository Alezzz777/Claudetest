import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productionOrderApi, ProductionOrderDto } from '../../services/api';
import { useSseStream } from '../../services/realtime';
import { useAuthStore } from '../../store/auth.store';

type Tab = 'orders' | 'complete-operation' | 'record-downtime';

export default function OperatorDashboard(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const queryClient = useQueryClient();

  const { data: ordersPage, isLoading, error } = useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => productionOrderApi.listOrders({ status: 'IN_PROGRESS' }),
    refetchInterval: 60_000,
  });

  const { isConnected } = useSseStream({
    topics: ['production.order.started', 'production.order.completed', 'production.oee.measured'],
    onEvent: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const orders = ordersPage?.items ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Operator Dashboard</h1>
        <span style={{
          background: isConnected ? '#4caf50' : '#f44336',
          color: '#fff',
          borderRadius: 4,
          padding: '2px 10px',
          fontSize: 12,
        }}>
          {isConnected ? 'LIVE' : 'RECONNECTING...'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['orders', 'complete-operation', 'record-downtime'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab ? '#1976d2' : '#fff',
              color: activeTab === tab ? '#fff' : '#333',
              border: '1px solid #1976d2',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {tab === 'orders' ? 'My Orders' : tab === 'complete-operation' ? 'Complete Operation' : 'Record Downtime'}
          </button>
        ))}
      </div>

      {activeTab === 'orders' && (
        <OrdersTab orders={orders} isLoading={isLoading} error={error} queryClient={queryClient} />
      )}
      {activeTab === 'complete-operation' && (
        <CompleteOperationTab orders={orders} />
      )}
      {activeTab === 'record-downtime' && (
        <div style={{ padding: 24, background: '#f5f5f5', borderRadius: 4 }}>
          <p style={{ color: '#666' }}>Downtime recording coming soon.</p>
        </div>
      )}
    </div>
  );
}

function OrdersTab({
  orders,
  isLoading,
  error,
  queryClient,
}: {
  orders: ProductionOrderDto[];
  isLoading: boolean;
  error: Error | null;
  queryClient: ReturnType<typeof useQueryClient>;
}): React.ReactElement {
  const { user } = useAuthStore();

  const startMutation = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) =>
      productionOrderApi.startOrder(orderId, user?.userId ?? 'unknown', crypto.randomUUID()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {String(error)}</div>;
  if (orders.length === 0) return <div>No active orders.</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Active Production Orders</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orders.map((order) => (
          <OrderCard key={order.orderId} order={order} onStart={() => startMutation.mutate({ orderId: order.orderId })} isStarting={startMutation.isPending} />
        ))}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onStart,
  isStarting,
}: {
  order: ProductionOrderDto;
  onStart: () => void;
  isStarting: boolean;
}): React.ReactElement {
  const progress = order.plannedQty > 0 ? (order.completedQty / order.plannedQty) * 100 : 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ fontSize: 16 }}>{order.orderNo}</strong>
          <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
            Recipe: {order.recipeId} v{order.recipeVersion} | Work Center: {order.workCenterId}
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
          <span>Progress</span>
          <span>{order.completedQty} / {order.plannedQty} units ({progress.toFixed(1)}%)</span>
        </div>
        <div style={{ height: 8, background: '#e0e0e0', borderRadius: 4 }}>
          <div style={{ height: 8, background: '#1976d2', borderRadius: 4, width: `${Math.min(progress, 100)}%` }} />
        </div>
        {order.scrapQty > 0 && (
          <div style={{ fontSize: 12, color: '#f44336', marginTop: 4 }}>Scrap: {order.scrapQty} units</div>
        )}
      </div>

      {order.status === 'RELEASED' && (
        <button
          onClick={onStart}
          disabled={isStarting}
          style={{
            marginTop: 12,
            padding: '6px 16px',
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: isStarting ? 'not-allowed' : 'pointer',
            opacity: isStarting ? 0.7 : 1,
          }}
        >
          {isStarting ? 'Starting...' : 'Start Order'}
        </button>
      )}
    </div>
  );
}

function CompleteOperationTab({ orders }: { orders: ProductionOrderDto[] }): React.ReactElement {
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState('');
  const [operationId, setOperationId] = useState('');
  const [completedQty, setCompletedQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');
  const [result, setResult] = useState<string | null>(null);
  const { user } = useAuthStore();

  const mutation = useMutation({
    mutationFn: () =>
      productionOrderApi.completeOperation(orderId, operationId, {
        completedBy: user?.userId ?? 'unknown',
        completedQty: Number(completedQty),
        scrapQty: Number(scrapQty),
        correlationId: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setResult('Operation completed successfully.');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => setResult(`Error: ${String(e)}`),
  });

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ marginTop: 0 }}>Complete Operation</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Order</div>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="">Select order...</option>
            {orders.map((o) => (
              <option key={o.orderId} value={o.orderId}>{o.orderNo}</option>
            ))}
          </select>
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Operation ID</div>
          <input value={operationId} onChange={(e) => setOperationId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Completed Qty</div>
          <input type="number" value={completedQty} onChange={(e) => setCompletedQty(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Scrap Qty</div>
          <input type="number" value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </label>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !orderId || !operationId}
          style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {mutation.isPending ? 'Submitting...' : 'Complete Operation'}
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

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, string> = {
    IN_PROGRESS: '#4caf50',
    RELEASED: '#1976d2',
    PAUSED: '#ff9800',
    COMPLETED: '#9e9e9e',
    CANCELLED: '#f44336',
  };
  return (
    <span style={{
      background: colors[status] ?? '#9e9e9e',
      color: '#fff',
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 12,
    }}>
      {status}
    </span>
  );
}
