# AI Portal Backend

A secure, scalable "Routerbox" system providing OpenAI-compatible API endpoints with support for multiple AI providers and custom model definitions.

## 🚀 Quick Start

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

### 4. Test AI Chat
```bash
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "model": "custom/coding-assistant",
    "messages": [
      {"role": "user", "content": "Write a Python function to reverse a string"}
    ]
  }'
```

## 🌐 Network Access

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

## 🤖 Available Models

### Custom Models (Pre-configured)
- `custom/coding-assistant` - Programming help (Claude Sonnet)
- `custom/creative-writer` - Creative writing (Claude Opus)  
- `custom/data-analyst` - Data analysis (GPT-4o)
- `custom/fast-responder` - Quick answers (Gemini Flash)

### Direct Provider Models
- `anthropic/claude-4-opus` - Claude 4 Opus
- `anthropic/claude-4-sonnet` - Claude 4 Sonnet
- `openai/gpt-4o` - GPT-4o
- `openai/o3` - ChatGPT o3
- `google/gemini-2.5-flash` - Gemini 2.5 Flash
- `google/gemini-2.5-pro` - Gemini 2.5 Pro

## 📚 Documentation

- **`API_DOCS.md`** - Complete API documentation
- **`SETUP_GUIDE.md`** - Setup and configuration guide
- **`SECURITY.md`** - Security implementation details

## 🔧 Key Features

- **OpenAI-Compatible API** - Drop-in replacement for OpenAI API
- **Multi-Provider Support** - Anthropic, OpenAI, Google, OpenRouter
- **Custom Models** - Create GPT-like custom assistants
- **Network Access** - Use from any device on your network
- **Rate Limiting** - Per-user, per-model limits
- **Authentication** - JWT + API key dual system
- **Streaming** - Real-time response streaming
- **Security** - Input validation, CORS, secure storage

## 🔑 Authentication

Two methods supported:

### API Keys (Recommended)
```bash
X-API-Key: ak_your_api_key_here
```

### JWT Tokens
```bash
Authorization: Bearer your_jwt_token_here
```

## 🛠️ Configuration

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
```

### Real API Keys

For actual AI responses, get keys from:
- **OpenRouter**: https://openrouter.ai/ (Recommended - all models)
- **Anthropic**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/
- **Google**: https://ai.google.dev/

## 📱 Example Usage

### JavaScript
```javascript
const response = await fetch('http://YOUR_IP:3000/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key'
  },
  body: JSON.stringify({
    model: 'custom/coding-assistant',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

### Python
```python
import requests

response = requests.post('http://YOUR_IP:3000/api/v1/chat/completions',
  headers={'X-API-Key': 'ak_your_api_key'},
  json={
    'model': 'custom/data-analyst', 
    'messages': [{'role': 'user', 'content': 'Analyze this data...'}]
  }
)
```

### Mobile Apps
Use your network IP (`http://YOUR_IP:3000`) in your mobile app's API configuration.

## 🚨 Troubleshooting

### Common Issues

**Port in use:**
```bash
PORT=3001 npm start
```

**Can't connect from other devices:**
- Check firewall settings
- Use network IP, not localhost
- Run `npm run network` to see your IP

**Invalid API key:**
- Use `X-API-Key` header for API keys (starts with `ak_`)
- Use `Authorization: Bearer` for JWT tokens

**No AI response:**
- Check you have real API keys in .env
- Custom models work without real keys for testing

## 🔍 Health Check

```bash
curl http://YOUR_IP:3000/health
```

Should return: `{"status":"OK","message":"Server is running"}`

## 📊 Management Commands

```bash
npm start          # Start server
npm run network    # Show network IPs  
npm test          # Run tests
npm run dev       # Development mode
```

## 🎯 Production Ready

The system includes:
- Secure authentication & authorization
- Rate limiting & abuse prevention  
- Input validation & sanitization
- CORS protection & network security
- Database schema & connection management
- Error handling & logging
- Custom model system
- Usage tracking & monitoring

**Perfect for development, testing, and production deployment!**

---

**🌟 Your AI Portal Backend is now running and accessible from your entire network!**

Run `npm run network` to see your specific network URLs.