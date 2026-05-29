import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productionOrderApi, ProductionOrderDto } from '../../services/api';
import { useSseStream } from '../../services/realtime';

/**
 * Operator Dashboard — real-time view of active production orders and OEE.
 * Subscribes to SSE for live updates: order starts, completions, OEE measures.
 */
export default function OperatorDashboard(): React.ReactElement {
  const [liveOrders, setLiveOrders] = useState<ProductionOrderDto[]>([]);

  const { data: orders, refetch } = useQuery({
    queryKey: ['active-orders'],
    queryFn: () => productionOrderApi.listActiveOrders().then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Real-time updates via SSE
  const { isConnected } = useSseStream({
    topics: ['production.order.started', 'production.order.completed', 'production.oee.measured'],
    onEvent: (event) => {
      if (event.type === 'production.order.started' || event.type === 'production.order.completed') {
        void refetch(); // refresh order list
      }
    },
  });

  return (
    <div className="operator-dashboard">
      <header>
        <h1>Operator Dashboard</h1>
        <span className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'LIVE' : 'RECONNECTING...'}
        </span>
      </header>

      <section className="active-orders">
        <h2>Active Production Orders</h2>
        <table>
          <thead>
            <tr>
              <th>Order No.</th>
              <th>Recipe</th>
              <th>Work Center</th>
              <th>Qty Plan / Actual</th>
              <th>Status</th>
              <th>OEE</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {orders?.map((order) => (
              <OrderRow key={order.orderId} order={order} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function OrderRow({ order }: { order: ProductionOrderDto }): React.ReactElement {
  const progress = order.plannedQty > 0 ? (order.completedQty / order.plannedQty) * 100 : 0;

  return (
    <tr>
      <td><strong>{order.orderNo}</strong></td>
      <td>{order.recipeId} v{order.recipeVersion}</td>
      <td>{order.workCenterId}</td>
      <td>
        <progress value={progress} max={100} />
        {order.completedQty} / {order.plannedQty}
      </td>
      <td><StatusBadge status={order.status} /></td>
      <td>{order.oee !== null ? `${(order.oee * 100).toFixed(1)}%` : '—'}</td>
      <td>{order.actualStartAt ? new Date(order.actualStartAt).toLocaleTimeString() : '—'}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, string> = {
    IN_PROGRESS: '#4CAF50', PAUSED: '#FF9800', COMPLETED: '#2196F3', CANCELLED: '#F44336',
  };
  return (
    <span style={{ background: colors[status] ?? '#9E9E9E', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
      {status}
    </span>
  );
}
