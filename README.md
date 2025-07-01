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

**Streaming (default):**
```bash
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "model": "custom/coding-assistant",
    "messages": [
      {"role": "user", "content": "Write a Python function to reverse a string"}
    ],
    "stream": true
  }'
```

**Non-streaming (clean JSON):**
```bash
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "model": "custom/coding-assistant",
    "messages": [
      {"role": "user", "content": "Write a Python function to reverse a string"}
    ],
    "stream": false
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

### Local Models (Ollama)
- `ollama/llama3.2` - Llama 3.2 (local inference)
- `ollama/codellama` - Code Llama (local inference)
- `ollama/mistral` - Mistral (local inference)
- `ollama/[any-model]` - Any model you have installed in Ollama

### Local Models (GGUF/llama.cpp)
- `local/llama3.2-1b` - Llama 3.2 1B Instruct (lightweight, fast)
- `local/[model-folder]` - Any GGUF model in your models directory

### Latest 2024-2025 Models (OpenRouter)
- `meta-llama/llama-4-behemoth` - Meta's flagship 288B parameter model
- `meta-llama/llama-4-maverick` - 17B parameter multimodal model
- `anthropic/claude-3.7-sonnet` - Latest Claude with hybrid reasoning
- `google/gemini-2.5-pro` - Enhanced complex problem-solving
- `openai/o3-pro` - Highest intelligence model
- `alibaba/qwen2.5-max` - Top-tier Chinese model
- `deepseek/deepseek-v3` - Advanced reasoning model

## 📚 Documentation

- **`API_DOCS.md`** - Complete API documentation
- **`SETUP_GUIDE.md`** - Setup and configuration guide
- **`SECURITY.md`** - Security implementation details

## 🔧 Key Features

- **OpenAI-Compatible API** - Drop-in replacement for OpenAI API
- **Multi-Provider Support** - Anthropic, OpenAI, Google, OpenRouter, Ollama
- **Local Model Inference** - Run models locally with Ollama (privacy-focused)
- **Streaming-First** - All APIs now default to streaming responses
- **Latest Models** - Includes 2024-2025's best models (Llama 4, Claude 3.7, o3)
- **Custom Models** - Create GPT-like custom assistants
- **Network Access** - Use from any device on your network
- **Rate Limiting** - Per-user, per-model limits
- **Authentication** - JWT + API key dual system
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

## 📱 Example Usage

### JavaScript (OpenAI SDK Compatible)

**Non-streaming:**
```javascript
const response = await fetch('http://YOUR_IP:3000/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key'
  },
  body: JSON.stringify({
    model: 'custom/coding-assistant',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: false
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

**Streaming:**
```javascript
const response = await fetch('http://YOUR_IP:3000/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key'
  },
  body: JSON.stringify({
    model: 'custom/coding-assistant',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
  })
});

const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = new TextDecoder().decode(value);
  console.log(chunk);
}
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

### Ollama (Local Models)
```bash
# First install Ollama: https://ollama.com/
# Pull a model locally
ollama pull llama3.2

# Use with your backend
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key" \
  -d '{
    "model": "ollama/llama3.2",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

### Local GGUF Models (llama.cpp)
```bash
# Setup Llama 3.2 1B (lightweight, fast)
./scripts/setup-llama3.2-1b.sh

# Use the local model
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key" \
  -d '{
    "model": "local/llama3.2-1b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
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