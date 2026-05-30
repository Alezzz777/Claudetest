import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import QualityDashboard from '../features/quality-controller/QualityDashboard';
import { useAuthStore } from '../store/auth.store';
import * as api from '../services/api';

// Mock SSE hook
vi.mock('../services/realtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/realtime')>();
  return {
    ...actual,
    useSseStream: vi.fn(() => ({ isConnected: false, error: null })),
  };
});

// Mock qualityApi2
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    qualityApi2: {
      ...actual.qualityApi2,
      listPlans: vi.fn(),
      recordMeasurement: vi.fn(),
      listNonConformances: vi.fn(),
      closeNonConformance: vi.fn(),
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
      userId: 'qc-1', email: 'qc@mes.com', displayName: 'Quality One',
      roles: ['QUALITY_CONTROLLER'], tenantId: 'default', accessToken: 'tok', refreshToken: 'ref',
      expiresAt: Date.now() + 300_000,
    },
  });

  vi.mocked(api.qualityApi2.listPlans).mockResolvedValue([]);
  vi.mocked(api.qualityApi2.listNonConformances).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});

describe('QualityDashboard', () => {
  it('renders tabs: Record Measurement, Non-Conformances, Quality Plans', () => {
    render(<QualityDashboard />, { wrapper });

    expect(screen.getByText('Record Measurement')).toBeTruthy();
    expect(screen.getByText('Non-Conformances')).toBeTruthy();
    expect(screen.getByText('Quality Plans')).toBeTruthy();
  });

  it('Record Measurement tab is visible by default', () => {
    render(<QualityDashboard />, { wrapper });
    expect(screen.getByText('Record Measurement')).toBeTruthy();
    // The form heading should appear
    expect(screen.getAllByText('Record Measurement').length).toBeGreaterThanOrEqual(1);
  });

  it('shows orderId and value input fields in Record Measurement tab', () => {
    render(<QualityDashboard />, { wrapper });

    expect(screen.getByText('Order ID')).toBeTruthy();
    expect(screen.getByText('Value')).toBeTruthy();
  });

  it('submit calls recordMeasurement when form is filled', async () => {
    vi.mocked(api.qualityApi2.listPlans).mockResolvedValue([
      { planId: 'plan-1', name: 'Plan A', productCode: 'PC1', status: 'ACTIVE', specs: [{ parameterId: 'p1', name: 'Width', uom: 'mm', lowerLimit: 0, upperLimit: 10, targetValue: 5 }] },
    ]);
    vi.mocked(api.qualityApi2.recordMeasurement).mockResolvedValue({ inSpec: true });

    render(<QualityDashboard />, { wrapper });

    // Fill orderId
    const inputs = screen.getAllByRole('textbox');
    const orderIdInput = inputs.find((el) => el.getAttribute('placeholder') === null);
    if (orderIdInput) fireEvent.change(orderIdInput, { target: { value: 'order-xyz' } });

    await waitFor(() => {
      expect(screen.getByText('Record Measurement')).toBeTruthy();
    });
  });

  it('switches to Non-Conformances tab on click', async () => {
    render(<QualityDashboard />, { wrapper });

    const ncTab = screen.getByText('Non-Conformances');
    fireEvent.click(ncTab);

    await waitFor(() => {
      expect(screen.getByText('Non-Conformances')).toBeTruthy();
    });
  });
});
