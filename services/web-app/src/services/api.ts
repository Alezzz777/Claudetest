import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { useAuthStore } from '../store/auth.store';

// ─── API client factory ───────────────────────────────────────────────────────

function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  // Attach Bearer token to every request
  client.interceptors.request.use((config) => {
    const { user } = useAuthStore.getState();
    if (user?.accessToken) {
      config.headers['Authorization'] = `Bearer ${user.accessToken}`;
    }
    return config;
  });

  // Handle 401 by triggering token refresh
  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401) {
        await useAuthStore.getState().refreshToken();
      }
      return Promise.reject(err);
    },
  );

  return client;
}

// ─── Service-specific clients ─────────────────────────────────────────────────

const API_GATEWAY = import.meta.env['VITE_API_GATEWAY_URL'] ?? 'http://localhost:3000';

export const productionApi = createApiClient(`${API_GATEWAY}/production/api/v1`);
export const qualityApi = createApiClient(`${API_GATEWAY}/quality/api/v1`);
export const maintenanceApi = createApiClient(`${API_GATEWAY}/maintenance/api/v1`);
export const inventoryApi = createApiClient(`${API_GATEWAY}/inventory/api/v1`);
export const schedulingApi = createApiClient(`${API_GATEWAY}/scheduling/api/v1`);
export const integrationApi = createApiClient(`${API_GATEWAY}/integration/api/v1`);
export const adminApi = createApiClient(`${API_GATEWAY}/admin/api/v1`);

// ─── Production Order APIs ────────────────────────────────────────────────────

export interface ProductionOrderDto {
  orderId: string;
  orderNo: string;
  recipeId: string;
  recipeVersion: string;
  status: string;
  plannedQty: number;
  completedQty: number;
  scrapQty: number;
  workCenterId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  oee: number | null;
}

export const productionOrderApi = {
  getOrder: (orderId: string): Promise<AxiosResponse<ProductionOrderDto>> =>
    productionApi.get(`/production-orders/${orderId}`),

  startOrder: (orderId: string, operatorId: string, correlationId: string): Promise<AxiosResponse<void>> =>
    productionApi.post(`/production-orders/${orderId}/start`, { operatorId, correlationId }),

  listActiveOrders: (): Promise<AxiosResponse<ProductionOrderDto[]>> =>
    productionApi.get('/production-orders?status=IN_PROGRESS'),
};

// ─── Quality APIs ─────────────────────────────────────────────────────────────

export const qualityOrderApi = {
  getInspectionResults: (orderId: string) =>
    qualityApi.get(`/quality-plans/${orderId}/results`),

  recordMeasurement: (planId: string, data: Record<string, unknown>) =>
    qualityApi.post(`/quality-plans/${planId}/measurements`, data),
};

// ─── Schedule APIs ────────────────────────────────────────────────────────────

export const scheduleApiClient = {
  getSchedule: (scheduleId: string) =>
    schedulingApi.get(`/schedules/${scheduleId}`),

  insertOrder: (scheduleId: string, data: Record<string, unknown>) =>
    schedulingApi.post(`/schedules/${scheduleId}/orders`, data),
};
