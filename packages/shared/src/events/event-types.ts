/**
 * Canonical domain event type names for the MES platform.
 * Format: <domain>.<aggregate>.<past-tense-verb>
 *
 * These strings are used as:
 *  1. Kafka topic suffixes (topic = event type)
 *  2. CloudEvents "type" field
 *  3. Schema Registry subject names
 *  4. AsyncAPI operation IDs
 */
export enum MesEventType {
  // ─── Production Domain ───────────────────────────────────────────────────
  PRODUCTION_ORDER_CREATED        = 'production.order.created',
  PRODUCTION_ORDER_RELEASED       = 'production.order.released',
  PRODUCTION_ORDER_STARTED        = 'production.order.started',
  PRODUCTION_ORDER_PAUSED         = 'production.order.paused',
  PRODUCTION_ORDER_COMPLETED      = 'production.order.completed',
  PRODUCTION_ORDER_CANCELLED      = 'production.order.cancelled',
  PRODUCTION_OPERATION_STARTED    = 'production.operation.started',
  PRODUCTION_OPERATION_COMPLETED  = 'production.operation.completed',
  PRODUCTION_OEE_MEASURED         = 'production.oee.measured',
  PRODUCTION_GENEALOGY_LINKED     = 'production.genealogy.linked',

  // ─── Quality Domain ──────────────────────────────────────────────────────
  QUALITY_PLAN_CREATED            = 'quality.plan.created',
  QUALITY_PLAN_ACTIVATED          = 'quality.plan.activated',
  QUALITY_INSPECTION_TRIGGERED    = 'quality.inspection.triggered',
  QUALITY_MEASUREMENT_RECORDED    = 'quality.measurement.recorded',
  QUALITY_NCR_RAISED              = 'quality.ncr.raised',
  QUALITY_NCR_DISPOSITIONED       = 'quality.ncr.dispositioned',
  QUALITY_HOLD_PLACED             = 'quality.hold.placed',
  QUALITY_HOLD_RELEASED           = 'quality.hold.released',

  // ─── Maintenance Domain ──────────────────────────────────────────────────
  MAINTENANCE_EQUIPMENT_RUNTIME_UPDATED = 'maintenance.equipment.runtime-updated',
  MAINTENANCE_WORK_ORDER_CREATED   = 'maintenance.work-order.created',
  MAINTENANCE_WORK_ORDER_ASSIGNED  = 'maintenance.work-order.assigned',
  MAINTENANCE_WORK_ORDER_COMPLETED = 'maintenance.work-order.completed',
  MAINTENANCE_PM_SCHEDULED         = 'maintenance.pm.scheduled',
  MAINTENANCE_PM_OVERDUE           = 'maintenance.pm.overdue',
  MAINTENANCE_EQUIPMENT_FAILED     = 'maintenance.equipment.failed',

  // ─── Inventory Domain ────────────────────────────────────────────────────
  INVENTORY_LOT_CREATED           = 'inventory.lot.created',
  INVENTORY_LOT_MOVED             = 'inventory.lot.moved',
  INVENTORY_LOT_CONSUMED          = 'inventory.lot.consumed',
  INVENTORY_LOT_SCRAPPED          = 'inventory.lot.scrapped',
  INVENTORY_RESERVATION_CREATED   = 'inventory.reservation.created',
  INVENTORY_RESERVATION_FULFILLED = 'inventory.reservation.fulfilled',
  INVENTORY_RESERVATION_CANCELLED = 'inventory.reservation.cancelled',
  INVENTORY_ADJUSTMENT_POSTED     = 'inventory.adjustment.posted',

  // ─── Recipe Domain ───────────────────────────────────────────────────────
  RECIPE_CREATED                  = 'recipe.recipe.created',
  RECIPE_VERSION_PUBLISHED        = 'recipe.recipe.version-published',
  RECIPE_APPROVED                 = 'recipe.recipe.approved',
  RECIPE_OBSOLETED                = 'recipe.recipe.obsoleted',
  RECIPE_DEVIATION_ALLOWED        = 'recipe.recipe.deviation-allowed',

  // ─── Scheduling Domain ───────────────────────────────────────────────────
  SCHEDULE_CREATED                = 'scheduling.schedule.created',
  SCHEDULE_PUBLISHED              = 'scheduling.schedule.published',
  SCHEDULE_ORDER_INSERTED         = 'scheduling.schedule.order-inserted',
  SCHEDULE_ORDER_RESCHEDULED      = 'scheduling.schedule.order-rescheduled',
  SCHEDULE_REPLANNED              = 'scheduling.schedule.replanned',

  // ─── Integration Domain ──────────────────────────────────────────────────
  INTEGRATION_DEVICE_ONLINE       = 'integration.device.online',
  INTEGRATION_DEVICE_OFFLINE      = 'integration.device.offline',
  INTEGRATION_TELEMETRY_RECEIVED  = 'integration.telemetry.received',
  INTEGRATION_ERP_ORDER_RECEIVED  = 'integration.erp.order-received',
  INTEGRATION_ERP_SYNC_COMPLETED  = 'integration.erp.sync-completed',

  // ─── Admin Domain ────────────────────────────────────────────────────────
  ADMIN_USER_CREATED              = 'admin.user.created',
  ADMIN_USER_ROLE_ASSIGNED        = 'admin.user.role-assigned',
  ADMIN_SCHEMA_REGISTERED         = 'admin.schema.registered',
  ADMIN_AUDIT_LOG_WRITTEN         = 'admin.audit.log-written',
}

/** Kafka topic for a given event type (topic = event type string) */
export function topicForEventType(type: MesEventType): string {
  return type;
}

/** Domain prefix extracted from event type, e.g. "production" */
export function domainOf(type: MesEventType): string {
  return type.split('.')[0] ?? 'unknown';
}
