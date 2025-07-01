#!/bin/bash

# SSL Certificate Generation Script for AI Portal
# This script generates self-signed SSL certificates for local development

SSL_DIR="$(dirname "$0")"
CERT_FILE="$SSL_DIR/server.crt"
KEY_FILE="$SSL_DIR/server.key"

echo "🔒 Generating SSL certificates for AI Portal..."

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Generate private key
openssl genrsa -out "$KEY_FILE" 2048

# Generate certificate signing request configuration
cat > "$SSL_DIR/ssl.conf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Development
L = Local
O = AI Portal
OU = Development
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
DNS.3 = 172.24.74.81
DNS.4 = 192.168.1.85
IP.1 = 127.0.0.1
IP.2 = 172.24.74.81
IP.3 = 192.168.1.85
EOF

# Generate certificate
openssl req -new -x509 -key "$KEY_FILE" -out "$CERT_FILE" -days 365 -config "$SSL_DIR/ssl.conf" -extensions v3_req

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificate: $CERT_FILE"
echo "🔑 Private Key: $KEY_FILE"
echo ""
echo "🔧 To use these certificates, set the following environment variables:"
echo "export SSL_CERT_PATH=\"$CERT_FILE\""
echo "export SSL_KEY_PATH=\"$KEY_FILE\""
echo ""
echo "⚠️  Note: These are self-signed certificates for development only."
echo "    Your browser will show a security warning. Click 'Advanced' and 'Proceed to localhost'."
echo ""
echo "🚀 Restart your server to use HTTPS."

# Clean up temporary config file
rm "$SSL_DIR/ssl.conf"