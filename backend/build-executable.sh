#!/bin/bash
# Script to build backend as standalone executable

echo "Building backend as standalone executable..."

cd backend

# Check if PyInstaller is installed
if ! pip show pyinstaller &> /dev/null; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
fi

# Create executable
echo "Creating executable..."
pyinstaller --onefile --name norebox-backend --add-data "app:app" app/main.py

echo ""
echo "Build complete! Executable location:"
echo "dist/norebox-backend"
echo ""
echo "Note: Make sure .env file is in the same directory as the executable"

