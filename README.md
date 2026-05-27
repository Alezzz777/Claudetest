# Family Tree / Семейное Древо

Web-приложение для ведения генеалогического дерева семьи с мобильной адаптацией.

## Возможности

- Управление персонами (CRUD): имя, фамилия, пол, даты рождения/смерти, места, заметки
- Управление семьями: связи муж-жена-дети
- Интерактивная визуализация дерева с масштабированием и перетаскиванием
- Импорт данных из формата GEDCOM 5.5.1
- Экспорт данных в формат GEDCOM 5.5.1
- Адаптивный мобильный интерфейс
- Хранение данных в PostgreSQL

## Технологии

- **Backend**: Python, FastAPI, SQLAlchemy
- **Database**: PostgreSQL
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)

## Запуск

```bash
# Убедитесь что PostgreSQL запущен
sudo service postgresql start

# Создайте БД (один раз)
sudo -u postgres psql -c "CREATE USER familytree WITH PASSWORD 'familytree123';"
sudo -u postgres psql -c "CREATE DATABASE familytree OWNER familytree;"

# Установите зависимости
pip install -r requirements.txt

# Запустите
./run.sh
# или
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Приложение будет доступно на http://localhost:8000

## Структура проекта

```
app/
  main.py           - FastAPI приложение и API endpoints
  models.py         - SQLAlchemy модели (Person, Family, FamilyChild)
  schemas.py        - Pydantic схемы
  database.py       - Подключение к PostgreSQL
  gedcom_service.py - Парсер и экспортёр GEDCOM
templates/
  index.html        - Главная страница
static/
  css/style.css     - Стили (mobile-first)
  js/app.js         - Клиентская логика
```
