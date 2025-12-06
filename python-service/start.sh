#!/bin/bash

# Start script for Python DOCX service

cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Running setup..."
    ./setup.sh
fi

# Activate virtual environment
source venv/bin/activate

# Start the service
echo "Starting Python DOCX service on port ${PORT:-5001}..."
python docx_generator.py




