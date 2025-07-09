# Setup and Configuration Guide

## Quick Start

### 1. Install & Start
```bash
npm install
npm start
```

### 2. Find Your Network IP
```bash
npm run network
```

### 3. Create User & API Key
```bash
# Register (replace IP with your network IP)
curl -X POST http://YOUR_IP:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"myuser","password":"Pass123!","email":"my@email.com"}'

# Login to get JWT token
curl -X POST http://YOUR_IP:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"myuser","password":"Pass123!"}'

# Generate API key (use JWT token from login)
curl -X POST http://YOUR_IP:3000/api/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"keyName":"My Key"}'
```

## Configuration

### Environment Variables (.env)
```bash
# Server
PORT=3000
NODE_ENV=development

# Auth
JWT_SECRET=your-secret-key

# Provider API Keys (optional - get from provider websites)
OPENROUTER_API_KEY=sk-or-v1-your-key
ANTHROPIC_API_KEY=sk-ant-your-key  
OPENAI_API_KEY=sk-your-key
GOOGLE_API_KEY=your-key

# Ollama (for local models)
OLLAMA_BASE_URL=http://localhost:11434
```

### Real API Keys

For actual AI responses, get keys from:
- **OpenRouter**: https://openrouter.ai/ (Recommended - all models)
- **Anthropic**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/
- **Google**: https://ai.google.dev/
- **Ollama**: https://ollama.com/ (Free local models - no API key needed)
- **Local GGUF**: Run `./scripts/setup-llama3.2-1b.sh` (Lightweight local inference)

## Network Access

**✅ Now enabled for local network access!**

- **Local**: `http://localhost:3000`
- **Network**: `http://YOUR_IP:3000` (accessible from phones, tablets, other computers)
- **CORS**: Automatically allows all local network requests (192.168.x.x, 10.x.x.x, etc.)

### From Other Devices

Your server is now accessible from:
- Other computers on your network
- Mobile phones on your WiFi
- Tablets and other devices
- Development tools and apps

Just replace `localhost` with your network IP address!

## Authentication

Two methods supported:

### API Keys (Recommended)
```bash
X-API-Key: ak_your_api_key_here
```

### JWT Tokens
```bash
Authorization: Bearer your_jwt_token_here
```

## Management Commands

```bash
npm start          # Start server
npm run network    # Show network IPs  
npm test          # Run tests
npm run dev       # Development mode
```

## Health Check

```bash
curl http://YOUR_IP:3000/health
```

Should return: `{"status":"OK","message":"Server is running"}`