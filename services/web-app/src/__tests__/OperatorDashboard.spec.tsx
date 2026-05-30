import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import OperatorDashboard from '../features/operator/OperatorDashboard';
import { useAuthStore } from '../store/auth.store';
import * as api from '../services/api';
import * as realtime from '../services/realtime';

// Mock the SSE hook
vi.mock('../services/realtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/realtime')>();
  return {
    ...actual,
    useSseStream: vi.fn(() => ({ isConnected: false, error: null })),
  };
});

// Mock productionOrderApi
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    productionOrderApi: {
      ...actual.productionOrderApi,
      listOrders: vi.fn(),
      startOrder: vi.fn(),
      completeOperation: vi.fn(),
    },
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useAuthStore.setState({
    user: {
      userId: 'op-1', email: 'op@mes.com', displayName: 'Operator One',
      roles: ['OPERATOR'], tenantId: 'default', accessToken: 'tok', refreshToken: 'ref',
      expiresAt: Date.now() + 300_000,
    },
  });
});

describe('OperatorDashboard', () => {
  it('renders order cards with orderNo', async () => {
    vi.mocked(api.productionOrderApi.listOrders).mockResolvedValue({
      items: [
        { orderId: 'o1', orderNo: 'ORD-001', recipeId: 'r1', recipeVersion: '1.0', status: 'IN_PROGRESS', plannedQty: 100, completedQty: 50, scrapQty: 0, workCenterId: 'WC-1', scheduledStartAt: '', scheduledEndAt: '', actualStartAt: null, actualEndAt: null, oee: null },
        { orderId: 'o2', orderNo: 'ORD-002', recipeId: 'r2', recipeVersion: '2.0', status: 'IN_PROGRESS', plannedQty: 200, completedQty: 80, scrapQty: 5, workCenterId: 'WC-2', scheduledStartAt: '', scheduledEndAt: '', actualStartAt: null, actualEndAt: null, oee: null },
      ],
      total: 2, page: 1, pageSize: 20,
    });

    render(<OperatorDashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('ORD-001')).toBeTruthy();
      expect(screen.getByText('ORD-002')).toBeTruthy();
    });
  });

  it('shows Start Order button for RELEASED orders', async () => {
    vi.mocked(api.productionOrderApi.listOrders).mockResolvedValue({
      items: [
        { orderId: 'o1', orderNo: 'ORD-001', recipeId: 'r1', recipeVersion: '1.0', status: 'RELEASED', plannedQty: 100, completedQty: 0, scrapQty: 0, workCenterId: 'WC-1', scheduledStartAt: '', scheduledEndAt: '', actualStartAt: null, actualEndAt: null, oee: null },
      ],
      total: 1, page: 1, pageSize: 20,
    });

    vi.mocked(api.productionOrderApi.startOrder).mockResolvedValue(undefined);

    render(<OperatorDashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Start Order')).toBeTruthy();
    });
  });

  it('calls startOrder mutation when Start Order is clicked', async () => {
    vi.mocked(api.productionOrderApi.listOrders).mockResolvedValue({
      items: [
        { orderId: 'o1', orderNo: 'ORD-001', recipeId: 'r1', recipeVersion: '1.0', status: 'RELEASED', plannedQty: 100, completedQty: 0, scrapQty: 0, workCenterId: 'WC-1', scheduledStartAt: '', scheduledEndAt: '', actualStartAt: null, actualEndAt: null, oee: null },
      ],
      total: 1, page: 1, pageSize: 20,
    });

    vi.mocked(api.productionOrderApi.startOrder).mockResolvedValue(undefined);

    render(<OperatorDashboard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Start Order')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Start Order'));

    await waitFor(() => {
      expect(api.productionOrderApi.startOrder).toHaveBeenCalledWith('o1', 'op-1', expect.any(String));
    });
  });

  it('shows tabs: My Orders, Complete Operation, Record Downtime', async () => {
    vi.mocked(api.productionOrderApi.listOrders).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    render(<OperatorDashboard />, { wrapper });

    expect(screen.getByText('My Orders')).toBeTruthy();
    expect(screen.getByText('Complete Operation')).toBeTruthy();
    expect(screen.getByText('Record Downtime')).toBeTruthy();
  });
});
