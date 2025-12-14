#!/bin/bash
echo "Starting FastAPI Backend Server..."
echo ""
echo "Make sure you have activated your virtual environment (if using one)"
echo ""
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

