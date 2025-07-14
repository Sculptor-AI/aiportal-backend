#!/bin/bash

# HTTP start script for AI Portal Backend
# This script starts the server on port 3000 with HTTP (for Cloudflare SSL termination)

echo "🚀 Starting AI Portal Backend in HTTP mode..."
echo "🔒 SSL termination will be handled by Cloudflare"

# Stop any existing Node.js servers
echo "🛑 Stopping any existing servers..."
pkill -f "node server.js" 2>/dev/null || true
sleep 2

# Load environment variables from .env file
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Set environment variables for HTTP mode
export NODE_ENV=production
export PORT=3000
export FORCE_HTTP=true
# Unset SSL environment variables to force HTTP mode
unset SSL_CERT_PATH
unset SSL_KEY_PATH

echo "🌐 Starting HTTP server on port 3000..."
echo "🏠 Local URL: http://localhost:3000"
echo "💻 WSL URL: http://172.24.74.81:3000"
echo "🌍 Public URL: https://api.sculptorai.org (via Cloudflare)"
echo ""
echo "📋 Note: Users will access https://api.sculptorai.org"
echo "📋 Cloudflare handles SSL and forwards to http://73.118.140.130:3000"

# Start the server
node server.js