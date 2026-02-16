#!/bin/bash
# Production startup script for Noraebox FastAPI backend
source venv/bin/activate
export $(grep -v '^#' .env.production | xargs)
uvicorn app.main:app --host 0.0.0.0 --port 8000
