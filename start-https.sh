#!/bin/bash

# Start AI Portal Backend with HTTPS
# This script sets the required environment variables and starts the server

echo "🔒 Starting AI Portal Backend with HTTPS..."

# Set SSL environment variables
export SSL_CERT_PATH="./ssl/server.crt"
export SSL_KEY_PATH="./ssl/server.key"

echo "📋 Environment variables set:"
echo "   SSL_CERT_PATH=$SSL_CERT_PATH"
echo "   SSL_KEY_PATH=$SSL_KEY_PATH"

# Check if certificates exist
if [ ! -f "$SSL_CERT_PATH" ] || [ ! -f "$SSL_KEY_PATH" ]; then
    echo "❌ SSL certificates not found!"
    echo "🔧 Generating certificates..."
    ./ssl/generate-ssl-certs.sh
fi

echo ""
echo "🚀 Starting server with HTTPS enabled..."
echo "🌐 Server will be available at: https://localhost:3000"
echo ""

# Start the server
npm start