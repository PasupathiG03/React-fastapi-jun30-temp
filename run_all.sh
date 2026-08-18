#!/bin/bash

echo "Starting Backend Server in a new terminal..."
# Launch backend in a new terminal, and keep it open (exec bash) so you can see any output/errors
gnome-terminal -- bash -c "cd backend && ./scripts/run.sh dev; echo 'Process finished. Press Enter to close...'; read"

echo "Starting Frontend Server in a new terminal..."
# Launch frontend in a new terminal
gnome-terminal -- bash -c "cd frontend && ./scripts/frontend_run.sh; echo 'Process finished. Press Enter to close...'; read"

echo "=========================================="
echo "Both servers have been launched in separate terminal windows."
echo "You can close this window now."
echo "=========================================="
