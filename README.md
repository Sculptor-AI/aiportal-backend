# AI Portal Backend

A secure, scalable "Routerbox" system providing OpenAI-compatible API endpoints with support for multiple AI providers and custom model definitions.

## 🚀 Quick Start

```bash
npm install
npm start
npm run network  # Get your network IP
```

Test with any model:
```bash
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"model": "custom/coding-assistant", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## 📚 Documentation

- **[docs/SETUP.md](docs/SETUP.md)** - Complete setup and configuration guide
- **[docs/API_DOCS.md](docs/API_DOCS.md)** - Full API documentation
- **[docs/MODELS.md](docs/MODELS.md)** - Available models and providers
- **[docs/EXAMPLES.md](docs/EXAMPLES.md)** - Usage examples in multiple languages
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[docs/TOOLS_SYSTEM.md](docs/TOOLS_SYSTEM.md)** - Tools system documentation
- **[docs/TOOLS_API.md](docs/TOOLS_API.md)** - Tools API reference

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