# План последовательной реализации MES-EDA

Документ описывает порядок разработки модулей системы, критерии готовности каждого этапа и стратегию тестирования. Работы организованы в семь фаз; каждая фаза завершается проверяемым результатом и набором тестов, после чего начинается следующая.

---

## Принципы плана

- **Vertical slice first**: каждый домен вводится в эксплуатацию сквозным слоем — от события до проекции и API — прежде чем расширяться вширь.
- **Инфраструктура раньше логики**: событийная шина, схемы БД и каркас сервиса стабилизируются до написания бизнес-логики.
- **Тест-пирамида**: unit → integration → contract → e2e. Каждый уровень добавляется в рамках той же фазы, что и соответствующий код.
- **Definition of Done (DoD) фазы**: все тесты зелёные, PR прошёл code review, документация обновлена, артефакт запускается через `docker-compose`.

---

## Фаза 0 — Фундамент (1–2 недели)

Цель: подготовить инфраструктуру и shared-пакет так, чтобы любой сервис мог запуститься и обменяться событием.

### 0.1. Инфраструктура локальной разработки

| Задача | Результат |
|---|---|
| `docker-compose.yml` с Kafka, ZooKeeper, Schema Registry, PostgreSQL×8, Mosquitto, Keycloak | `docker-compose up` поднимает весь стек без ошибок |
| Настройка Kafka: топики, replication factor, retention | Список топиков создан скриптом `infrastructure/kafka/init-topics.sh` |
| Keycloak realm `mes`: роли operator / dispatcher / quality-controller / technologist / admin | Realm экспортирован в `infrastructure/keycloak/realm-mes.json` |
| OTel Collector → Prometheus → Grafana pipeline | Метрика `up` видна в Grafana |
| Mosquitto с TLS и ACL | Подключение с корректным cert проходит, без cert — отклоняется |

**Тесты фазы 0.1:**
```
infrastructure/
  tests/
    kafka-connectivity.test.ts      # KafkaJS produce → consume round-trip
    postgres-connectivity.test.ts   # Prisma.$connect() для каждой БД
    keycloak-token.test.ts          # получение access_token через client_credentials
    mqtt-connectivity.test.ts       # MQTT publish → subscribe round-trip
```
Запуск: `npm run test:infra` (требует запущенного docker-compose).

---

### 0.2. Shared-пакет (`packages/shared`)

| Задача | Результат |
|---|---|
| `EventEnvelope` — CloudEvents-совместимый конверт | Тип экспортирован, фабрика `createEventEnvelope()` |
| `MesEventType` enum — все 45+ типов событий | Компилируется без ошибок |
| `OutboxEntry` interface + `OutboxStatus` enum | |
| `SagaInstance` / `SagaStep` / `SagaCommand` interfaces | |
| Базовый класс `AggregateRoot` с `popUncommittedEvents()` | |
| Базовый класс `IdempotentEventHandler` с проверкой `processed_events` | |

**Тесты фазы 0.2:**
```
packages/shared/src/__tests__/
  event-envelope.spec.ts    # createEventEnvelope() — все поля, уникальность id
  aggregate-root.spec.ts    # apply(), popUncommittedEvents(), версионирование
```
Запуск: `npm run test -w packages/shared`.

---

### 0.3. Каркас доменного сервиса (шаблон)

| Задача | Результат |
|---|---|
| NestJS app с Fastify, CqrsModule, SwaggerModule | GET /health → 200 |
| PrismaService с базовой Prisma schema (event_store, outbox, processed_events, saga_instances) | `prisma migrate dev` проходит |
| KafkaProducerService (idempotent producer) | |
| KafkaConsumerService с роутингом по типу события | |
| OutboxRelay (scheduler, 500 мс) | |
| OpenTelemetry bootstrapping | Span виден в Jaeger |
| JWT Guard (`@UseGuards(JwtAuthGuard)`) | 401 без токена, 200 с валидным |
| Dockerfile multi-stage | Образ собирается, размер < 200 МБ |

**Тесты фазы 0.3:**
```
services/_template/src/__tests__/
  health.e2e-spec.ts             # GET /health → { status: 'ok' }
  jwt-guard.e2e-spec.ts          # 401 без токена, 200 с токеном Keycloak
  outbox-relay.spec.ts           # relay публикует pending записи в Kafka
  kafka-idempotency.spec.ts      # повторная отправка с тем же producerId не дублирует
```

---

## Фаза 1 — Admin-сервис и Schema Registry (1 неделя)

Цель: обеспечить управление пользователями/ролями и регистрацию схем событий — всё остальное зависит от этого.

### Реализация

| Задача | Требование ТЗ |
|---|---|
| `UserAggregate`: создание, назначение роли, деактивация | ПС-АДМ-01 |
| Интеграция с Keycloak Admin REST API: создание пользователей, назначение ролей | ПС-АДМ-01 |
| Регистрация Avro/JSON Schema в Schema Registry при старте каждого сервиса | ПС-АДМ-02 |
| `SchemaCompatibilityService`: BACKWARD_TRANSITIVE проверка при публикации новой версии | ПС-АДМ-02 |
| `AuditLogHandler`: подписка на все топики, запись в audit_log | ПС-АДМ-03 |
| REST API: CRUD пользователей, CRUD ролей, список схем | ПС-АДМ-01, ПС-АДМ-02 |
| Prisma schema: users, roles, permissions, audit_log, schema_versions | |

### Тесты фазы 1

```
services/admin-service/src/__tests__/
  unit/
    user.aggregate.spec.ts           # создание, назначение роли, деактивация; события
    schema-compatibility.spec.ts     # совместимые и несовместимые схемы
  integration/
    user-repository.spec.ts          # сохранение/загрузка UserAggregate из event_store
    keycloak-adapter.spec.ts         # создание пользователя в реальном Keycloak (testcontainer)
    audit-log-handler.spec.ts        # идемпотентность: повтор события → одна запись в audit_log
  e2e/
    users-api.e2e-spec.ts            # POST /users, GET /users/:id, PUT /users/:id/roles
    schema-registry-api.e2e-spec.ts  # POST /schemas, GET /schemas/:subject/versions
```

**DoD фазы 1:** можно создать пользователя через API, получить JWT-токен от Keycloak с нужными ролями, и другой сервис успешно верифицирует этот токен.

---

## Фаза 2 — Recipe-сервис (1 неделя)

Цель: спецификации и рецептуры должны быть готовы раньше production-сервиса, который на них ссылается.

### Реализация

| Задача | Требование ТЗ |
|---|---|
| `RecipeAggregate`: draft → published; версионирование (append-only) | ПС-РЦ-01 |
| ISA-88 модель: `UnitProcedure → Operation → Phase` в полезной нагрузке события | ПС-РЦ-01 |
| `RecipePublishedHandler` → обновление проекции `active_recipe_versions` | ПС-РЦ-02 |
| LRU-кэш активных версий (500 записей, TTL 5 мин) | ПС-РЦ-02 |
| gRPC endpoint `GetActiveRecipe(productCode, version?)` для синхронных запросов | ПС-РЦ-02 |
| REST API: CRUD рецептур, публикация версии, история версий | |
| Prisma schema: recipe_events, recipe_projections, recipe_components | |

### Тесты фазы 2

```
services/recipe-service/src/__tests__/
  unit/
    recipe.aggregate.spec.ts          # draft→published, повторная публикация = новая версия
    recipe-cache.spec.ts              # LRU eviction, TTL expiry
  integration/
    recipe-event-store.spec.ts        # rehydrate агрегата из event_store
    recipe-projection.spec.ts         # RecipePublishedHandler обновляет проекцию
    recipe-grpc.spec.ts               # GetActiveRecipe возвращает последнюю версию
  contract/
    recipe-published-event.contract.ts  # Pact: схема события соответствует Schema Registry
  e2e/
    recipe-api.e2e-spec.ts            # POST /recipes, POST /recipes/:id/publish, GET /recipes/:id/versions
```

---

## Фаза 3 — Production-сервис (2–3 недели)

Цель: ключевой домен системы — приём заданий, диспетчеризация, отслеживание, OEE.

### 3.1. Управление заданиями

| Задача | Требование ТЗ |
|---|---|
| `ProductionOrderAggregate`: Created → Dispatched → InProgress → Completed / Cancelled | ПС-ПР-01 |
| `StartProductionOrderHandler`: rehydrate → apply → persist (event_store + outbox) в одной транзакции | ПС-ПР-01 |
| Оптимистичная блокировка (sequence check) при конкурентной записи | НФТ-НАД-02 |
| `DispatchOperationsHandler`: декомпозиция задания на операции по рецептуре (gRPC к recipe-service) | ПС-ПР-01 |
| `OperationAggregate` | ПС-ПР-02 |
| REST API: создание задания, старт, завершение операции | |

### 3.2. Отслеживание и расход

| Задача | Требование ТЗ |
|---|---|
| `MaterialConsumptionRecordedHandler` → обновление проекции расхода | ПС-ПР-03 |
| Обработчик событий от граничного уровня (`mes.integration.telemetry.*`) | ПС-ПР-02 |
| `ProductionOrderProjection`: витрина заданий в реальном времени | ПС-ПР-05 |

### 3.3. Генеалогия и OEE

| Задача | Требование ТЗ |
|---|---|
| `GenealogyProjection`: связи партий → операции → оборудование → продукция | ПС-ПР-04 |
| `OeeProjection`: расчёт Availability, Performance, Quality из событий | ПС-ПР-05 |
| REST API: GET /orders/:id/genealogy, GET /equipment/:id/oee | |

### Тесты фазы 3

```
services/production-service/src/__tests__/
  unit/
    production-order.aggregate.spec.ts  # все переходы статусов, граничные случаи
    operation.aggregate.spec.ts
    oee-projection.spec.ts              # расчёт по входным событиям
    genealogy-projection.spec.ts        # граф связей строится корректно
  integration/
    event-store-repository.spec.ts      # optimistic lock: конфликт версий → ConflictException
    outbox-publisher.spec.ts            # publish + outbox в одной транзакции; rollback → нет записи в outbox
    start-order-handler.spec.ts         # команда → события → проекция (testcontainers PostgreSQL)
  contract/
    production-order-started.contract.ts   # Pact producer contract
    quality-result-received.contract.ts    # Pact consumer contract (от quality-service)
  e2e/
    production-order-flow.e2e-spec.ts      # создание → старт → завершение операции → OEE обновлён
    genealogy-api.e2e-spec.ts
  performance/
    outbox-relay-throughput.perf.ts        # 1 000 событий/мин, задержка отражения < 5 сек
```

**DoD фазы 3:** производственное задание проходит полный цикл, OEE отображается в витрине, генеалогия восстанавливается из event store.

---

## Фаза 4 — Quality, Inventory, Maintenance (2 недели, параллельно)

Три сервиса независимы от производственного стека — их можно разрабатывать параллельно разными командами.

### 4.1. Quality-сервис

| Задача | Требование ТЗ |
|---|---|
| `QualityPlanAggregate`: план → привязка к спецификации и операции | ПС-КЧ-01 |
| `RecordMeasurementHandler`: валидация по плану, публикация `MeasurementRecorded` | ПС-КЧ-02 |
| `NonConformanceAggregate`: жизненный цикл несоответствия | ПС-КЧ-03 |
| `BatchBlockedEvent` → потребляется production-service для остановки операций | ПС-КЧ-04 |
| TimescaleDB-hypertable для высокочастотных измерений (> 1 000/мин) | ПО-02 |
| REST API: планы контроля, регистрация измерений, несоответствия | |

**Тесты quality-service:**
```
  unit/
    quality-plan.aggregate.spec.ts
    nonconformance.aggregate.spec.ts     # все статусы жизненного цикла
    measurement-validator.spec.ts        # in-spec / out-of-spec / borderline
  integration/
    record-measurement-handler.spec.ts   # идемпотентность: повтор → та же запись
    batch-blocked-saga.spec.ts           # Saga: несоответствие → блокировка партии → событие production
  contract/
    measurement-recorded.contract.ts     # Pact producer
    batch-blocked.contract.ts            # Pact consumer (production-service)
  e2e/
    quality-flow.e2e-spec.ts             # план → измерение → несоответствие → блокировка
  performance/
    measurement-ingestion.perf.ts        # 1 000 измерений/мин без деградации
```

---

### 4.2. Inventory-сервис

| Задача | Требование ТЗ |
|---|---|
| `MaterialLotAggregate`: Event Sourcing, перемещения | ПС-ЗП-01 |
| `ReserveLotHandler` / `ReleaseLotHandler` (компенсация при отмене задания через Saga) | ПС-ЗП-02 |
| `LotMovedEvent` → генеалогия в production-service | ПС-ЗП-03 |
| WIP-остатки: materialized projection | ПС-ЗП-01 |

**Тесты inventory-service:**
```
  unit/
    material-lot.aggregate.spec.ts      # reserve, move, release; double-reserve → ошибка
    wip-projection.spec.ts
  integration/
    reserve-lot-saga.spec.ts            # Saga: резервирование → отмена задания → компенсация
    lot-movement-handler.spec.ts        # идемпотентность
  contract/
    lot-reserved.contract.ts
    lot-moved.contract.ts
  e2e/
    inventory-flow.e2e-spec.ts          # создание партии → резервирование → перемещение → баланс
```

---

### 4.3. Maintenance-сервис

| Задача | Требование ТЗ |
|---|---|
| `EquipmentAggregate`: учёт наработки из телеметрии | ПС-ОБ-01 |
| `WorkOrderAggregate`: создание, планирование, закрытие | ПС-ОБ-02 |
| `EquipmentUnderMaintenanceEvent` / `EquipmentRestoredEvent` | ПС-ОБ-03 |
| Планировщик регламентных работ (cron на основе наработки) | ПС-ОБ-02 |
| REST API: оборудование, заявки на обслуживание | |

**Тесты maintenance-service:**
```
  unit/
    equipment.aggregate.spec.ts          # наработка, порог → создание заявки
    work-order.aggregate.spec.ts
    maintenance-scheduler.spec.ts        # регламент по наработке
  integration/
    equipment-runtime-handler.spec.ts    # идемпотентность телеметрии
    maintenance-scheduling-saga.spec.ts  # вывод в ТО → событие для scheduling-service
  e2e/
    maintenance-flow.e2e-spec.ts
```

---

## Фаза 5 — Scheduling-сервис (1 неделя)

Зависит от: production, maintenance, inventory (подписывается на их события).

| Задача | Требование ТЗ |
|---|---|
| `ProductionScheduleAggregate`: слоты заданий на временной оси | ПС-РАСП-01 |
| `InsertScheduleOrderHandler` | ПС-РАСП-01 |
| Реакция на `EquipmentUnderMaintenanceEvent` → перепланирование | ПС-РАСП-02 |
| Реакция на `OperationCompletedEvent` → сдвиг очереди | ПС-РАСП-02 |
| Защита от параллельного перепланирования (consumer group = 1 активный экземпляр) | ПС-РАСП-02 |
| REST API: текущее расписание, ручная корректировка | |

**Тесты фазы 5:**
```
services/scheduling-service/src/__tests__/
  unit/
    production-schedule.aggregate.spec.ts   # вставка, сдвиг, конфликты слотов
    rescheduler.spec.ts                     # входное событие → новое расписание
  integration/
    reschedule-on-maintenance.spec.ts       # EquipmentUnderMaintenance → расписание обновлено
    concurrent-reschedule.spec.ts           # два события одновременно → одно перепланирование
  e2e/
    scheduling-flow.e2e-spec.ts
```

---

## Фаза 6 — Integration-сервис (2 недели)

Самый сложный по внешним зависимостям модуль.

### 6.1. OPC UA адаптер

| Задача | Требование ТЗ |
|---|---|
| Подключение к OPC UA серверу, подписка на DataChange | ПС-ИНТ-01 |
| Маппинг NodeId → UNS-путь по ISA-95 | НФТ-СТР-04 |
| Reconnect с exponential backoff | НФТ-НАД-01 |
| Публикация в Kafka топик `mes.uns.<site>.<area>.<line>.<device>` | ПС-ИНТ-01 |

**Тесты:**
```
  unit/
    uns-mapper.spec.ts                # NodeId → ISA-95 путь
  integration/
    opcua-adapter.spec.ts             # mock OPC UA server (node-opcua) → события в Kafka
    opcua-reconnect.spec.ts           # обрыв соединения → reconnect → события возобновляются
```

### 6.2. MQTT / Sparkplug B адаптер

| Задача | Требование ТЗ |
|---|---|
| Подписка на `spBv1.0/#`, декодирование Protobuf (sparkplug-b) | ПС-ИНТ-01 |
| Обработка NBIRTH / DBIRTH / NDATA / DDATA / NDEATH / DDEATH | ПС-ИНТ-01 |
| Публикация `DeviceOnlineEvent` / `DeviceOfflineEvent` / `TelemetryReceivedEvent` в Kafka | ПС-ИНТ-01 |
| Контроль присутствия устройств (Sparkplug death certificate) | НФТ-СТР-08 |

**Тесты:**
```
  unit/
    sparkplug-decoder.spec.ts         # NBIRTH / DDATA Protobuf → структурированный объект
  integration/
    sparkplug-adapter.spec.ts         # mock MQTT broker → события Kafka
    device-presence.spec.ts           # NDEATH → DeviceOfflineEvent
```

### 6.3. ERP B2MML адаптер

| Задача | Требование ТЗ |
|---|---|
| Приём `ProductionSchedule` (B2MML XML) от ERP | ПС-ИНТ-02 |
| Публикация `ProductionOrderCreatedEvent` в Kafka | ПС-ИНТ-02 |
| Формирование `ProductionPerformance` XML из событий Kafka | ПС-ИНТ-02 |
| Антикоррупционный слой: внутренние типы ↔ B2MML | ПС-ИНТ-03 |

**Тесты:**
```
  unit/
    b2mml-parser.spec.ts              # валидный XML → ProductionOrder DTO
    b2mml-builder.spec.ts             # PerformanceReport DTO → валидный XML
    anti-corruption-layer.spec.ts     # маппинг внутренних типов ↔ B2MML
  integration/
    erp-webhook.spec.ts               # POST /erp/schedule → ProductionOrderCreated в Kafka
  contract/
    b2mml-schedule.contract.ts        # Pact: структура входящего XML
  e2e/
    erp-roundtrip.e2e-spec.ts         # XML in → события → XML performance report out
```

### 6.4. Edge-режим

| Задача | Требование ТЗ |
|---|---|
| Конфигурация `EDGE_MODE=true`: отключить Kafka, включить локальный PostgreSQL-буфер | НФТ-СТР-05, 07 |
| При восстановлении WAN: replay накопленных событий из буфера в Kafka центра | НФТ-СТР-07 |
| Тест автономной работы | НФТ-СТР-05 |

**Тесты:**
```
  integration/
    edge-offline-buffer.spec.ts       # нет WAN → события буферизируются в локальной PG
    edge-reconnect-replay.spec.ts     # восстановление WAN → все буферизированные события доставлены
```

---

## Фаза 7 — Веб-приложение (2 недели)

### 7.1. Инфраструктура фронтенда

| Задача | Результат |
|---|---|
| Keycloak JS adapter + Zustand auth store | Авторизация работает, токен обновляется автоматически |
| Axios interceptor для Bearer-токена | 401 → автоматический refresh |
| `useSseStream` hook с reconnect | SSE-поток восстанавливается после обрыва |
| React Router с lazy-loaded ролевыми модулями | Диспетчер не видит страниц администратора |
| TanStack Query: invalidation при SSE-событии | Данные обновляются в реальном времени |

### 7.2. Рабочие места

| Роль | Ключевые экраны | Требование ТЗ |
|---|---|---|
| Оператор | Список заданий, карточка операции, ввод расхода, ввод простоя | ПС-UI-03 |
| Диспетчер | Доска расписания (Gantt/Kanban), ручная корректировка | ПС-UI-01 |
| Контролёр качества | Регистрация измерений, список несоответствий, блокировка партий | ПС-UI-01 |
| Технолог | Просмотр и публикация рецептур | ПС-UI-01 |
| Администратор | Управление пользователями, просмотр схем событий, аудит | ПС-UI-01 |

### Тесты фазы 7

```
services/web-app/src/__tests__/
  unit/
    auth.store.spec.ts                # login, logout, token refresh
    use-sse-stream.spec.ts            # reconnect, парсинг событий
    api-client.spec.ts                # Bearer injection, 401-retry
  component/  (Vitest + @testing-library/react)
    OperatorDashboard.spec.tsx        # рендер списка заданий, ввод данных
    DispatcherBoard.spec.tsx          # drag-and-drop операции
    QualityDashboard.spec.tsx         # форма измерения, кнопка блокировки
  e2e/  (Playwright)
    operator-flow.spec.ts             # логин → выбор задания → ввод расхода → обновление витрины
    quality-flow.spec.ts              # логин QC → регистрация несоответствия → партия заблокирована
    realtime-update.spec.ts           # событие из Kafka → данные на экране обновились < 5 сек
    role-access.spec.ts               # оператор не видит страниц администратора (403)
```

---

## Фаза 8 — Нагрузочное тестирование и hardening (1–2 недели)

### 8.1. Нагрузочные тесты

```
tests/performance/
  event-throughput.k6.ts          # 1 000 событий/мин → задержка отражения < 5 сек (НФТ-ПРО-02)
  api-latency.k6.ts               # P95 < 200 мс при 100 RPS на каждый сервис
  kafka-consumer-lag.ts           # lag < 1 000 сообщений при пиковой нагрузке
  oee-calculation.k6.ts           # 10 линий × 60 событий/мин → OEE пересчитывается корректно
```

Инструмент: **k6** (Grafana k6). Результаты публикуются в Grafana dashboard.

### 8.2. Chaos и fault injection

```
tests/chaos/
  kafka-broker-down.spec.ts       # остановка брокера → outbox накапливается → восстановление → доставка
  postgres-restart.spec.ts        # перезапуск PG → сервис переподключается, данные не теряются
  edge-wan-loss.spec.ts           # отключение WAN на edge → буферизация → восстановление → replay
  duplicate-event.spec.ts         # повторная доставка события → идемпотентный handler (ПС-СКВ-04)
  saga-compensation.spec.ts       # сбой на шаге Saga → компенсирующие события выполнены (ПС-СКВ-03)
```

### 8.3. Тесты безопасности

```
tests/security/
  jwt-validation.spec.ts          # невалидная подпись, истёкший токен, неправильный issuer → 401
  rbac-enforcement.spec.ts        # каждый endpoint × каждая роль: матрица ожидаемых кодов
  sql-injection.spec.ts           # Prisma параметризованные запросы не допускают инъекций
  event-schema-validation.spec.ts # невалидное событие отклоняется Schema Registry
```

---

## Фаза 9 — Kubernetes и CI/CD (1 неделя)

| Задача | Результат |
|---|---|
| Helm chart для всех сервисов с HPA (Horizontal Pod Autoscaler) | `helm install mes ./infrastructure/helm/mes-services` — кластер поднимается |
| GitHub Actions: lint → unit → integration → build Docker → push → deploy to staging | PR merge → автодеплой на staging |
| Smoke tests в staging (Playwright, headless) | Базовый сценарий каждой роли проходит |
| Runbook: обновление сервиса без остановки (rolling update), откат | Задокументировано в `docs/runbook.md` |
| Мониторинг SLA: Grafana alerts при lag > 5 000 или availability < 99.9% | Alert срабатывает на тестовом сценарии |

---

## Сводный график

```
Неделя   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16
Фаза 0  ████
Фаза 1      ██
Фаза 2         ██
Фаза 3            ██████
Фаза 4                  ████  (quality ║ inventory ║ maintenance — параллельно)
Фаза 5                        ██
Фаза 6                           ████
Фаза 7                                ████
Фаза 8                                    ████
Фаза 9                                        ██
```

Итого: **16 недель** при одной команде (~4–6 разработчиков). При параллельной работе в фазе 4 реально сократить до 12–13 недель.

---

## Матрица тестового покрытия

| Слой | Инструмент | Запуск | Целевое покрытие |
|---|---|---|---|
| Unit | Vitest / Jest | `npm test` (каждый сервис) | ≥ 80% branches |
| Integration | Vitest + Testcontainers | `npm run test:integration` | все happy path + ключевые error path |
| Contract (Pact) | Pact JS | `npm run test:contract` | все consumer-producer пары |
| E2E API | Supertest + NestJS testing | `npm run test:e2e` | все REST endpoints |
| E2E UI | Playwright | `npm run test:e2e:ui` | сценарии всех ролей |
| Performance | k6 | `npm run test:perf` | НФТ-ПРО-01, НФТ-ПРО-02 |
| Chaos | custom + k6 fault injection | `npm run test:chaos` | НФТ-СТР-05, ПС-СКВ-03, ПС-СКВ-04 |
| Security | Jest + OWASP ZAP | `npm run test:security` | НФТ-БЕЗ-01, НФТ-БЕЗ-02 |

---

## Критерии приёмки (соответствие разделу 7 ТЗ)

| Проверка | Тест | Фаза |
|---|---|---|
| Идемпотентность обработчиков (ПС-СКВ-04) | `duplicate-event.spec.ts` | 8 |
| Компенсации Saga (ПС-СКВ-03) | `saga-compensation.spec.ts` | 8 |
| Восстановление проекций из журнала (НФТ-НАД-02) | `projection-rebuild.spec.ts` | 3 |
| Автономная работа edge при потере WAN (НФТ-СТР-05) | `edge-wan-loss.spec.ts` | 6 |
| Задержка витрины < N сек (НФТ-ПРО-02) | `event-throughput.k6.ts` | 8 |
| Порядок событий в пределах partition key | `kafka-ordering.spec.ts` | 0 |
| RBAC: разграничение доступа по ролям | `rbac-enforcement.spec.ts` | 8 |
| OEE рассчитывается корректно (ПС-ПР-05) | `oee-projection.spec.ts` | 3 |
| Генеалогия восстанавливается полностью (ПС-ПР-04) | `genealogy-projection.spec.ts` | 3 |
| Прослеживаемость партии сырья → готовая продукция | `genealogy-api.e2e-spec.ts` | 3 |
