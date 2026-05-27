#!/bin/bash
set -e

echo "=== Family Tree App ==="

# Start PostgreSQL if not running
if ! pg_isready -q 2>/dev/null; then
    echo "Starting PostgreSQL..."
    sudo service postgresql start
fi

# Install dependencies
pip3 install -r requirements.txt -q 2>/dev/null

echo "Starting server on http://0.0.0.0:8000"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
