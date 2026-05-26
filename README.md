# Lean Production Dashboard

Дашборд производственного участка, построенный на принципах **бережливого производства** (Lean Manufacturing). Отображает ключевые метрики в реальном времени: объём выпуска, качество, состояние оборудования и явку персонала.

Данные загружаются из единого JSON-файла, что позволяет интегрировать дашборд с любой системой сбора данных (MES, ERP, SCADA).

## Возможности

| Раздел | Метрики |
|--------|---------|
| **Продукция** | План / факт выпуска, почасовая динамика, выпуск по изделиям |
| **Качество** | FPY (First Pass Yield), уровень брака, тренд за неделю, Парето-анализ дефектов |
| **Оборудование** | OEE (доступность, производительность, качество), статус станков, причины простоев |
| **Персонал** | Явка по ролям, причины отсутствий, недельный тренд посещаемости |
| **Безопасность** | Дни без инцидентов, предпосылки к инцидентам |
| **Кайдзен** | Поданные и внедрённые предложения по улучшению |

## Принципы Lean, реализованные в дашборде

- **Визуальное управление (Andon)** — цветовая индикация зелёный / жёлтый / красный на всех KPI
- **OEE** — декомпозиция общей эффективности оборудования на три составляющие
- **Парето-анализ** — диаграмма дефектов с кумулятивной кривой для приоритизации
- **План vs Факт** — почасовое сравнение для раннего обнаружения отклонений
- **Кайдзен** — трекинг предложений по непрерывному улучшению
- **Стандартизация** — единый формат данных JSON с чётко описанной схемой

## Структура проекта

```
.
├── index.html                  # Главная страница дашборда
├── css/
│   └── styles.css              # Стили (тёмная тема, адаптивная вёрстка)
├── js/
│   └── dashboard.js            # Загрузка JSON, отрисовка графиков (Chart.js)
├── data/
│   └── production-data.json    # Данные производственного участка
├── render.yaml                 # Блюпринт для деплоя на Render
└── README.md
```

## Быстрый старт

### Локальный запуск

Приложению нужен HTTP-сервер (fetch не работает с `file://`):

```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```

Откройте `http://localhost:8000` в браузере.

### Деплой на Render

1. Форкните или загрузите репозиторий на GitHub.
2. Войдите в [Render Dashboard](https://dashboard.render.com).
3. Нажмите **New** → **Blueprint** и укажите репозиторий.
4. Render прочитает `render.yaml` и создаст статический сайт автоматически.
5. Сайт будет доступен по адресу `https://lean-production-dashboard.onrender.com`.

Альтернативно — ручное создание:

1. **New** → **Static Site**.
2. Подключите репозиторий.
3. Build Command: оставьте пустым.
4. Publish Directory: `.`
5. Нажмите **Create Static Site**.

## Формат данных (JSON)

Файл `data/production-data.json` содержит следующие секции:

### `meta` — общая информация

| Поле | Тип | Описание |
|------|-----|----------|
| `facility` | string | Название участка |
| `date` | string | Дата (YYYY-MM-DD) |
| `shift` | string | Текущая смена |
| `updated_at` | string | Время последнего обновления (ISO 8601) |

### `production` — объём выпуска

| Поле | Тип | Описание |
|------|-----|----------|
| `plan` | number | Плановый объём за смену |
| `actual` | number | Фактический объём |
| `unit` | string | Единица измерения |
| `hourly[]` | array | Почасовая разбивка: `{ hour, plan, actual }` |
| `products[]` | array | По изделиям: `{ name, plan, actual }` |

### `quality` — качество

| Поле | Тип | Описание |
|------|-----|----------|
| `total_inspected` | number | Проверено единиц |
| `defects` | number | Обнаружено дефектов |
| `defect_rate_percent` | number | Процент брака |
| `target_defect_rate_percent` | number | Целевой процент брака |
| `fpy_percent` | number | First Pass Yield (% годных с 1-го раза) |
| `target_fpy_percent` | number | Целевой FPY |
| `defect_types[]` | array | Виды дефектов: `{ type, count, percent }` |
| `daily_trend[]` | array | Тренд за неделю: `{ date, defect_rate }` |

### `equipment` — оборудование

| Поле | Тип | Описание |
|------|-----|----------|
| `total_machines` | number | Всего единиц оборудования |
| `running` | number | В работе |
| `idle` | number | В простое |
| `under_maintenance` | number | На ТО / ремонте |
| `oee_percent` | number | Общая эффективность (OEE) |
| `target_oee_percent` | number | Целевой OEE |
| `availability_percent` | number | Доступность |
| `performance_percent` | number | Производительность |
| `quality_rate_percent` | number | Качество |
| `total_downtime_minutes` | number | Суммарный простой (мин) |
| `planned_downtime_minutes` | number | Плановый простой |
| `unplanned_downtime_minutes` | number | Внеплановый простой |
| `machines[]` | array | Станки: `{ id, name, status, oee }` |
| `downtime_reasons[]` | array | Причины: `{ reason, minutes, type }` |

Возможные значения `status`: `running`, `idle`, `maintenance`.
Возможные значения `type` (простой): `planned`, `unplanned`.

### `personnel` — персонал

| Поле | Тип | Описание |
|------|-----|----------|
| `total_staff` | number | Штатная численность |
| `present` | number | Присутствует |
| `absent` | number | Отсутствует |
| `attendance_percent` | number | Процент явки |
| `target_attendance_percent` | number | Целевая явка |
| `absence_reasons[]` | array | Причины: `{ reason, count }` |
| `by_role[]` | array | По ролям: `{ role, total, present }` |
| `weekly_attendance[]` | array | За неделю: `{ date, percent }` |

### `safety` — безопасность

| Поле | Тип | Описание |
|------|-----|----------|
| `days_without_incident` | number | Дни без инцидентов |
| `incidents_this_month` | number | Инцидентов за месяц |
| `near_misses_this_month` | number | Предпосылок за месяц |

### `kaizen` — непрерывное улучшение

| Поле | Тип | Описание |
|------|-----|----------|
| `suggestions_this_month` | number | Подано предложений |
| `implemented_this_month` | number | Внедрено |
| `pending` | number | В обработке |

## Интеграция с внешними системами

Дашборд потребляет данные из `data/production-data.json`. Для интеграции с реальными системами:

1. **MES / ERP** — настройте периодический экспорт данных в формат JSON по описанной схеме.
2. **SCADA / OPC UA** — используйте промежуточный скрипт (Python, Node.js) для чтения тегов и записи JSON.
3. **REST API** — замените `fetch('data/production-data.json')` в `js/dashboard.js` на URL вашего API.
4. **Автообновление** — добавьте `setInterval(() => location.reload(), 60000)` для обновления каждые 60 секунд.

## Технологии

- **HTML5 / CSS3** — семантическая разметка, CSS Grid, адаптивная вёрстка
- **JavaScript (ES6+)** — без фреймворков, нативный fetch
- **Chart.js 4** — графики (CDN)
- **Render** — хостинг статического сайта

## Лицензия

MIT
