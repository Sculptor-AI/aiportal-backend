# HTTPS Setup Guide for AI Portal Backend

This guide explains how to enable HTTPS for the AI Portal backend server for enhanced security.

## Overview

The AI Portal backend now supports HTTPS with automatic fallback to HTTP when SSL certificates are not configured. This ensures secure communication while maintaining compatibility during development.

## Quick Setup (Self-Signed Certificates)

For local development and testing:

1. **Generate SSL certificates:**
   ```bash
   ./ssl/generate-ssl-certs.sh
   ```

2. **Set environment variables:**
   ```bash
   export SSL_CERT_PATH="./ssl/server.crt"
   export SSL_KEY_PATH="./ssl/server.key"
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

The server will now run on HTTPS with URLs like `https://localhost:3000`.

## Environment Configuration

Add these variables to your `.env` file:

```env
# SSL/HTTPS Configuration
SSL_CERT_PATH=./ssl/server.crt
SSL_KEY_PATH=./ssl/server.key
```

## Production Setup

For production environments, use certificates from a trusted Certificate Authority (CA):

### Option 1: Let's Encrypt (Free)

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate for your domain
sudo certbot certonly --standalone -d yourdomain.com

# Set environment variables
export SSL_CERT_PATH="/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
export SSL_KEY_PATH="/etc/letsencrypt/live/yourdomain.com/privkey.pem"
```

### Option 2: Commercial Certificate

1. Purchase an SSL certificate from a trusted CA
2. Download the certificate files
3. Set the environment variables to point to your certificate files

## Security Features

### CORS Policy Updates
- HTTPS origins are prioritized in CORS configuration
- HTTP is only allowed for localhost during development
- Production mode blocks all HTTP connections

### Service Updates
- **Ollama Service**: Attempts HTTPS first, falls back to HTTP
- **Local Inference Service**: Supports both HTTPS and HTTP connections
- **Server**: Automatic protocol detection and warnings

## Browser Considerations

### Self-Signed Certificates
When using self-signed certificates, browsers will show security warnings:

1. Click "Advanced" or "Show advanced"
2. Click "Proceed to localhost (unsafe)" or similar
3. The warning appears only once per session

### Trusted Certificates
Production certificates from trusted CAs will work without warnings.

## Troubleshooting

### Certificate Errors
If you see SSL certificate errors:

1. **Check file paths:**
   ```bash
   ls -la ./ssl/server.crt ./ssl/server.key
   ```

2. **Verify permissions:**
   ```bash
   chmod 644 ./ssl/server.crt
   chmod 600 ./ssl/server.key
   ```

3. **Regenerate certificates:**
   ```bash
   rm -f ./ssl/server.*
   ./ssl/generate-ssl-certs.sh
   ```

### Connection Issues
If services can't connect via HTTPS:

1. **Check if the service supports HTTPS**
2. **Verify the service is running on the expected port**
3. **Check firewall settings**

### Fallback Behavior
The system automatically falls back to HTTP when:
- SSL certificates are not configured
- SSL certificate files are invalid or inaccessible
- HTTPS connection fails

## Testing HTTPS Setup

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Look for the HTTPS indicator:**
   ```
   🔒 HTTPS Server running on port 3000
   Local access: https://localhost:3000
   ```

3. **Test the health endpoint:**
   ```bash
   curl -k https://localhost:3000/health
   ```

4. **Verify certificate details:**
   ```bash
   openssl x509 -in ./ssl/server.crt -text -noout
   ```

## Network Configuration

### WSL Users
Update your port forwarding commands to use HTTPS:

```powershell
# Remove old HTTP port forwarding
netsh interface portproxy delete v4tov4 listenport=3000

# Add HTTPS port forwarding
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=172.24.74.81
```

### Firewall Rules
Ensure your firewall allows HTTPS traffic:

```powershell
New-NetFirewallRule -DisplayName "WSL AI Portal HTTPS" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

## Benefits of HTTPS

1. **Data Encryption**: All communication is encrypted in transit
2. **Authentication**: Verifies server identity (with trusted certificates)
3. **Integrity**: Prevents data tampering during transmission
4. **Compliance**: Required for many production environments
5. **Modern Browser Features**: Some features require HTTPS

## Migration Notes

- Existing HTTP configurations will continue to work during development
- Production deployments should use HTTPS exclusively
- Update any hardcoded HTTP URLs to HTTPS
- Client applications may need certificate trust configuration

## Support

If you encounter issues with HTTPS setup:
1. Check the server logs for specific error messages
2. Verify your certificate files are valid
3. Ensure environment variables are set correctly
4. Test with curl using the `-k` flag to ignore certificate warnings

For additional help, refer to the main documentation or create an issue in the project repository.