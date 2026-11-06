#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Starting TRADEGRID Hybrid Virtual Stock Exchange (Dev)  "
echo "=========================================================="

if [ ! -f ".env" ]; then
    echo "Copying .env.example to .env..."
    cp .env.example .env
fi

echo "Building shared packages..."
npm run build:packages

echo ""
echo "To run development services:"
echo "Terminal 1 (Backend):  npm run dev:backend"
echo "Terminal 2 (Frontend): npm run dev:frontend"
echo ""
echo "To run tests:"
echo "npm test"
