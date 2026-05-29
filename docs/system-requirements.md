# Системные требования MES-EDA

Документ описывает требования к вычислительным ресурсам, программному окружению и сетевой инфраструктуре для каждого элемента системы в трёх контурах: **локальная разработка** (docker-compose), **производственный кластер** (Kubernetes, центральный контур), **граничный уровень** (edge-узел на производственном участке).

---

## 1. Инфраструктурные компоненты

### 1.1. Apache Kafka + ZooKeeper (событийная шина)

| Параметр | Dev (docker-compose) | Production (Kubernetes) |
|---|---|---|
| Образ | `confluentinc/cp-kafka:7.6.0` | Strimzi Kafka Operator или Confluent Platform |
| Кол-во брокеров | 1 | минимум 3 (для RF=3) |
| CPU | 1 vCPU | 4 vCPU на брокер |
| RAM | 2 ГБ | 8–16 ГБ на брокер (heap JVM: 6 ГБ) |
| Диск | любой (данные в томе Docker) | SSD/NVMe, минимум 500 ГБ на брокер; RAID-10 |
| Сеть | bridge-сеть Docker | выделенный сегмент, < 1 мс RTT между брокерами |
| Порты | 9092 (внутренний), 29092 (хост) | 9092 (inter-broker), 9093 (TLS клиенты) |
| Retention | 7 суток (`log.retention.hours=168`) | 30+ суток для Event Sourcing топиков |
| Партиции | авто-создание | задаются явно; ≥ 12 партиций для высоконагруженных топиков |
| Репликация | RF=1 (dev) | RF=3, min.insync.replicas=2 |
| ZooKeeper | 1 нода | 3 ноды (кворум), 1 vCPU / 2 ГБ RAM каждая |

**Версия Java:** OpenJDK 17 LTS (встроена в образ Confluent).  
**Зависимости:** ZooKeeper 3.8+ (или KRaft-режим для Kafka 3.7+, без ZooKeeper).

---

### 1.2. Schema Registry (реестр схем событий)

| Параметр | Dev | Production |
|---|---|---|
| Образ | `confluentinc/cp-schema-registry:7.6.0` | то же, за балансировщиком |
| CPU | 0.5 vCPU | 2 vCPU |
| RAM | 512 МБ | 2 ГБ |
| Диск | нет постоянного хранилища (данные в Kafka) | нет |
| Порт | 8081 | 8081 (внутренний), закрыт снаружи |
| Совместимость схем | — | настроить `BACKWARD_TRANSITIVE` для всех subject |
| Зависимости | Kafka | Kafka |

---

### 1.3. MQTT-брокер Eclipse Mosquitto (интеграция с АСУ ТП / edge)

| Параметр | Dev | Production (центр) | Edge-узел |
|---|---|---|---|
| Образ | `eclipse-mosquitto:2.0` | то же или EMQX Enterprise | то же |
| CPU | 0.25 vCPU | 2 vCPU | 0.5 vCPU |
| RAM | 256 МБ | 2 ГБ | 512 МБ |
| Диск | том для persistance | SSD 50 ГБ | SD/eMMC 20 ГБ |
| Порт MQTT | 1883 (plain) | 8883 (TLS) | 1883 (локальный) |
| Порт WebSocket | 9001 | 8084 (TLS WS) | — |
| Протокол | MQTT 3.1.1 / 5.0 | MQTT 5.0 + Sparkplug B | MQTT 5.0 + Sparkplug B |
| Аутентификация | без auth (dev) | mTLS + ACL по топикам | mTLS |
| Буферизация (edge) | — | — | persistent queue до 10 ГБ при потере связи |

---

### 1.4. PostgreSQL (хранилище каждого доменного сервиса)

Каждый из 8 сервисов имеет **собственный** экземпляр PostgreSQL. Ниже — требования на один экземпляр.

| Параметр | Dev | Production |
|---|---|---|
| Версия | 16 LTS (`postgres:16-alpine`) | 16 LTS |
| CPU | 0.5 vCPU | 2–4 vCPU (production-service — до 8) |
| RAM | 512 МБ | 4–8 ГБ (`shared_buffers` = 25% RAM) |
| Диск | том Docker | SSD, минимум 200 ГБ; для Event Store — 1+ ТБ |
| IOPS | — | ≥ 3 000 IOPS random write |
| Репликация | нет | streaming replication, 1 standby |
| Резервное копирование | нет | WAL archiving + базовый бэкап ежесуточно (pg_basebackup / pgBackRest) |
| Расширения | — | `uuid-ossp`, `pg_stat_statements`; при необходимости `timescaledb` для телеметрии |
| Порты (dev, хостовые) | 5432–5439 (по одному на сервис) | внутренний 5432, снаружи не доступен |

**Всего PostgreSQL-инстансов:** 8 (production, quality, maintenance, inventory, recipe, scheduling, integration, admin).

---

### 1.5. Keycloak (OAuth 2.0 / OIDC, Identity Provider)

| Параметр | Dev | Production |
|---|---|---|
| Образ | `quay.io/keycloak/keycloak:24.0` | то же |
| Режим | `start-dev` (in-memory DB) | `start` с внешней PostgreSQL |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 ГБ | 2–4 ГБ |
| Диск | нет (dev-mem) | PostgreSQL для хранения realm (отдельная БД) |
| Порт | 8080 | 8443 (HTTPS) |
| Высокая доступность | нет | кластер Infinispan (2+ ноды), внешняя PostgreSQL |
| Зависимости | нет | PostgreSQL 15+ |

---

### 1.6. OpenTelemetry Collector

| Параметр | Dev | Production |
|---|---|---|
| Образ | `otel/opentelemetry-collector-contrib:0.97.0` | то же |
| CPU | 0.5 vCPU | 2 vCPU |
| RAM | 512 МБ | 2 ГБ |
| Порты | 4317 (OTLP gRPC), 4318 (OTLP HTTP), 9464 (Prometheus) | те же (внутренние) |
| Экспортеры | Prometheus, stdout | Prometheus, Jaeger/Tempo (трассировка), Loki (логи) |

---

### 1.7. Prometheus

| Параметр | Dev | Production |
|---|---|---|
| Образ | `prom/prometheus:v2.51.0` | то же или Thanos для долгосрочного хранения |
| CPU | 0.5 vCPU | 2 vCPU |
| RAM | 1 ГБ | 4–8 ГБ |
| Диск | том Docker | SSD 200+ ГБ (retention 90 дней) |
| Порт | 9090 | 9090 (внутренний) |

---

### 1.8. Grafana

| Параметр | Dev | Production |
|---|---|---|
| Образ | `grafana/grafana:10.4.0` | то же |
| CPU | 0.25 vCPU | 1 vCPU |
| RAM | 256 МБ | 1 ГБ |
| Диск | том Docker | PostgreSQL или SQLite для dashboard storage |
| Порт | 3001 (хост) → 3000 | 3000 (внутренний), Ingress на HTTPS |

---

## 2. Доменные сервисы (Node.js / NestJS)

Все сервисы разработаны на **Node.js LTS (22.x)**, **TypeScript 5.x**, **NestJS 10.x**, **Fastify**.  
Упакованы в Docker-контейнеры, деплоятся в Kubernetes.

Общие зависимости каждого сервиса:
- Node.js 22 LTS
- Prisma 5.x (ORM + миграции)
- KafkaJS (Kafka producer/consumer)
- `@opentelemetry/sdk-node` (метрики, трассировка, логи)
- `@nestjs/passport` + `passport-jwt` (проверка JWT от Keycloak)

### 2.1. production-service

Наиболее нагруженный сервис: Event Sourcing, Outbox relay, OEE-расчёты.

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.5 vCPU | 2–4 vCPU |
| RAM | 512 МБ | 1–2 ГБ |
| Реплики | 1 | 2–4 (горизонтальное масштабирование) |
| PostgreSQL | pg-production (5432) | отдельный PG-кластер |
| Порт HTTP | 3010 | внутренний, через Ingress |
| Kafka topics (write) | `mes.production.*` | то же |
| Kafka topics (read) | `mes.quality.*`, `mes.scheduling.*`, `mes.inventory.*` | то же |
| Event Store размер | — | ~10 ГБ/год при 100 событий/мин |

**Особые требования:**
- Оптимистичная блокировка (sequence-check) при записи в Event Store.
- Outbox Relay опрашивает таблицу каждые 500 мс — требует стабильного соединения с Kafka.
- Расчёт OEE выполняется как materialized projection: при высокой нагрузке выделить отдельный воркер.

---

### 2.2. quality-service

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.25 vCPU | 1–2 vCPU |
| RAM | 256 МБ | 512 МБ – 1 ГБ |
| Реплики | 1 | 2 |
| PostgreSQL | pg-quality (5433) | отдельный PG |
| Порт HTTP | 3011 | внутренний |
| Kafka topics (write) | `mes.quality.*` | то же |
| Kafka topics (read) | `mes.production.*` | то же |

**Особые требования:**
- Поддержка автоматического приёма измерений от средств измерений (высокочастотный поток).
- При объёме > 1 000 измерений/мин рассмотреть TimescaleDB для таблицы `measurements`.

---

### 2.3. maintenance-service

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.25 vCPU | 1 vCPU |
| RAM | 256 МБ | 512 МБ |
| Реплики | 1 | 2 |
| PostgreSQL | pg-maintenance (5434) | отдельный PG |
| Порт HTTP | 3012 | внутренний |
| Kafka topics (write) | `mes.maintenance.*` | то же |
| Kafka topics (read) | `mes.integration.telemetry.*` | то же |

---

### 2.4. inventory-service

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.25 vCPU | 1–2 vCPU |
| RAM | 256 МБ | 512 МБ – 1 ГБ |
| Реплики | 1 | 2 |
| PostgreSQL | pg-inventory (5435) | отдельный PG |
| Порт HTTP | 3013 | внутренний |
| Kafka topics (write) | `mes.inventory.*` | то же |
| Kafka topics (read) | `mes.production.*` | то же |

**Особые требования:**
- Event Sourcing для материальных партий (полная прослеживаемость).
- Резервирование и компенсация реализуются через Saga; требуется атомарная запись в `event_store` + `outbox` в одной транзакции.

---

### 2.5. recipe-service

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.25 vCPU | 0.5–1 vCPU |
| RAM | 256 МБ | 512 МБ |
| Реплики | 1 | 2 |
| PostgreSQL | pg-recipe (5436) | отдельный PG |
| Порт HTTP | 3014 | внутренний |
| Kafka topics (write) | `mes.recipe.*` | то же |
| Kafka topics (read) | нет | нет |

**Особые требования:**
- Версионирование рецептур: неизменяемые версии (append-only), история изменений обязательна.
- Кэширование активных версий в памяти сервиса (LRU, до 500 записей).

---

### 2.6. scheduling-service

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.5 vCPU | 2 vCPU |
| RAM | 512 МБ | 1–2 ГБ |
| Реплики | 1 | 1–2 (перепланирование — stateful операция) |
| PostgreSQL | pg-scheduling (5437) | отдельный PG |
| Порт HTTP | 3015 | внутренний |
| Kafka topics (write) | `mes.scheduling.*` | то же |
| Kafka topics (read) | `mes.production.*`, `mes.maintenance.*`, `mes.inventory.*` | то же |

**Особые требования:**
- Алгоритм перепланирования может быть CPU-интенсивным; при крупном производстве рассмотреть выделение solver-воркера.
- Только один активный потребитель (consumer group с единственной репликой) обрабатывает события перепланирования во избежание конфликтов.

---

### 2.7. integration-service

Наиболее разнородный сервис: OPC UA, MQTT/Sparkplug, ERP B2MML.

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.5 vCPU | 2–4 vCPU |
| RAM | 512 МБ | 1–2 ГБ |
| Реплики | 1 | 2 (active/active, stateless адаптеры) |
| PostgreSQL | pg-integration (5438) | отдельный PG |
| Порт HTTP | 3016 | внутренний |
| Kafka topics (write) | `mes.integration.*`, `mes.uns.*` | то же |
| Kafka topics (read) | `mes.production.*`, `mes.quality.*` | то же |
| Внешние порты | — | OPC UA: 4840; MQTT: 1883/8883; ERP API: HTTPS |

**Особые требования:**
- OPC UA-адаптер держит постоянное подключение к серверу АСУ ТП; требуется reconnect с backoff.
- Sparkplug-адаптер декодирует Protobuf; зависимость `sparkplug-b` или `google-protobuf`.
- B2MML-адаптер парсит XML (xml2js); при большом объёме заказов — stream-парсинг.
- Должен работать на edge-узле в облегчённой конфигурации (без Kafka, только локальный MQTT → локальный PostgreSQL-буфер).

---

### 2.8. admin-service

| Параметр | Dev | Production |
|---|---|---|
| CPU | 0.25 vCPU | 1 vCPU |
| RAM | 256 МБ | 512 МБ |
| Реплики | 1 | 2 |
| PostgreSQL | pg-admin (5439) | отдельный PG |
| Порт HTTP | 3017 | внутренний |
| Kafka topics (write) | `mes.admin.audit.*` | то же |
| Kafka topics (read) | все топики (аудит) | то же |
| Внешние зависимости | Keycloak Admin REST API | то же |

**Особые требования:**
- Управление пользователями делегировано Keycloak; admin-service хранит только расширенный профиль и RBAC-маппинг.
- Schema Registry API используется для регистрации и проверки схем событий.

---

## 3. Веб-приложение (web-app)

React 18 + TypeScript + Vite, статическая сборка, раздаётся через Nginx.

| Параметр | Dev | Production |
|---|---|---|
| Сборка | `vite dev` | `vite build` → Nginx |
| Образ Nginx | — | `nginx:1.25-alpine` |
| CPU (Nginx) | 0.1 vCPU | 0.5 vCPU |
| RAM (Nginx) | 64 МБ | 128 МБ |
| Реплики | 1 | 2+ |
| Порт | 5173 (dev) | 80/443 (через Ingress) |
| CDN | нет | рекомендуется для статических ассетов |
| Node.js (build) | 22 LTS | 22 LTS (только CI/CD, не в рантайме) |
| WebSocket / SSE | прямое подключение к сервисам | через Ingress (sticky session для WS) |

**Зависимости сборки:**
- `react` 18.x, `react-dom` 18.x
- `@tanstack/react-query` 5.x
- `zustand` 4.x
- `axios` 1.x
- `vite` 5.x

---

## 4. Edge-узел (граничный уровень)

Развёртывается на производственном участке. Обеспечивает автономную работу при потере связи с центральным контуром.

| Параметр | Требование |
|---|---|
| Аппаратная платформа | Промышленный ПК или ARM-сервер (например, Raspberry Pi CM4 / Advantech / Siemens IPC) |
| ОС | Linux (Debian 12 / Ubuntu 22.04 LTS) |
| CPU | ≥ 4 ядра ARM64 или x86-64, ≥ 1.5 ГГц |
| RAM | ≥ 4 ГБ |
| Диск | eMMC/SSD ≥ 64 ГБ; для буфера событий — ≥ 32 ГБ свободного места |
| Сеть | Ethernet 100 Мбит/с к сети АСУ ТП; WAN/LTE к центральному контуру |
| Docker Engine | 24.x |
| Компоненты | Mosquitto (MQTT), PostgreSQL 16 (буфер), integration-service (edge-режим) |
| Буферизация | Локальный PostgreSQL хранит события при потере WAN; при восстановлении — автоматическая догрузка в Kafka центра |
| Обновление | OTA через Ansible или Kubernetes Fleet (k3s) |

---

## 5. Сетевые требования

| Сегмент | Пропускная способность | Задержка | Шифрование |
|---|---|---|---|
| Центральный контур (внутри k8s) | 1 Гбит/с | < 1 мс | mTLS (Istio / Linkerd) |
| Центр — Edge (WAN) | ≥ 10 Мбит/с | < 100 мс | TLS 1.3 |
| Edge — АСУ ТП (ЛВС участка) | ≥ 100 Мбит/с | < 5 мс | OPC UA Security, MQTT TLS |
| Клиент — веб-приложение | ≥ 10 Мбит/с | < 50 мс | HTTPS / WSS |
| ERP — integration-service | по договорённости | — | HTTPS mTLS |

---

## 6. Требования к среде развёртывания (Kubernetes)

| Параметр | Минимум (3 ноды) | Рекомендовано (5+ нод) |
|---|---|---|
| Kubernetes | 1.29+ | 1.30+ |
| CPU (кластер) | 16 vCPU | 32+ vCPU |
| RAM (кластер) | 64 ГБ | 128+ ГБ |
| Диск (кластер) | 2 ТБ SSD | 5+ ТБ NVMe |
| Ingress | NGINX Ingress Controller | то же + cert-manager (Let's Encrypt / внутренний CA) |
| Storage | Local PV или Longhorn | Longhorn / Ceph RBD |
| Service Mesh | опционально | Istio или Linkerd (mTLS) |
| Container Registry | любой (Harbor, GitLab Registry) | внутренний Harbor |

---

## 7. Сводная таблица ресурсов (Production, минимум)

| Компонент | CPU (vCPU) | RAM (ГБ) | Диск (ГБ) | Реплики |
|---|---|---|---|---|
| Kafka (брокер) | 4 | 16 | 500 | 3 |
| ZooKeeper | 1 | 2 | 50 | 3 |
| Schema Registry | 2 | 2 | — | 2 |
| Mosquitto (центр) | 2 | 2 | 50 | 2 |
| PostgreSQL (×8) | 2–8 | 4–8 | 200–1000 | 1+1 standby |
| Keycloak | 2 | 4 | — (внешн. PG) | 2 |
| OTel Collector | 2 | 2 | — | 2 |
| Prometheus | 2 | 8 | 200 | 1 |
| Grafana | 1 | 1 | — | 2 |
| production-service | 4 | 2 | — | 2–4 |
| quality-service | 2 | 1 | — | 2 |
| maintenance-service | 1 | 0.5 | — | 2 |
| inventory-service | 2 | 1 | — | 2 |
| recipe-service | 1 | 0.5 | — | 2 |
| scheduling-service | 2 | 2 | — | 1–2 |
| integration-service | 4 | 2 | — | 2 |
| admin-service | 1 | 0.5 | — | 2 |
| web-app (Nginx) | 0.5 | 0.25 | — | 2 |
| **Итого (ориентир)** | **~56** | **~100** | **~3000+** | — |

> Точные значения определяются на стадии технического проектирования по результатам нагрузочного тестирования и профилирования объёма событий с конкретного производственного объекта.
