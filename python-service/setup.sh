#!/bin/bash

# Setup script for Python DOCX service
# This script sets up the virtual environment and installs dependencies

echo "Setting up Python DOCX service..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the service, run:"
echo "  source venv/bin/activate"
echo "  python docx_generator.py"
echo ""
echo "Or from the project root:"
echo "  npm run python:dev"
echo ""















