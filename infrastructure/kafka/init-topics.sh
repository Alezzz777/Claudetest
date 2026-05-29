#!/usr/bin/env bash
set -euo pipefail

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:9092}"
RETENTION_30D=$((30 * 24 * 60 * 60 * 1000))  # 30 days in ms

echo "Waiting for Kafka broker at ${KAFKA_BOOTSTRAP} ..."
until kafka-topics.sh --bootstrap-server "${KAFKA_BOOTSTRAP}" --list > /dev/null 2>&1; do
  echo "  Kafka not ready yet, retrying in 3s..."
  sleep 3
done
echo "Kafka is ready."

create_topic() {
  local topic="$1"
  local partitions="${2:-6}"
  local retention_ms="${3:-604800000}"  # 7 days default

  kafka-topics.sh \
    --bootstrap-server "${KAFKA_BOOTSTRAP}" \
    --create \
    --if-not-exists \
    --topic "${topic}" \
    --partitions "${partitions}" \
    --replication-factor 1 \
    --config retention.ms="${retention_ms}" \
    && echo "  [OK] ${topic}" \
    || echo "  [SKIP] ${topic} (already exists)"
}

echo "Creating MES topics..."

# Production domain — 12 partitions, 30-day retention
create_topic "mes.production.orders"     12 ${RETENTION_30D}
create_topic "mes.production.operations" 12 ${RETENTION_30D}
create_topic "mes.production.genealogy"  12 ${RETENTION_30D}

# Quality domain
create_topic "mes.quality.measurements"    6 ${RETENTION_30D}
create_topic "mes.quality.nonconformances" 6 ${RETENTION_30D}

# Maintenance domain
create_topic "mes.maintenance.equipment"  6 ${RETENTION_30D}
create_topic "mes.maintenance.workorders" 6 ${RETENTION_30D}

# Inventory domain
create_topic "mes.inventory.lots"      6 ${RETENTION_30D}
create_topic "mes.inventory.movements" 6 ${RETENTION_30D}

# Recipe domain
create_topic "mes.recipe.versions" 6 ${RETENTION_30D}

# Scheduling domain
create_topic "mes.scheduling.orders" 6 ${RETENTION_30D}

# Integration domain
create_topic "mes.integration.telemetry" 12 ${RETENTION_30D}
create_topic "mes.integration.erp"        6 ${RETENTION_30D}

# Admin domain
create_topic "mes.admin.audit" 6 ${RETENTION_30D}

# Unified Namespace / cross-cutting
create_topic "mes.uns.events"     12 ${RETENTION_30D}
create_topic "mes.saga.commands"   6 ${RETENTION_30D}
create_topic "mes.dead.letter"     6 ${RETENTION_30D}

echo "All MES topics created successfully."
