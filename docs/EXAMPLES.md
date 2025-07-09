# Usage Examples

## JavaScript (OpenAI SDK Compatible)

### Non-streaming
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

### Streaming
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

## Python
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

## cURL Examples

### Streaming (default)
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

### Non-streaming (clean JSON)
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

## Ollama (Local Models)
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

## Local GGUF Models (llama.cpp)
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

## Mobile Apps
Use your network IP (`http://YOUR_IP:3000`) in your mobile app's API configuration.