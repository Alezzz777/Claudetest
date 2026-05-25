# Cargo Transport App

Веб-приложение для подачи, приёма и контроля выполнения заявок на перевозку грузов в рамках предприятия. Адаптировано для мобильных устройств.

## Стек технологий

| Слой | Технология |
|------|-----------|
| Backend | Node.js, Express |
| База данных | PostgreSQL |
| Аутентификация | JWT (jsonwebtoken), bcryptjs |
| Frontend | Vanilla JS (SPA), HTML5, CSS3 |
| Деплой | Render (Blueprint) |

## Роли пользователей

### Диспетчер
- Создание и управление заявками на перевозку
- Назначение исполнителя и получателя
- Управление справочником мест (CRUD)
- Отклонение заявок на любом этапе
- Просмотр всех заявок и статистики

### Исполнитель
- Просмотр назначенных заявок
- Взятие заявки в работу (assigned -> in_progress)
- Отметка о доставке (in_progress -> delivered)

### Клиент
- Создание заявок на перевозку
- Отслеживание статусов своих заявок (как отправитель и как получатель)
- Подтверждение или отклонение доставки

## Жизненный цикл заявки

```
[Новая] ──диспетчер назначает──> [Назначена]
                                      |
                              исполнитель берёт
                                      |
                                  [В пути]
                                      |
                             исполнитель доставил
                                      |
                                [Доставлена]
                                   /     \
                     клиент подтвердил   клиент отклонил
                            |                  |
                     [Подтверждена]       [Отклонена]
```

Диспетчер может отклонить заявку на этапах: Новая, Назначена, Доставлена.

## Структура проекта

```
cargo-transport-app/
├── server.js                   # Точка входа, Express-сервер, health/ping
├── render.yaml                 # Blueprint для деплоя на Render
├── package.json
│
├── src/
│   ├── db/
│   │   ├── pool.js             # Пул соединений PostgreSQL
│   │   └── init.js             # Миграции + seed-данные
│   ├── middleware/
│   │   └── auth.js             # JWT аутентификация и авторизация
│   └── routes/
│       ├── auth.js             # POST /login, /register, GET /me
│       ├── requests.js         # CRUD заявок, назначение, статусы
│       ├── users.js            # Список пользователей по ролям
│       └── locations.js        # CRUD мест получения/отправки
│
└── public/
    ├── index.html              # SPA — единственная HTML-страница
    ├── css/
    │   └── style.css           # Mobile-first адаптивные стили
    └── js/
        └── app.js              # Клиентская логика приложения
```

## База данных

### Таблицы

**users** — пользователи системы
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PK | |
| username | VARCHAR(50) UNIQUE | Логин |
| password_hash | VARCHAR(255) | Хэш пароля (bcrypt) |
| full_name | VARCHAR(100) | ФИО |
| role | VARCHAR(20) | client / executor / dispatcher |
| phone | VARCHAR(20) | Телефон |
| created_at | TIMESTAMP | Дата создания |

**locations** — справочник мест
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PK | |
| name | VARCHAR(255) | Название |
| address | VARCHAR(500) | Адрес / описание |
| created_by | INTEGER FK | Кто создал |
| created_at | TIMESTAMP | Дата создания |

**transport_requests** — заявки на перевозку
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PK | |
| sender_id | INTEGER FK | Заказчик (клиент/диспетчер) |
| receiver_id | INTEGER FK | Получатель (клиент) |
| executor_id | INTEGER FK | Исполнитель |
| dispatcher_id | INTEGER FK | Диспетчер |
| cargo_description | TEXT | Описание груза |
| weight | DECIMAL(10,2) | Вес (кг) |
| pickup_location | VARCHAR(255) | Место отправки |
| delivery_location | VARCHAR(255) | Место доставки |
| priority | VARCHAR(10) | low / normal / high / urgent |
| status | VARCHAR(20) | new / assigned / in_progress / delivered / confirmed / rejected |
| notes | TEXT | Примечания |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

**status_history** — история изменений статусов
| Поле | Тип | Описание |
|------|-----|----------|
| id | SERIAL PK | |
| request_id | INTEGER FK | Заявка |
| status | VARCHAR(20) | Новый статус |
| changed_by | INTEGER FK | Кто изменил |
| comment | TEXT | Комментарий |
| created_at | TIMESTAMP | Дата |

## API

### Без аутентификации

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/ping` | Проверка доступности сервера |
| GET | `/api/health` | Состояние сервера и БД |
| POST | `/api/auth/login` | Вход (username, password) -> token |
| POST | `/api/auth/register` | Регистрация (username, password, full_name, role, phone) |

### С аутентификацией (Bearer token)

| Метод | Путь | Роли | Описание |
|-------|------|------|----------|
| GET | `/api/auth/me` | все | Текущий пользователь |
| GET | `/api/requests` | все | Список заявок (фильтр по роли) |
| GET | `/api/requests/stats` | все | Статистика по статусам |
| GET | `/api/requests/:id` | все | Детали заявки + история |
| POST | `/api/requests` | client, dispatcher | Создать заявку |
| PATCH | `/api/requests/:id/assign` | dispatcher | Назначить исполнителя |
| PATCH | `/api/requests/:id/status` | executor, client, dispatcher | Сменить статус |
| PATCH | `/api/requests/:id/reject` | client, dispatcher | Отклонить заявку |
| GET | `/api/users/by-role/:role` | все | Пользователи по роли |
| GET | `/api/users` | dispatcher | Все пользователи |
| GET | `/api/locations` | все | Список мест |
| POST | `/api/locations` | dispatcher | Добавить место |
| PUT | `/api/locations/:id` | dispatcher | Редактировать место |
| DELETE | `/api/locations/:id` | dispatcher | Удалить место |

## Установка и запуск

### Требования

- Node.js >= 18
- PostgreSQL >= 14

### Локальный запуск

```bash
# 1. Клонировать репозиторий
git clone https://github.com/Alezzz777/Claudetest.git
cd Claudetest

# 2. Установить зависимости
npm install

# 3. Создать базу данных PostgreSQL
createdb cargo_transport

# 4. Настроить переменные окружения (опционально)
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=cargo_transport
export PGUSER=postgres
export PGPASSWORD=postgres
export JWT_SECRET=your-secret-key

# 5. Инициализировать БД (таблицы + демо-данные)
npm run db:init

# 6. Запустить сервер
npm start
```

Приложение будет доступно по адресу http://localhost:3000

### Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `PORT` | Порт сервера | 3000 |
| `DATABASE_URL` | Connection string PostgreSQL | — |
| `PGHOST` | Хост БД | localhost |
| `PGPORT` | Порт БД | 5432 |
| `PGDATABASE` | Имя БД | cargo_transport |
| `PGUSER` | Пользователь БД | postgres |
| `PGPASSWORD` | Пароль БД | postgres |
| `JWT_SECRET` | Секрет для JWT-токенов | cargo-transport-secret-key |

Если задан `DATABASE_URL`, отдельные PG-переменные игнорируются. SSL включается автоматически при использовании `DATABASE_URL`.

## Деплой на Render

В репозитории есть `render.yaml` — Render Blueprint для автоматического развёртывания.

1. Зайти в [Render Dashboard](https://dashboard.render.com) -> **Blueprints** -> **New Blueprint Instance**
2. Подключить репозиторий
3. Render обнаружит `render.yaml` и создаст:
   - PostgreSQL базу данных (free tier)
   - Web-сервис Node.js (free tier)
4. Нажать **Apply** — приложение развернётся автоматически

`JWT_SECRET` генерируется Render автоматически. БД инициализируется при первом старте.

## Демо-данные

При инициализации БД создаются пользователи (пароль для всех: `password123`):

| Логин | Роль | ФИО |
|-------|------|-----|
| dispatcher1 | Диспетчер | Иванов Иван Иванович |
| client1 | Клиент | Петров Петр Петрович |
| client2 | Клиент | Сидоров Сидор Сидорович |
| executor1 | Исполнитель | Козлов Алексей Михайлович |
| executor2 | Исполнитель | Волков Дмитрий Сергеевич |

Также создаются 6 демо-локаций: Склад А, Склад Б, Цех №1, Цех №2, Погрузочная зона, Офис.

## Интерфейс

- Mobile-first адаптивный дизайн
- Нижняя навигация (Главная / Заявки / Новая / Места / Health)
- Дашборд со статистикой по статусам
- Карточки заявок с цветовым приоритетом (срочный — красный, высокий — оранжевый)
- Фильтрация заявок по статусу
- Детальный просмотр заявки с историей изменений
- Модальные окна для назначения исполнителя и отклонения
- Управление справочником мест (диспетчер)
- Индикатор связи с сервером в реальном времени (ping каждые 10 сек)
- Страница Health с состоянием сервера, БД и задержкой
- Уведомления (toast) над нижней навигацией
- Пагинация списка заявок

## Безопасность

- Пароли хранятся в виде bcrypt-хэша (10 раундов)
- JWT-токены с истечением через 24 часа
- Авторизация по ролям на каждом API-эндпоинте
- Клиент может подтвердить/отклонить только свои заявки (sender_id или receiver_id)
- XSS-защита через escapeHtml при рендеринге пользовательских данных
- API-маршруты возвращают JSON 404 вместо HTML для несуществующих путей

## Лицензия

MIT
