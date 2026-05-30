import axios, { AxiosInstance } from 'axios';
import { useAuthStore } from '../store/auth.store';

// ─── API client factory ───────────────────────────────────────────────────────

function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  client.interceptors.request.use((config) => {
    const { user } = useAuthStore.getState();
    if (user?.accessToken) {
      config.headers['Authorization'] = `Bearer ${user.accessToken}`;
    }
    return config;
  });

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
export const recipesApi = createApiClient(`${API_GATEWAY}/recipes/api/v1`);

// ─── Common types ─────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Production DTOs ──────────────────────────────────────────────────────────

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

export interface CreateOrderDto {
  orderNo: string;
  recipeId: string;
  recipeVersion: string;
  plannedQty: number;
  workCenterId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
}

export interface CompleteOperationDto {
  completedBy: string;
  completedQty: number;
  scrapQty: number;
  correlationId: string;
}

export interface GenealogyNode {
  orderId: string;
  orderNo: string;
  parentOrderId: string | null;
  children: GenealogyNode[];
}

export interface OeeReadModel {
  workCenterId: string;
  from: string;
  to: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

// ─── Quality DTOs ─────────────────────────────────────────────────────────────

export interface QualityPlanDto {
  planId: string;
  name: string;
  productCode: string;
  status: string;
  specs: QualitySpecDto[];
}

export interface QualitySpecDto {
  parameterId: string;
  name: string;
  uom: string;
  lowerLimit: number | null;
  upperLimit: number | null;
  targetValue: number | null;
}

export interface RecordMeasurementDto {
  orderId: string;
  operationId: string;
  planId: string;
  parameterId: string;
  value: number;
  measuredBy: string;
}

export interface NonConformanceDto {
  ncId: string;
  orderId: string;
  description: string;
  status: string;
  raisedAt: string;
  closedAt: string | null;
  resolution: string | null;
}

// ─── Scheduling DTOs ──────────────────────────────────────────────────────────

export interface ScheduleDto {
  scheduleId: string;
  name: string;
  shiftDate: string;
  status: string;
  entries: ScheduleEntryDto[];
}

export interface ScheduleDetailDto extends ScheduleDto {
  createdAt: string;
  publishedAt: string | null;
}

export interface ScheduleEntryDto {
  entryId: string;
  orderId: string;
  workCenterId: string;
  priority: number;
  plannedStartAt: string;
  plannedEndAt: string;
  status: string;
}

export interface CreateScheduleDto {
  name: string;
  shiftDate: string;
}

export interface InsertOrderDto {
  orderId: string;
  workCenterId: string;
  priority: number;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface RescheduleDto {
  plannedStartAt: string;
  plannedEndAt: string;
}

// ─── Admin DTOs ───────────────────────────────────────────────────────────────

export interface UserDto {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  tenantId: string;
  active: boolean;
}

export interface CreateUserDto {
  email: string;
  displayName: string;
  tenantId: string;
  roles: string[];
}

export interface AssignRoleDto {
  role: string;
  scopeType: string;
  assignedBy: string;
}

// ─── Recipe DTOs ──────────────────────────────────────────────────────────────

export interface RecipeDto {
  recipeId: string;
  productCode: string;
  description: string;
  currentVersion: string | null;
  status: string;
}

export interface RecipeVersionStepDto {
  stepNo: number;
  name: string;
  workCenterId: string;
  durationMinutes: number;
}

export interface CreateRecipeVersionDto {
  version: string;
  steps: RecipeVersionStepDto[];
}

// ─── Production Order API ─────────────────────────────────────────────────────

export const productionOrderApi = {
  listOrders: (params?: { status?: string; workCenterId?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<ProductionOrderDto>> =>
    productionApi.get('/production-orders', { params }).then((r) => r.data as PaginatedResponse<ProductionOrderDto>),

  getOrder: (orderId: string): Promise<ProductionOrderDto> =>
    productionApi.get(`/production-orders/${orderId}`).then((r) => r.data as ProductionOrderDto),

  createOrder: (dto: CreateOrderDto): Promise<{ orderId: string }> =>
    productionApi.post('/production-orders', dto).then((r) => r.data as { orderId: string }),

  releaseOrder: (orderId: string): Promise<void> =>
    productionApi.post(`/production-orders/${orderId}/release`).then(() => undefined),

  startOrder: (orderId: string, operatorId: string, correlationId: string): Promise<void> =>
    productionApi.post(`/production-orders/${orderId}/start`, { operatorId, correlationId }).then(() => undefined),

  completeOrder: (orderId: string, completedBy: string, correlationId: string): Promise<void> =>
    productionApi.post(`/production-orders/${orderId}/complete`, { completedBy, correlationId }).then(() => undefined),

  cancelOrder: (orderId: string, reason: string, cancelledBy: string): Promise<void> =>
    productionApi.post(`/production-orders/${orderId}/cancel`, { reason, cancelledBy }).then(() => undefined),

  completeOperation: (orderId: string, operationId: string, dto: CompleteOperationDto): Promise<void> =>
    productionApi.post(`/production-orders/${orderId}/operations/${operationId}/complete`, dto).then(() => undefined),

  getGenealogy: (orderId: string): Promise<GenealogyNode[]> =>
    productionApi.get(`/production-orders/${orderId}/genealogy`).then((r) => r.data as GenealogyNode[]),

  getOee: (workCenterId: string, from: string, to: string): Promise<OeeReadModel> =>
    productionApi.get('/oee', { params: { workCenterId, from, to } }).then((r) => r.data as OeeReadModel),

  // kept for backward compat
  listActiveOrders: (): Promise<ProductionOrderDto[]> =>
    productionApi.get('/production-orders?status=IN_PROGRESS').then((r) => {
      const d = r.data as PaginatedResponse<ProductionOrderDto> | ProductionOrderDto[];
      return Array.isArray(d) ? d : d.items;
    }),
};

// ─── Quality API ──────────────────────────────────────────────────────────────

export const qualityApi2 = {
  listPlans: (): Promise<QualityPlanDto[]> =>
    qualityApi.get('/quality-plans').then((r) => r.data as QualityPlanDto[]),

  recordMeasurement: (dto: RecordMeasurementDto): Promise<{ inSpec: boolean; nonConformanceId?: string }> =>
    qualityApi.post('/measurements', dto).then((r) => r.data as { inSpec: boolean; nonConformanceId?: string }),

  listNonConformances: (params?: { orderId?: string; status?: string }): Promise<PaginatedResponse<NonConformanceDto>> =>
    qualityApi.get('/non-conformances', { params }).then((r) => r.data as PaginatedResponse<NonConformanceDto>),

  closeNonConformance: (ncId: string, dto: { closedBy: string; resolution: string }): Promise<void> =>
    qualityApi.post(`/non-conformances/${ncId}/close`, dto).then(() => undefined),
};

// ─── Schedule API ─────────────────────────────────────────────────────────────

export const scheduleApi2 = {
  listSchedules: (params?: { shiftDate?: string; status?: string }): Promise<PaginatedResponse<ScheduleDto>> =>
    schedulingApi.get('/schedules', { params }).then((r) => r.data as PaginatedResponse<ScheduleDto>),

  getSchedule: (scheduleId: string): Promise<ScheduleDetailDto> =>
    schedulingApi.get(`/schedules/${scheduleId}`).then((r) => r.data as ScheduleDetailDto),

  createSchedule: (dto: CreateScheduleDto): Promise<{ scheduleId: string }> =>
    schedulingApi.post('/schedules', dto).then((r) => r.data as { scheduleId: string }),

  insertOrder: (scheduleId: string, dto: InsertOrderDto): Promise<void> =>
    schedulingApi.post(`/schedules/${scheduleId}/orders`, dto).then(() => undefined),

  rescheduleEntry: (scheduleId: string, entryId: string, dto: RescheduleDto): Promise<void> =>
    schedulingApi.patch(`/schedules/${scheduleId}/entries/${entryId}`, dto).then(() => undefined),

  publishSchedule: (scheduleId: string): Promise<void> =>
    schedulingApi.post(`/schedules/${scheduleId}/publish`).then(() => undefined),
};

// ─── Admin API ────────────────────────────────────────────────────────────────

export const adminApiClient = {
  listUsers: (params?: { tenantId?: string; page?: number }): Promise<PaginatedResponse<UserDto>> =>
    adminApi.get('/users', { params }).then((r) => r.data as PaginatedResponse<UserDto>),

  createUser: (dto: CreateUserDto): Promise<{ userId: string }> =>
    adminApi.post('/users', dto).then((r) => r.data as { userId: string }),

  deactivateUser: (userId: string): Promise<void> =>
    adminApi.post(`/users/${userId}/deactivate`).then(() => undefined),

  assignRole: (userId: string, dto: AssignRoleDto): Promise<void> =>
    adminApi.post(`/users/${userId}/roles`, dto).then(() => undefined),
};

// ─── Recipe API ───────────────────────────────────────────────────────────────

export const recipeApiClient = {
  listRecipes: (): Promise<RecipeDto[]> =>
    recipesApi.get('/recipes').then((r) => r.data as RecipeDto[]),

  createRecipe: (dto: { productCode: string; description: string }): Promise<{ recipeId: string }> =>
    recipesApi.post('/recipes', dto).then((r) => r.data as { recipeId: string }),

  obsoleteRecipe: (recipeId: string): Promise<void> =>
    recipesApi.post(`/recipes/${recipeId}/obsolete`).then(() => undefined),

  publishVersion: (recipeId: string, dto: CreateRecipeVersionDto): Promise<void> =>
    recipesApi.post(`/recipes/${recipeId}/versions`, dto).then(() => undefined),
};

// ─── Legacy exports (backward compat) ────────────────────────────────────────

export const qualityOrderApi = {
  getInspectionResults: (orderId: string) =>
    qualityApi.get(`/quality-plans/${orderId}/results`),

  recordMeasurement: (planId: string, data: Record<string, unknown>) =>
    qualityApi.post(`/quality-plans/${planId}/measurements`, data),
};

export const scheduleApiClient = {
  getSchedule: (scheduleId: string) =>
    schedulingApi.get(`/schedules/${scheduleId}`),

  insertOrder: (scheduleId: string, data: Record<string, unknown>) =>
    schedulingApi.post(`/schedules/${scheduleId}/orders`, data),
};
