# AI Portal Backend - Complete API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
   - [Authentication Endpoints](#authentication-endpoints)
   - [Chat API](#chat-api)
   - [Deep Research API](#deep-research-api)
   - [Live Audio API](#live-audio-api)
   - [Tools System](#tools-system)
   - [Custom Models](#custom-models)
   - [Usage Statistics](#usage-statistics)
5. [Available Models](#available-models)
6. [Configuration](#configuration)
7. [Security & Rate Limiting](#security--rate-limiting)
8. [Error Handling](#error-handling)
9. [Examples](#examples)
10. [Troubleshooting](#troubleshooting)

## Overview

The AI Portal Backend is a secure, scalable "Routerbox" system providing OpenAI-compatible API endpoints with support for multiple AI providers, custom model definitions, real-time web search capabilities, live audio transcription, and an extensible Tools System for function calling and code execution.

### Key Features
- **OpenAI-Compatible API** - Drop-in replacement for OpenAI API
- **Multi-Provider Support** - Anthropic, OpenAI, Google, OpenRouter, Ollama
- **Local Model Inference** - Run models locally with Ollama (privacy-focused)
- **Real-time Web Search** - Powered by Brave Search API
- **Live Audio Transcription** - Google Gemini Live API integration
- **Deep Research** - Multi-agent research system
- **Tools System** - Extensible function calling and code execution
- **Custom Models** - Create specialized AI assistants
- **Streaming-First** - All APIs support real-time streaming
- **Enterprise Security** - JWT auth, API keys, rate limiting
- **Production Ready** - Docker, PM2, monitoring support

### Base URLs
- **Production**: `https://api.sculptorai.org` (Recommended - Cloudflare-secured)
- **Local Development**: `http://localhost:3000`

## Quick Start

### 1. Installation
```bash
npm install
npm start
npm run network  # Get your network IP
```

### 2. Create User and API Key
```bash
# Register
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

### 3. Test Chat API
```bash
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"model": "custom/coding-assistant", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Authentication

The API supports two authentication methods:

### 1. API Keys (Recommended)
```http
X-API-Key: ak_1234567890abcdef...
```

### 2. JWT Tokens (Temporary - 7 days)
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## API Endpoints

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "your_username",
  "password": "YourPass123!",
  "email": "your@email.com"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one number
- At least one special character

**Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "userId": 1
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "YourPass123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "your_username"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "abc123..."
  }
}
```

#### Generate API Key
```http
POST /api/auth/api-keys
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN

{
  "keyName": "My Development Key"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "apiKey": "ak_1234567890abcdef...",
    "keyName": "My Development Key",
    "message": "API key generated successfully. Store it securely - it will not be shown again."
  }
}
```

#### List API Keys
```http
GET /api/auth/api-keys
Authorization: Bearer YOUR_JWT_TOKEN
```

### Chat API

The main chat API supports both standard AI chat completions and enhanced web search capabilities. All models can be augmented with real-time web search using the Brave Search API.

#### Chat Completions (OpenAI-Compatible)
```http
POST /api/v1/chat/completions
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "model": "custom/coding-assistant",
  "messages": [
    {
      "role": "user",
      "content": "How do I implement a binary search in Python?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000,
  "stream": false
}
```

#### Chat with Web Search
```http
POST /api/v1/chat/completions
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "model": "anthropic/claude-4-sonnet",
  "messages": [
    {
      "role": "user",
      "content": "What is the latest news about artificial intelligence?"
    }
  ],
  "web_search": true,
  "temperature": 0.7,
  "stream": false
}
```

**Web Search Parameters:**
- `web_search` (boolean): Enable real-time web search using Brave Search API
- `search_query` (string, optional): Custom search query. If not provided, uses the user's message content

**How Web Search Works:**
1. The system performs a web search using your query
2. Scrapes and extracts content from top search results
3. Provides this current information to the AI model
4. The model synthesizes an answer based on the latest web data
5. Source links are appended at the end in `<links>` format for easy parsing

**Response:**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "custom/coding-assistant",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here's how to implement binary search in Python:\n\n```python\ndef binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    \n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    \n    return -1\n```"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 100,
    "total_tokens": 120
  }
}
```

**Web Search Response (with embedded links):**
```json
{
  "id": "chatcmpl-124",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "anthropic/claude-4-sonnet",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Based on the latest search results, here are recent developments in artificial intelligence:\n\n1. **New LLM Architectures**: Recent breakthroughs in transformer architectures have led to more efficient models with improved reasoning capabilities.\n\n2. **AI Safety Progress**: Researchers have developed new alignment techniques to ensure AI systems better follow human intentions and values.\n\nThese developments represent significant progress in making AI more capable, safer, and more useful for real-world applications. <links> https://www.technologyreview.com/ai-breakthroughs ; https://www.anthropic.com/safety-progress-2024 </links>"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1250,
    "completion_tokens": 300,
    "total_tokens": 1550
  }
}
```

#### Streaming Chat
```http
POST /api/v1/chat/completions
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "model": "custom/fast-responder",
  "messages": [
    {
      "role": "user",
      "content": "Tell me a joke"
    }
  ],
  "stream": true
}
```

**Response:** Server-Sent Events (SSE)
```
data: {"choices":[{"delta":{"content":"Why"}}]}
data: {"choices":[{"delta":{"content":" don't"}}]}
data: {"choices":[{"delta":{"content":" scientists"}}]}
data: [DONE]
```

#### List Models
```http
GET /api/v1/chat/models
X-API-Key: YOUR_API_KEY
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "anthropic/claude-4-opus",
      "object": "model",
      "created": 1677649963,
      "owned_by": "anthropic"
    },
    {
      "id": "custom/coding-assistant",
      "object": "model",
      "created": 1677649963,
      "owned_by": "custom",
      "description": "An AI assistant specialized in programming",
      "name": "Coding Assistant",
      "capabilities": ["text", "code"]
    }
  ]
}
```

### Deep Research API

The Deep Research API provides an advanced multi-agent research capability that breaks down complex queries into sub-questions, processes them in parallel using multiple Gemini 2.5 Flash agents with Google Search grounding, and synthesizes the results into a comprehensive final report.

#### Perform Deep Research
```http
POST /api/deep-research
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "query": "What are the latest developments in quantum computing and their potential impact on cryptography?",
  "model": "google/gemini-2.5-pro",
  "maxAgents": 6
}
```

**Parameters:**
- **query** (required): The research question or topic you want to investigate
- **model** (required): The model to use for task decomposition and synthesis
- **maxAgents** (optional): Number of parallel research agents to deploy (2-12, default: 8)

**Response:** Server-Sent Events (SSE)

**Progress Events:**
```json
{
  "type": "progress",
  "message": "Current status message",
  "progress": 0-100
}
```

**Completion Event:**
```json
{
  "type": "completion",
  "id": "deep-research-timestamp",
  "object": "deep_research.completion",
  "created": 1234567890,
  "model": "google/gemini-2.5-pro",
  "query": "Original research query",
  "agentCount": 6,
  "subQuestions": [
    "Sub-question 1",
    "Sub-question 2"
  ],
  "response": "Comprehensive synthesized research report",
  "sources": [
    {
      "url": "https://example.com/source1",
      "title": "Source Title",
      "relevantToQuestions": ["Sub-question 1", "Sub-question 2"]
    }
  ]
}
```

### Live Audio API

The AI Portal supports real-time audio transcription powered by Google's Gemini Live API. This feature provides low-latency, real-time voice interactions with advanced audio processing capabilities.

#### Transcribe Audio Chunk
```http
POST /api/v1/live-audio/transcribe
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "audio_data": "BASE64_ENCODED_AUDIO_CHUNK",
  "format": "webm",
  "sample_rate": 48000,
  "channels": 1,
  "session_id": "unique_session_id"
}
```

**Parameters:**
- `audio_data` (string, required): Base64 encoded chunk of audio data
- `format` (string, required): The audio format (e.g., "webm", "wav", "mp3")
- `sample_rate` (integer, optional): The sample rate of the audio (default: 48000)
- `channels` (integer, optional): Number of audio channels (default: 1)
- `session_id` (string, optional): Session identifier for tracking (default: "default")

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "unique_session_id",
    "inputTranscription": "This is what the user said",
    "outputTranscription": "This is what the AI responded (if audio response)",
    "transcript": "This is the AI's text response",
    "audioBuffer": "base64_encoded_audio_data",
    "confidence": 0.95,
    "timestamp": "2024-07-09T12:00:00.000Z",
    "model": "gemini-live-2.5-flash-preview",
    "responseModality": "text"
  }
}
```

#### Start Audio Session
```http
POST /api/v1/live-audio/session/start
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "session_id": "unique_session_id",
  "model": "gemini-live-2.5-flash-preview",
  "response_modality": "text",
  "input_transcription": true,
  "output_transcription": true
}
```

**Available Models:**
- `gemini-live-2.5-flash-preview` - Half-cascade model (recommended)
- `gemini-2.5-flash-preview-native-audio-dialog` - Native audio with natural speech
- `gemini-2.5-flash-exp-native-audio-thinking-dialog` - Native audio with thinking capabilities
- `gemini-2.0-flash-live-001` - Alternative half-cascade model

#### End Audio Session
```http
POST /api/v1/live-audio/session/end
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "session_id": "unique_session_id"
}
```

#### Get Session Status
```http
GET /api/v1/live-audio/session/{session_id}/status
X-API-Key: YOUR_API_KEY
```

### Tools System

The AI Portal Backend includes a comprehensive Tools System that allows models to call external functions and execute code during conversations.

#### Features
- **Flexible Architecture**: Each tool has its own JSON config and Python controller
- **Security First**: Tools are disabled by default and require explicit enablement
- **Per-Model Configuration**: Tools can be enabled/disabled for specific models
- **Streaming Integration**: Tool usage is streamed to the frontend with real-time status updates
- **Admin Management**: Full admin panel for managing tools and their configurations

#### Get All Tools
```http
GET /api/admin/tools
Authorization: Bearer <admin-token>
```

#### Enable/Disable Tool
```http
PUT /api/admin/tools/{toolId}/enabled
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "enabled": true
}
```

#### Update Tool Configuration
```http
PUT /api/admin/tools/{toolId}
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "maxExecutionTime": 10000,
  "allowedModels": ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"]
}
```

#### Streaming Events

**Tool Call Started:**
```json
{
  "type": "tool_call",
  "tool_name": "test-tool",
  "tool_id": "call_123",
  "status": "executing"
}
```

**Tool Execution Result:**
```json
{
  "type": "tool_result",
  "tool_name": "test-tool",
  "tool_id": "call_123",
  "status": "completed",
  "result": {
    "success": true,
    "message": "Tools system working! Received: Hello World",
    "timestamp": "2024-07-03T12:00:00.000Z"
  }
}
```

### Custom Models

#### List Custom Models
```http
GET /api/v1/custom-models
X-API-Key: YOUR_API_KEY
```

#### Create Custom Model
```http
POST /api/v1/custom-models
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "name": "My Custom Assistant",
  "description": "A specialized assistant for my use case",
  "base_model": "anthropic/claude-4-sonnet",
  "system_prompt": "You are a helpful assistant that specializes in...",
  "rate_limits": {
    "per_minute": 5,
    "per_hour": 50,
    "per_day": 200
  },
  "provider": "anthropic",
  "provider_config": {
    "temperature": 0.5,
    "max_tokens": 2000
  },
  "capabilities": ["text", "analysis"],
  "pricing": {
    "prompt": 0.003,
    "completion": 0.015
  }
}
```

#### Update Custom Model
```http
PUT /api/v1/custom-models/my-custom-assistant
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "system_prompt": "Updated system prompt...",
  "rate_limits": {
    "per_minute": 10,
    "per_hour": 100,
    "per_day": 500
  }
}
```

#### Delete Custom Model
```http
DELETE /api/v1/custom-models/my-custom-assistant
X-API-Key: YOUR_API_KEY
```

### Usage Statistics

#### Get Usage Stats
```http
GET /api/v1/usage
X-API-Key: YOUR_API_KEY
```

#### Get Model-Specific Usage
```http
GET /api/v1/usage/custom/coding-assistant
X-API-Key: YOUR_API_KEY
```

#### Reset Usage Stats
```http
DELETE /api/v1/usage
Content-Type: application/json
X-API-Key: YOUR_API_KEY

{
  "model": "custom/coding-assistant"  // Optional: specific model
}
```

## Available Models

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

## Configuration

### Environment Variables
```bash
# Server
PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Database
DATABASE_PATH=./database/aiportal.db

# Provider API Keys (get real keys for actual AI responses)
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
OPENAI_API_KEY=sk-your-openai-key-here
GOOGLE_API_KEY=your-google-ai-studio-key-here

# Web Search API Key (for web search functionality)
BRAVE_API_KEY=your-brave-search-api-key-here

# Ollama (for local models)
OLLAMA_BASE_URL=http://localhost:11434

# CORS (optional - defaults allow local network)
CORS_ORIGINS=http://localhost:3009,http://localhost:3010
```

### Where to Get API Keys
- **OpenRouter**: https://openrouter.ai/ (Recommended - access to all models)
- **Anthropic**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/
- **Google AI**: https://ai.google.dev/
- **Brave Search**: https://api.search.brave.com/ (For web search functionality)

### Model Configuration

Each model can be configured with a JSON file in the `/model_config/models/` directory:

```json
{
  "id": "custom/my-assistant",
  "name": "My Custom Assistant",
  "description": "A specialized assistant",
  "provider": "anthropic",
  "model": "claude-3.5-sonnet-20241022",
  "systemPrompt": "You are a helpful assistant...",
  "capabilities": {
    "text": true,
    "vision": false,
    "tools": true,
    "web_search": true
  },
  "rateLimits": {
    "perMinute": 10,
    "perHour": 100,
    "perDay": 1000
  },
  "providerConfig": {
    "temperature": 0.7,
    "maxTokens": 4000
  },
  "tools": {
    "enabled": true,
    "allowedTools": ["calculator", "code-execution"],
    "maxConcurrentCalls": 3
  }
}
```

## Security & Rate Limiting

### Rate Limits
- **Authentication endpoints**: 5 requests per 15 minutes per IP
- **Registration**: 3 requests per hour per IP
- **Custom models**: Configurable per model (minute/hour/day)

### Security Features
- Password requirements (8+ chars, number, special character)
- JWT token expiration and rotation
- API key hashing and secure storage
- Input validation on all endpoints
- CORS protection and network security
- SQL injection prevention
- No conversation data storage (privacy-focused)
- Cloudflare DDoS and bot protection

### CORS Configuration
**Current Status: DISABLED** ✅
- **Origin**: `*` (All origins allowed)
- **Methods**: `GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH`
- **Headers**: `*` (All headers allowed)
- **Credentials**: `true` (Supports authentication)

## Error Handling

### Common Error Responses

#### Authentication Errors
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

#### Rate Limit Errors
```json
{
  "error": {
    "message": "Rate limit exceeded for minute. Limit: 10, Current: 11",
    "type": "rate_limit_exceeded",
    "details": {
      "limitType": "minute",
      "limit": 10,
      "current": 11,
      "retryAfter": 45
    }
  }
}
```

#### Validation Errors
```json
{
  "error": {
    "message": "Missing or invalid required fields: model and messages are required",
    "type": "invalid_request_error"
  }
}
```

## Examples

### JavaScript/Node.js

#### Standard Chat Request
```javascript
const response = await fetch('https://api.sculptorai.org/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  body: JSON.stringify({
    model: 'custom/coding-assistant',
    messages: [
      { role: 'user', content: 'Write a function to reverse a string' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

#### Chat with Web Search
```javascript
const response = await fetch('https://api.sculptorai.org/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  body: JSON.stringify({
    model: 'anthropic/claude-4-sonnet',
    messages: [
      { role: 'user', content: 'What are the latest AI safety developments?' }
    ],
    web_search: true
  })
});

const data = await response.json();
console.log('Response:', data.choices[0].message.content);

// Parse links from response
function parseLinksFromResponse(content) {
  const linkMatch = content.match(/<links>\s*(.*?)\s*<\/links>/);
  if (linkMatch) {
    const linksString = linkMatch[1];
    const links = linksString.split(' ; ').map(url => url.trim());
    const cleanContent = content.replace(/<links>.*?<\/links>/, '').trim();
    return { content: cleanContent, links: links };
  }
  return { content: content, links: [] };
}

const { content, links } = parseLinksFromResponse(data.choices[0].message.content);
console.log('Clean content:', content);
console.log('Source links:', links);
```

#### Streaming with Web Search
```javascript
const response = await fetch('https://api.sculptorai.org/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      { role: 'user', content: 'Latest space exploration news' }
    ],
    web_search: true,
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullContent = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        // Parse links from final content
        const { content, links } = parseLinksFromResponse(fullContent);
        console.log('\nFinal content:', content);
        console.log('Source links:', links);
        return;
      }
      
      try {
        const parsed = JSON.parse(data);
        if (parsed.choices?.[0]?.delta?.content) {
          const deltaContent = parsed.choices[0].delta.content;
          fullContent += deltaContent;
          process.stdout.write(deltaContent);
        }
      } catch (e) {
        // Skip parsing errors
      }
    }
  }
}
```

#### Deep Research Example
```javascript
async function performDeepResearch(query, model, maxAgents = 8) {
  const response = await fetch('https://api.sculptorai.org/api/deep-research', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'ak_your_api_key_here'
    },
    body: JSON.stringify({
      query,
      model,
      maxAgents
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('Research completed');
          return;
        }

        try {
          const event = JSON.parse(data);
          
          if (event.type === 'progress') {
            console.log(`Progress: ${event.progress}% - ${event.message}`);
          } else if (event.type === 'completion') {
            console.log('Final Report:', event.response);
            console.log('Sources:', event.sources);
          } else if (event.type === 'error') {
            console.error('Error:', event.message);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

// Usage
performDeepResearch(
  "What are the latest developments in quantum computing and their potential impact on cryptography?",
  "google/gemini-2.5-pro",
  6
);
```

#### Live Audio Example
```javascript
// Start audio session
const startSession = await fetch('https://api.sculptorai.org/api/v1/live-audio/session/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  body: JSON.stringify({
    session_id: 'web_session_' + Date.now()
  })
});

// Capture audio and send for transcription
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        // Convert audio chunk to base64
        const arrayBuffer = await event.data.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        // Send for transcription
        const response = await fetch('https://api.sculptorai.org/api/v1/live-audio/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'ak_your_api_key_here'
          },
          body: JSON.stringify({
            audio_data: base64Audio,
            format: 'webm',
            sample_rate: 48000,
            session_id: 'web_session_' + Date.now()
          })
        });
        
        const result = await response.json();
        console.log('Transcription:', result.data.transcript);
      }
    };

    mediaRecorder.start(1000); // Send chunk every 1 second
  });
```

### Python

#### Standard Request
```python
import requests

response = requests.post('https://api.sculptorai.org/api/v1/chat/completions', 
  headers={
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  json={
    'model': 'custom/data-analyst',
    'messages': [
      {'role': 'user', 'content': 'Analyze this data trend...'}
    ]
  }
)

print(response.json()['choices'][0]['message']['content'])
```

#### Request with Web Search
```python
import requests
import re

def parse_links_from_response(content):
    link_match = re.search(r'<links>\s*(.*?)\s*</links>', content)
    if link_match:
        links_string = link_match.group(1)
        links = [url.strip() for url in links_string.split(' ; ')]
        clean_content = re.sub(r'<links>.*?</links>', '', content).strip()
        return {'content': clean_content, 'links': links}
    return {'content': content, 'links': []}

response = requests.post('https://api.sculptorai.org/api/v1/chat/completions', 
  headers={
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  json={
    'model': 'anthropic/claude-4-sonnet',
    'messages': [
      {'role': 'user', 'content': 'What is the current state of renewable energy adoption globally?'}
    ],
    'web_search': True
  }
)

result = response.json()
content_with_links = result['choices'][0]['message']['content']
parsed = parse_links_from_response(content_with_links)

print('Response:', parsed['content'])
print('\nSource Links:')
for link in parsed['links']:
    print(f"- {link}")
```

#### Deep Research Example
```python
import requests
import json

def perform_deep_research(query, model, max_agents=8):
    response = requests.post('https://api.sculptorai.org/api/deep-research',
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': 'ak_your_api_key_here'
        },
        json={
            'query': query,
            'model': model,
            'maxAgents': max_agents
        },
        stream=True
    )
    
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data = line[6:]
                if data == '[DONE]':
                    print('Research completed')
                    break
                
                try:
                    event = json.loads(data)
                    
                    if event['type'] == 'progress':
                        print(f"Progress: {event['progress']}% - {event['message']}")
                    elif event['type'] == 'completion':
                        print('Final Report:', event['response'])
                        print('Sources:', event['sources'])
                    elif event['type'] == 'error':
                        print('Error:', event['message'])
                except json.JSONDecodeError:
                    pass

# Usage
perform_deep_research(
    "What are the latest developments in quantum computing and their potential impact on cryptography?",
    "google/gemini-2.5-pro",
    6
)
```

#### Live Audio Example
```python
import requests
import base64

# Start session
session_response = requests.post('https://api.sculptorai.org/api/v1/live-audio/session/start', 
  headers={
    'Content-Type': 'application/json',
    'X-API-Key': 'ak_your_api_key_here'
  },
  json={'session_id': 'python_session_123'}
)

# Read audio file and transcribe
with open('audio_chunk.webm', 'rb') as audio_file:
    audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
    
    response = requests.post('https://api.sculptorai.org/api/v1/live-audio/transcribe', 
      headers={
        'Content-Type': 'application/json',
        'X-API-Key': 'ak_your_api_key_here'
      },
      json={
        'audio_data': audio_data,
        'format': 'webm',
        'sample_rate': 48000,
        'session_id': 'python_session_123'
      }
    )
    
    result = response.json()
    print('Transcription:', result['data']['transcript'])
```

### cURL

#### Standard Request
```bash
curl -X POST https://api.sculptorai.org/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key_here" \
  -d '{
    "model": "custom/creative-writer",
    "messages": [
      {"role": "user", "content": "Write a short story about a robot"}
    ]
  }'
```

#### Request with Web Search
```bash
curl -X POST https://api.sculptorai.org/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key_here" \
  -d '{
    "model": "google/gemini-2.5-pro",
    "messages": [
      {"role": "user", "content": "What are the latest cybersecurity threats in 2024?"}
    ],
    "web_search": true
  }'
```

#### Streaming with Web Search
```bash
curl -X POST https://api.sculptorai.org/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key_here" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [
      {"role": "user", "content": "Current stock market analysis"}
    ],
    "web_search": true,
    "stream": true
  }' \
  --no-buffer
```

#### Deep Research
```bash
curl -X POST https://api.sculptorai.org/api/deep-research \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key_here" \
  -d '{
    "query": "What are the latest developments in quantum computing and their potential impact on cryptography?",
    "model": "google/gemini-2.5-pro",
    "maxAgents": 6
  }'
```

#### Ollama (Local Models)
```bash
# First install Ollama: https://ollama.com/
# Pull a model locally
ollama pull llama3.2

# Use with your backend
curl -X POST https://api.sculptorai.org/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key" \
  -d '{
    "model": "ollama/llama3.2",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

#### Local GGUF Models (llama.cpp)
```bash
# Setup Llama 3.2 1B (lightweight, fast)
./scripts/setup-llama3.2-1b.sh

# Use the local model
curl -X POST https://api.sculptorai.org/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_your_api_key" \
  -d '{
    "model": "local/llama3.2-1b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

## Troubleshooting

### Common Issues

#### "Port already in use"
```bash
PORT=3001 npm start
```

#### "Invalid API key"
- Make sure you're using the API key (starts with `ak_`) in `X-API-Key` header
- Or use JWT token in `Authorization: Bearer` header

#### "CORS error"
- ✅ **FIXED**: CORS is now completely disabled for maximum compatibility
- All origins are allowed (`*`)
- Use `https://api.sculptorai.org` for best experience

#### "Rate limit exceeded"
- Wait for the rate limit window to reset
- Check your usage with `GET /api/v1/usage`

#### "No AI response"
- Verify you have real API keys in your .env file
- Check server logs for provider authentication errors

#### "Web search not working"
- Ensure `BRAVE_API_KEY` is set in your .env file
- Get API key from https://api.search.brave.com/
- Check Brave API rate limits (free tier: 2,000 searches/month)

#### "Sources not appearing"
- Web search may have failed but chat still works
- Check server logs for search errors
- Links should appear in `<links>` format at end of response

#### "Audio transcription failing"
- Ensure `GOOGLE_API_KEY` is set for Gemini Live API
- Check audio format compatibility (webm, wav, mp3)
- Verify session is started before sending audio

#### "Tools not working"
- Check if tools are enabled globally and for the specific model
- Verify tool configuration in `/tools/config.json`
- Ensure Python dependencies are installed for tool execution

### Health Check
```bash
curl https://api.sculptorai.org/health
```

Should return: `{"status":"OK","message":"Server is running"}`

### Getting Help
- Check server logs for detailed error messages
- Use the health endpoint to verify server status
- Ensure your network allows connections on the server port
- Monitor API usage in provider dashboards

## Production Deployment

For production use:
1. Set strong JWT_SECRET
2. Add real provider API keys (including BRAVE_API_KEY)
3. Configure CORS for your domain
4. Set NODE_ENV=production
5. Use HTTPS with reverse proxy (nginx)
6. Set up monitoring and logging
7. Configure database backups
8. Use process manager (PM2)
9. Monitor API usage and upgrade plans if needed
10. Consider caching responses to reduce API calls

**The system is production-ready with comprehensive security, monitoring, scalability, and real-time capabilities!**