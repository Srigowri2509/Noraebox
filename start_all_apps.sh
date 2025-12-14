#!/bin/bash

echo "========================================"
echo "Starting Norebox Karaoke System"
echo "========================================"
echo ""

# Check if backend is running
echo "Checking backend server..."
if ! curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo ""
    echo "WARNING: Backend server is not running!"
    echo "Please start the backend first:"
    echo "  cd backend"
    echo "  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    echo ""
    read -p "Press Enter to continue anyway or Ctrl+C to cancel..."
fi

echo ""
echo "Starting all apps in separate terminal windows..."
echo ""

# Start Admin App (Port 5174)
echo "[1/3] Starting Admin App on http://localhost:5174"
gnome-terminal --title="Norebox Admin App" -- bash -c "cd admin-app && npm run dev; exec bash" 2>/dev/null || \
xterm -T "Norebox Admin App" -e "cd admin-app && npm run dev" 2>/dev/null || \
osascript -e 'tell app "Terminal" to do script "cd admin-app && npm run dev"' 2>/dev/null || \
start "Norebox Admin App" cmd /k "cd admin-app && npm run dev"

sleep 2

# Start Tablet App (Port 5175)
echo "[2/3] Starting Tablet App on http://localhost:5175"
gnome-terminal --title="Norebox Tablet App" -- bash -c "cd tablet-app && npm run dev; exec bash" 2>/dev/null || \
xterm -T "Norebox Tablet App" -e "cd tablet-app && npm run dev" 2>/dev/null || \
osascript -e 'tell app "Terminal" to do script "cd tablet-app && npm run dev"' 2>/dev/null || \
start "Norebox Tablet App" cmd /k "cd tablet-app && npm run dev"

sleep 2

# Start Display App (Port 5176)
echo "[3/3] Starting Display App on http://localhost:5176"
gnome-terminal --title="Norebox Display App" -- bash -c "cd display-app && npm run dev; exec bash" 2>/dev/null || \
xterm -T "Norebox Display App" -e "cd display-app && npm run dev" 2>/dev/null || \
osascript -e 'tell app "Terminal" to do script "cd display-app && npm run dev"' 2>/dev/null || \
start "Norebox Display App" cmd /k "cd display-app && npm run dev"

echo ""
echo "========================================"
echo "All apps are starting!"
echo "========================================"
echo ""
echo "Admin App:    http://localhost:5174"
echo "Tablet App:  http://localhost:5175"
echo "Display App: http://localhost:5176"
echo ""
echo "Each app will open in its own terminal window."
echo ""

