#!/bin/bash

# Activate virtual environment
source .venv/bin/activate

# Start the server
echo "Starting Government Contractor Pricing API..."
echo ""
echo "UI available at: http://localhost:8000"
echo "API docs at: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python -m uvicorn app.server:app --reload --host 0.0.0.0 --port 8000
