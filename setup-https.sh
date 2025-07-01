#!/bin/bash

# HTTPS Setup Script for AI Portal Backend
# This script sets up SSL certificates and environment variables

echo "🔒 Setting up HTTPS for AI Portal Backend..."

# Check if SSL certificates exist, if not generate them
if [ ! -f "./ssl/server.crt" ] || [ ! -f "./ssl/server.key" ]; then
    echo "📜 SSL certificates not found, generating new ones..."
    ./ssl/generate-ssl-certs.sh
else
    echo "✅ SSL certificates already exist"
fi

# Create .env file with SSL configuration if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    
    # Add SSL configuration to .env file
    echo "" >> .env
    echo "# SSL/HTTPS Configuration (auto-generated)" >> .env
    echo "SSL_CERT_PATH=./ssl/server.crt" >> .env
    echo "SSL_KEY_PATH=./ssl/server.key" >> .env
else
    echo "📝 .env file exists, checking SSL configuration..."
    
    # Check if SSL variables are already in .env
    if ! grep -q "SSL_CERT_PATH" .env; then
        echo "" >> .env
        echo "# SSL/HTTPS Configuration (auto-generated)" >> .env
        echo "SSL_CERT_PATH=./ssl/server.crt" >> .env
        echo "SSL_KEY_PATH=./ssl/server.key" >> .env
        echo "✅ Added SSL configuration to existing .env file"
    else
        echo "✅ SSL configuration already exists in .env file"
    fi
fi

# Export environment variables for current session
export SSL_CERT_PATH="./ssl/server.crt"
export SSL_KEY_PATH="./ssl/server.key"

echo ""
echo "🎉 HTTPS setup complete!"
echo ""
echo "📋 Environment variables set:"
echo "   SSL_CERT_PATH=./ssl/server.crt"
echo "   SSL_KEY_PATH=./ssl/server.key"
echo ""
echo "🚀 You can now start the server with HTTPS enabled:"
echo "   npm start"
echo ""
echo "🌐 Your server will be available at:"
echo "   https://localhost:3000"
echo ""
echo "⚠️  Note: You may see a browser security warning for self-signed certificates."
echo "    Click 'Advanced' and 'Proceed to localhost' to continue."
echo ""
echo "💡 To set these variables in your current shell session, run:"
echo "   source ./setup-https.sh"