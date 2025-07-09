# AI Portal Backend - Development Guide

## Table of Contents
1. [Project Architecture](#project-architecture)
2. [Code Examples](#code-examples)
3. [Development Workflow](#development-workflow)
4. [Testing](#testing)
5. [Contributing](#contributing)
6. [Code Style](#code-style)
7. [Security Guidelines](#security-guidelines)
8. [Performance Optimization](#performance-optimization)
9. [Debugging](#debugging)
10. [Deployment](#deployment)

## Project Architecture

### Directory Structure
```
aiportal-backend/
├── server.js                  # Main server entry point
├── package.json               # Dependencies and scripts
├── .env                       # Environment variables
├── ecosystem.config.js        # PM2 configuration
├── docker-compose.yml         # Docker setup
├── README.md                  # Project overview
├── CLAUDE.md                  # Project instructions
├── controllers/               # Request handlers
│   ├── chatController.js
│   ├── deepResearchController.js
│   ├── imageGenerationController.js
│   ├── liveAudioController.js
│   ├── modelController.js
│   ├── rssController.js
│   └── searchController.js
├── routes/                    # API route definitions
│   ├── api.js                # Main API routes
│   ├── authRoutes.js          # Authentication routes
│   ├── customModelRoutes.js   # Custom model routes
│   ├── imageGenerationRoutes.js
│   ├── liveAudioRoutes.js
│   ├── rateLimitRoutes.js
│   ├── routerboxRoutes.js
│   ├── rssRoutes.js
│   ├── toolsRoutes.js
│   ├── usageRoutes.js
│   └── adminToolsRoutes.js
├── services/                  # Business logic
│   ├── anthropicService.js
│   ├── braveSearchService.js
│   ├── customModelService.js
│   ├── geminiService.js
│   ├── liveAudioService.js
│   ├── localInferenceService.js
│   ├── modelConfigService.js
│   ├── ollamaService.js
│   ├── openaiService.js
│   ├── rateLimitQueueService.js
│   ├── rateLimitingService.js
│   ├── routerboxService.js
│   ├── systemPromptService.js
│   └── toolsService.js
├── middleware/                # Express middleware
│   ├── authMiddleware.js
│   ├── rateLimitMiddleware.js
│   └── validation.js
├── database/                  # Database files
│   ├── connection.js
│   ├── schema.sql
│   └── aiportal.db
├── model_config/              # Model configurations
│   ├── config.json
│   └── models/
│       ├── anthropic/
│       ├── openai/
│       ├── google/
│       └── custom/
├── tools/                     # Tools system
│   ├── config.json
│   ├── test-tool/
│   ├── code-execution/
│   └── wolfram-alpha/
├── utils/                     # Utility functions
│   ├── auth.js
│   ├── encryption.js
│   ├── formatters.js
│   └── toolConfigValidator.js
├── scripts/                   # Setup and utility scripts
│   └── setup-llama3.2-1b.sh
├── docs/                      # Documentation
│   ├── COMPLETE_API_DOCUMENTATION.md
│   ├── COMPLETE_SETUP_GUIDE.md
│   ├── DEVELOPMENT_GUIDE.md
│   └── index.html
├── tests/                     # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── logs/                      # Application logs
    ├── access.log
    ├── error.log
    └── combined.log
```

### Core Components

#### 1. Router System
The AI Portal uses a centralized routing system that handles all API requests and routes them to appropriate providers.

```javascript
// routes/api.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');

// Apply middleware
router.use(authMiddleware);
router.use(rateLimitMiddleware);

// Chat completions endpoint
router.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, stream, web_search, ...options } = req.body;
    
    // Route to appropriate service based on model prefix
    const result = await routerboxService.handleChatCompletion({
      model,
      messages,
      stream,
      web_search,
      options,
      user: req.user
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

#### 2. Service Layer
Services contain the business logic for interacting with different AI providers.

```javascript
// services/anthropicService.js
const axios = require('axios');

class AnthropicService {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.baseURL = 'https://api.anthropic.com/v1';
  }

  async createMessage(model, messages, options = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/messages`, {
        model: model.replace('anthropic/', ''),
        messages: this.formatMessages(messages),
        max_tokens: options.max_tokens || 4000,
        temperature: options.temperature || 0.7,
        stream: options.stream || false
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        responseType: options.stream ? 'stream' : 'json'
      });

      return this.formatResponse(response.data, options.stream);
    } catch (error) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  formatMessages(messages) {
    // Convert OpenAI format to Anthropic format
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
  }

  formatResponse(data, isStream) {
    if (isStream) {
      return this.handleStreamResponse(data);
    }
    
    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.content[0].text
        },
        finish_reason: data.stop_reason
      }],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens
      }
    };
  }
}

module.exports = new AnthropicService();
```

#### 3. Model Configuration System
Dynamic model configuration allows hot-reloading of model settings.

```javascript
// services/modelConfigService.js
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

class ModelConfigService {
  constructor() {
    this.models = new Map();
    this.configPath = path.join(__dirname, '../model_config');
    this.loadConfigurations();
    this.watchConfigurations();
  }

  loadConfigurations() {
    try {
      // Load global config
      const globalConfigPath = path.join(this.configPath, 'config.json');
      this.globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));

      // Load all model configs
      this.loadModelsFromDirectory(path.join(this.configPath, 'models'));
      
      console.log(`Loaded ${this.models.size} model configurations`);
    } catch (error) {
      console.error('Error loading model configurations:', error);
    }
  }

  loadModelsFromDirectory(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        this.loadModelsFromDirectory(fullPath);
      } else if (item.name.endsWith('.json')) {
        try {
          const config = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          this.models.set(config.id, config);
        } catch (error) {
          console.error(`Error loading model config ${fullPath}:`, error);
        }
      }
    }
  }

  watchConfigurations() {
    if (!this.globalConfig.hotReload) return;

    const watcher = chokidar.watch(this.configPath, {
      ignored: /node_modules/,
      persistent: true
    });

    watcher.on('change', (filePath) => {
      console.log(`Model configuration changed: ${filePath}`);
      this.loadConfigurations();
    });
  }

  getModel(modelId) {
    return this.models.get(modelId);
  }

  getAllModels() {
    return Array.from(this.models.values());
  }

  getEnabledModels() {
    return Array.from(this.models.values()).filter(model => model.enabled);
  }
}

module.exports = new ModelConfigService();
```

#### 4. Authentication System
JWT and API key based authentication with rate limiting.

```javascript
// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const db = require('../database/connection');
const bcrypt = require('bcrypt');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const apiKey = req.header('X-API-Key');

    if (apiKey) {
      // API Key authentication
      const user = await authenticateApiKey(apiKey);
      if (!user) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      req.user = user;
      req.authMethod = 'api_key';
    } else if (token) {
      // JWT authentication
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await getUserById(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      req.user = user;
      req.authMethod = 'jwt';
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid authentication' });
  }
};

const authenticateApiKey = async (apiKey) => {
  try {
    // Hash the provided API key
    const hashedKey = bcrypt.hashSync(apiKey, 10);
    
    // Find matching API key in database
    const result = await db.get(`
      SELECT u.*, ak.key_name, ak.last_used 
      FROM users u 
      JOIN api_keys ak ON u.id = ak.user_id 
      WHERE ak.key_hash = ? AND ak.is_active = 1 AND u.is_active = 1
    `, [hashedKey]);

    if (result) {
      // Update last used timestamp
      await db.run(`
        UPDATE api_keys 
        SET last_used = CURRENT_TIMESTAMP 
        WHERE key_hash = ?
      `, [hashedKey]);
    }

    return result;
  } catch (error) {
    console.error('API key authentication error:', error);
    return null;
  }
};

const getUserById = async (userId) => {
  return await db.get(`
    SELECT * FROM users 
    WHERE id = ? AND is_active = 1
  `, [userId]);
};

module.exports = authMiddleware;
```

#### 5. Tools System
Extensible function calling system with Python execution.

```javascript
// services/toolsService.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ToolsService {
  constructor() {
    this.toolsPath = path.join(__dirname, '../tools');
    this.loadToolsConfig();
  }

  loadToolsConfig() {
    try {
      const configPath = path.join(this.toolsPath, 'config.json');
      this.globalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Load individual tool configs
      this.tools = new Map();
      const toolDirs = fs.readdirSync(this.toolsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const toolDir of toolDirs) {
        try {
          const toolConfigPath = path.join(this.toolsPath, toolDir, 'config.json');
          const toolConfig = JSON.parse(fs.readFileSync(toolConfigPath, 'utf8'));
          this.tools.set(toolConfig.id, toolConfig);
        } catch (error) {
          console.error(`Error loading tool config for ${toolDir}:`, error);
        }
      }
    } catch (error) {
      console.error('Error loading tools configuration:', error);
    }
  }

  async executeTool(toolId, parameters, options = {}) {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    if (!tool.enabled) {
      throw new Error(`Tool ${toolId} is disabled`);
    }

    const controllerPath = path.join(this.toolsPath, toolId, 'controller.py');
    if (!fs.existsSync(controllerPath)) {
      throw new Error(`Tool controller not found: ${controllerPath}`);
    }

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [controllerPath], {
        timeout: tool.maxExecutionTime || 30000
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Invalid JSON response from tool: ${stdout}`));
          }
        } else {
          reject(new Error(`Tool execution failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Tool execution error: ${error.message}`));
      });

      // Send parameters to Python script
      pythonProcess.stdin.write(JSON.stringify(parameters));
      pythonProcess.stdin.end();
    });
  }

  getAvailableTools() {
    return Array.from(this.tools.values()).filter(tool => tool.enabled);
  }

  isToolAllowedForModel(toolId, modelId) {
    const tool = this.tools.get(toolId);
    if (!tool) return false;

    if (tool.allowedModels.includes('*')) return true;
    return tool.allowedModels.includes(modelId);
  }
}

module.exports = new ToolsService();
```

## Code Examples

### 1. Basic Chat API Integration

#### Node.js/Express Client
```javascript
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const AIPORTAL_BASE_URL = 'https://api.sculptorai.org';
const API_KEY = 'ak_your_api_key_here';

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, model = 'custom/coding-assistant' } = req.body;

    const response = await axios.post(
      `${AIPORTAL_BASE_URL}/api/v1/chat/completions`,
      {
        model,
        messages: [{ role: 'user', content: message }],
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

app.listen(3001, () => {
  console.log('Client server running on port 3001');
});
```

#### React Hook for Chat
```jsx
import { useState, useCallback } from 'react';

const useAIChat = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (message, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://api.sculptorai.org/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REACT_APP_AI_API_KEY
        },
        body: JSON.stringify({
          model: options.model || 'custom/coding-assistant',
          messages: [{ role: 'user', content: message }],
          stream: options.stream || false,
          web_search: options.webSearch || false,
          temperature: options.temperature || 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendStreamingMessage = useCallback(async (message, onChunk, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://api.sculptorai.org/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REACT_APP_AI_API_KEY
        },
        body: JSON.stringify({
          model: options.model || 'custom/coding-assistant',
          messages: [{ role: 'user', content: message }],
          stream: true,
          web_search: options.webSearch || false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

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
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendMessage, sendStreamingMessage, loading, error };
};

// Usage in React component
const ChatComponent = () => {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const { sendMessage, sendStreamingMessage, loading, error } = useAIChat();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // For non-streaming
      const aiResponse = await sendMessage(message, {
        model: 'custom/coding-assistant',
        webSearch: true
      });
      setResponse(aiResponse);

      // For streaming
      setResponse('');
      await sendStreamingMessage(message, (chunk) => {
        setResponse(prev => prev + chunk);
      });
    } catch (error) {
      console.error('Chat error:', error);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
      
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {response && <div>{response}</div>}
    </div>
  );
};

export default ChatComponent;
```

### 2. Deep Research Integration

#### Python Deep Research Client
```python
import requests
import json
import time
from typing import Iterator, Dict, Any

class DeepResearchClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'X-API-Key': api_key
        })

    def perform_research(
        self, 
        query: str, 
        model: str = "google/gemini-2.5-pro", 
        max_agents: int = 8
    ) -> Iterator[Dict[str, Any]]:
        """
        Perform deep research and yield progress updates.
        """
        response = self.session.post(
            f"{self.base_url}/api/deep-research",
            json={
                "query": query,
                "model": model,
                "maxAgents": max_agents
            },
            stream=True
        )
        
        response.raise_for_status()
        
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data == '[DONE]':
                        break
                    
                    try:
                        event = json.loads(data)
                        yield event
                    except json.JSONDecodeError:
                        continue

    def research_with_callback(
        self, 
        query: str, 
        progress_callback=None, 
        completion_callback=None,
        **kwargs
    ):
        """
        Perform research with callbacks for progress and completion.
        """
        for event in self.perform_research(query, **kwargs):
            if event['type'] == 'progress':
                if progress_callback:
                    progress_callback(event['progress'], event['message'])
            elif event['type'] == 'completion':
                if completion_callback:
                    completion_callback(event)
            elif event['type'] == 'error':
                raise Exception(f"Research error: {event['message']}")

# Usage example
def main():
    client = DeepResearchClient(
        base_url="https://api.sculptorai.org",
        api_key="ak_your_api_key_here"
    )

    def on_progress(progress, message):
        print(f"Progress: {progress}% - {message}")

    def on_completion(result):
        print("\n" + "="*50)
        print("RESEARCH COMPLETED")
        print("="*50)
        print(f"Query: {result['query']}")
        print(f"Agents used: {result['agentCount']}")
        print(f"Sub-questions: {len(result['subQuestions'])}")
        print("\nFinal Report:")
        print(result['response'])
        print("\nSources:")
        for i, source in enumerate(result['sources'], 1):
            print(f"{i}. {source['title']} - {source['url']}")

    query = "What are the latest developments in quantum computing and their potential impact on cryptography?"
    
    try:
        client.research_with_callback(
            query=query,
            model="google/gemini-2.5-pro",
            max_agents=6,
            progress_callback=on_progress,
            completion_callback=on_completion
        )
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
```

#### Vue.js Deep Research Component
```vue
<template>
  <div class="deep-research">
    <div class="research-form">
      <textarea
        v-model="query"
        placeholder="Enter your research question..."
        rows="4"
        :disabled="isResearching"
      ></textarea>
      
      <div class="options">
        <label>
          Model:
          <select v-model="selectedModel" :disabled="isResearching">
            <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
            <option value="anthropic/claude-4-sonnet">Claude 4 Sonnet</option>
            <option value="openai/gpt-4o">GPT-4o</option>
          </select>
        </label>
        
        <label>
          Agents:
          <input
            type="range"
            v-model="maxAgents"
            min="2"
            max="12"
            :disabled="isResearching"
          />
          {{ maxAgents }}
        </label>
      </div>
      
      <button @click="startResearch" :disabled="!query || isResearching">
        {{ isResearching ? 'Researching...' : 'Start Research' }}
      </button>
    </div>

    <div v-if="isResearching" class="progress-section">
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{ width: progress + '%' }"
        ></div>
      </div>
      <p class="progress-text">{{ progressMessage }}</p>
    </div>

    <div v-if="result" class="results-section">
      <h3>Research Results</h3>
      <div class="research-info">
        <span>Query: {{ result.query }}</span>
        <span>Agents used: {{ result.agentCount }}</span>
        <span>Sub-questions: {{ result.subQuestions.length }}</span>
      </div>
      
      <div class="research-content">
        <h4>Final Report</h4>
        <div class="report" v-html="formatReport(result.response)"></div>
      </div>
      
      <div class="sources">
        <h4>Sources</h4>
        <ul>
          <li v-for="(source, index) in result.sources" :key="index">
            <a :href="source.url" target="_blank">{{ source.title }}</a>
          </li>
        </ul>
      </div>
    </div>

    <div v-if="error" class="error">
      Error: {{ error }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'DeepResearch',
  data() {
    return {
      query: '',
      selectedModel: 'google/gemini-2.5-pro',
      maxAgents: 8,
      isResearching: false,
      progress: 0,
      progressMessage: '',
      result: null,
      error: null
    }
  },
  methods: {
    async startResearch() {
      if (!this.query.trim()) return;

      this.isResearching = true;
      this.progress = 0;
      this.progressMessage = 'Starting research...';
      this.result = null;
      this.error = null;

      try {
        const response = await fetch('https://api.sculptorai.org/api/deep-research', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.VUE_APP_AI_API_KEY
          },
          body: JSON.stringify({
            query: this.query,
            model: this.selectedModel,
            maxAgents: this.maxAgents
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

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
                this.isResearching = false;
                return;
              }

              try {
                const event = JSON.parse(data);
                
                if (event.type === 'progress') {
                  this.progress = event.progress;
                  this.progressMessage = event.message;
                } else if (event.type === 'completion') {
                  this.result = event;
                  this.progress = 100;
                  this.progressMessage = 'Research completed!';
                } else if (event.type === 'error') {
                  throw new Error(event.message);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (err) {
        this.error = err.message;
      } finally {
        this.isResearching = false;
      }
    },

    formatReport(report) {
      // Convert markdown-like formatting to HTML
      return report
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
    }
  }
}
</script>

<style scoped>
.deep-research {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.research-form {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.research-form textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 15px;
}

.options {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
}

.options label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.progress-section {
  margin-bottom: 20px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #45a049);
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 10px;
  font-style: italic;
}

.results-section {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
}

.research-info {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  font-size: 14px;
  color: #666;
}

.report {
  line-height: 1.6;
  margin-bottom: 20px;
}

.sources ul {
  list-style-type: none;
  padding: 0;
}

.sources li {
  margin-bottom: 8px;
}

.sources a {
  color: #007bff;
  text-decoration: none;
}

.sources a:hover {
  text-decoration: underline;
}

.error {
  background: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 4px;
  margin-top: 20px;
}
</style>
```

### 3. Live Audio Integration

#### WebRTC Audio Capture with AI Portal
```javascript
// audioService.js
class AudioService {
  constructor(apiKey, baseURL = 'https://api.sculptorai.org') {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.sessionId = null;
  }

  async startSession(options = {}) {
    const sessionConfig = {
      session_id: `web_session_${Date.now()}`,
      model: options.model || 'gemini-live-2.5-flash-preview',
      response_modality: options.responseModality || 'text',
      input_transcription: options.inputTranscription !== false,
      output_transcription: options.outputTranscription !== false
    };

    const response = await fetch(`${this.baseURL}/api/v1/live-audio/session/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify(sessionConfig)
    });

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.statusText}`);
    }

    const result = await response.json();
    this.sessionId = result.data.sessionId;
    return result;
  }

  async endSession() {
    if (!this.sessionId) return;

    const response = await fetch(`${this.baseURL}/api/v1/live-audio/session/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({ session_id: this.sessionId })
    });

    const result = await response.json();
    this.sessionId = null;
    return result;
  }

  async startRecording(onTranscription) {
    if (this.isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await this.processAudioChunk(event.data, onTranscription);
        }
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        this.isRecording = false;
      };

      // Record in chunks for real-time processing
      this.mediaRecorder.start(1000); // 1 second chunks

    } catch (error) {
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  async processAudioChunk(audioBlob, onTranscription) {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await fetch(`${this.baseURL}/api/v1/live-audio/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          audio_data: base64Audio,
          format: 'webm',
          sample_rate: 48000,
          channels: 1,
          session_id: this.sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success && onTranscription) {
        onTranscription(result.data);
      }
    } catch (error) {
      console.error('Audio processing error:', error);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  async getSessionStatus() {
    if (!this.sessionId) return null;

    const response = await fetch(
      `${this.baseURL}/api/v1/live-audio/session/${this.sessionId}/status`,
      {
        headers: { 'X-API-Key': this.apiKey }
      }
    );

    return response.json();
  }
}

// Usage example
const audioService = new AudioService('ak_your_api_key_here');

async function startVoiceChat() {
  try {
    // Start audio session
    await audioService.startSession({
      model: 'gemini-live-2.5-flash-preview',
      responseModality: 'text'
    });

    // Start recording with transcription callback
    await audioService.startRecording((transcriptionData) => {
      console.log('User said:', transcriptionData.inputTranscription);
      console.log('AI responded:', transcriptionData.transcript);
      
      // Update UI with transcription
      updateTranscriptionUI(transcriptionData);
    });

    console.log('Voice chat started. Speak into your microphone.');
  } catch (error) {
    console.error('Failed to start voice chat:', error);
  }
}

async function stopVoiceChat() {
  try {
    audioService.stopRecording();
    await audioService.endSession();
    console.log('Voice chat stopped.');
  } catch (error) {
    console.error('Failed to stop voice chat:', error);
  }
}

function updateTranscriptionUI(data) {
  const transcriptionDiv = document.getElementById('transcription');
  const messageDiv = document.createElement('div');
  messageDiv.innerHTML = `
    <div class="user-message">You: ${data.inputTranscription}</div>
    <div class="ai-message">AI: ${data.transcript}</div>
    <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
  `;
  transcriptionDiv.appendChild(messageDiv);
  transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
}
```

### 4. Tools System Integration

#### Custom Tool Development
```python
#!/usr/bin/env python3
# tools/data-analyzer/controller.py

import json
import sys
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import io
import base64
from datetime import datetime

def analyze_data(data_config):
    """
    Analyze data based on the provided configuration.
    """
    try:
        # Parse input data
        data_type = data_config.get('type', 'csv')
        data_source = data_config.get('source', '')
        analysis_type = data_config.get('analysis', 'summary')
        
        if data_type == 'csv':
            # Handle CSV data
            if data_source.startswith('data:'):
                # Base64 encoded CSV
                csv_data = base64.b64decode(data_source.split(',')[1]).decode('utf-8')
                df = pd.read_csv(io.StringIO(csv_data))
            else:
                # CSV string
                df = pd.read_csv(io.StringIO(data_source))
        elif data_type == 'json':
            # Handle JSON data
            df = pd.DataFrame(json.loads(data_source))
        else:
            raise ValueError(f"Unsupported data type: {data_type}")
        
        # Perform analysis
        results = {}
        
        if analysis_type == 'summary':
            results['summary'] = {
                'shape': df.shape,
                'columns': df.columns.tolist(),
                'dtypes': df.dtypes.to_dict(),
                'missing_values': df.isnull().sum().to_dict(),
                'description': df.describe().to_dict()
            }
        
        elif analysis_type == 'correlation':
            numeric_df = df.select_dtypes(include=[np.number])
            if not numeric_df.empty:
                correlation_matrix = numeric_df.corr()
                results['correlation'] = correlation_matrix.to_dict()
                
                # Generate correlation heatmap
                plt.figure(figsize=(10, 8))
                plt.imshow(correlation_matrix, cmap='coolwarm', aspect='auto')
                plt.colorbar()
                plt.xticks(range(len(correlation_matrix.columns)), correlation_matrix.columns, rotation=45)
                plt.yticks(range(len(correlation_matrix.columns)), correlation_matrix.columns)
                plt.title('Correlation Matrix')
                
                # Save plot as base64
                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', bbox_inches='tight')
                buffer.seek(0)
                plot_base64 = base64.b64encode(buffer.getvalue()).decode()
                plt.close()
                
                results['heatmap'] = f"data:image/png;base64,{plot_base64}"
        
        elif analysis_type == 'trends':
            # Identify potential trend columns
            numeric_df = df.select_dtypes(include=[np.number])
            date_columns = df.select_dtypes(include=['datetime64', 'object']).columns
            
            # Try to find date column
            date_col = None
            for col in date_columns:
                try:
                    pd.to_datetime(df[col])
                    date_col = col
                    break
                except:
                    continue
            
            if date_col and not numeric_df.empty:
                df[date_col] = pd.to_datetime(df[date_col])
                df_sorted = df.sort_values(date_col)
                
                # Create trend plots
                fig, axes = plt.subplots(len(numeric_df.columns), 1, figsize=(12, 4 * len(numeric_df.columns)))
                if len(numeric_df.columns) == 1:
                    axes = [axes]
                
                for i, col in enumerate(numeric_df.columns):
                    axes[i].plot(df_sorted[date_col], df_sorted[col])
                    axes[i].set_title(f'Trend: {col}')
                    axes[i].set_xlabel(date_col)
                    axes[i].set_ylabel(col)
                    axes[i].tick_params(axis='x', rotation=45)
                
                plt.tight_layout()
                
                # Save plot as base64
                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', bbox_inches='tight')
                buffer.seek(0)
                plot_base64 = base64.b64encode(buffer.getvalue()).decode()
                plt.close()
                
                results['trends_plot'] = f"data:image/png;base64,{plot_base64}"
        
        return {
            'success': True,
            'results': results,
            'message': f'Successfully analyzed {data_type} data with {analysis_type} analysis',
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

def main():
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Extract parameters
        data_config = input_data.get('data_config', {})
        
        # Analyze data
        result = analyze_data(data_config)
        
        # Output result
        print(json.dumps(result))
        
    except Exception as e:
        error_response = {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_response))
        sys.exit(1)

if __name__ == "__main__":
    main()
```

#### Tool Configuration
```json
{
  "id": "data-analyzer",
  "name": "Data Analyzer",
  "description": "Analyzes CSV and JSON data with summary statistics, correlation analysis, and trend visualization",
  "enabled": true,
  "maxExecutionTime": 30000,
  "allowedModels": ["*"],
  "requiresApproval": false,
  "parameters": {
    "data_config": {
      "type": "object",
      "description": "Configuration for data analysis",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["csv", "json"],
          "description": "Type of data to analyze"
        },
        "source": {
          "type": "string",
          "description": "Data source (CSV string, JSON string, or base64 encoded data)"
        },
        "analysis": {
          "type": "string",
          "enum": ["summary", "correlation", "trends"],
          "description": "Type of analysis to perform"
        }
      },
      "required": ["type", "source", "analysis"]
    }
  },
  "security": {
    "sandbox": true,
    "allowNetworkAccess": false,
    "allowFileSystem": false,
    "memoryLimit": "256MB",
    "timeLimit": 30
  },
  "dependencies": [
    "pandas",
    "numpy",
    "matplotlib"
  ]
}
```

#### Using Tools in Chat
```javascript
// Frontend integration for tools
const ChatWithTools = () => {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [toolsActive, setToolsActive] = useState([]);

  const sendMessageWithTools = async () => {
    const response = await fetch('https://api.sculptorai.org/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.REACT_APP_AI_API_KEY
      },
      body: JSON.stringify({
        model: 'custom/data-analyst', // Model with tools enabled
        messages: [{ role: 'user', content: currentMessage }],
        stream: true,
        tools: {
          enabled: true,
          allowedTools: ['data-analyzer', 'calculator']
        }
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data);

            if (event.type === 'tool_call') {
              setToolsActive(prev => [...prev, {
                id: event.tool_id,
                name: event.tool_name,
                status: 'executing'
              }]);
            } else if (event.type === 'tool_result') {
              setToolsActive(prev => prev.map(tool => 
                tool.id === event.tool_id 
                  ? { ...tool, status: 'completed', result: event.result }
                  : tool
              ));
            } else if (event.choices?.[0]?.delta?.content) {
              assistantMessage += event.choices[0].delta.content;
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  lastMessage.content = assistantMessage;
                } else {
                  newMessages.push({ role: 'assistant', content: assistantMessage });
                }
                return newMessages;
              });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  };

  return (
    <div className="chat-with-tools">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="tools-status">
        {toolsActive.map(tool => (
          <div key={tool.id} className={`tool-status ${tool.status}`}>
            {tool.name}: {tool.status}
            {tool.result && tool.result.results?.heatmap && (
              <img src={tool.result.results.heatmap} alt="Analysis result" />
            )}
          </div>
        ))}
      </div>

      <div className="message-input">
        <textarea
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder="Ask me to analyze some data..."
        />
        <button onClick={sendMessageWithTools}>Send</button>
      </div>
    </div>
  );
};
```

## Development Workflow

### 1. Setting Up Development Environment

```bash
# Clone repository
git clone <repository-url>
cd aiportal-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env

# Initialize database
npm run init-db

# Start development server
npm run dev
```

### 2. Environment Management

#### Development Environment
```bash
# .env.development
NODE_ENV=development
DEBUG=aiportal:*
LOG_LEVEL=debug
RATE_LIMIT_ENABLED=false
CORS_ENABLED=false

# Mock providers for testing
DEV_MOCK_PROVIDERS=true
DEV_DISABLE_AUTH=false
```

#### Testing Environment
```bash
# .env.test
NODE_ENV=test
DATABASE_PATH=:memory:
LOG_LEVEL=error
RATE_LIMIT_ENABLED=false
DEV_MOCK_PROVIDERS=true
```

#### Production Environment
```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=info
RATE_LIMIT_ENABLED=true
CORS_ENABLED=true
SSL_ENABLED=true
```

### 3. Database Migrations

#### Creating Migrations
```javascript
// migrations/001_add_user_preferences.js
const migration = {
  up: async (db) => {
    await db.exec(`
      CREATE TABLE user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        preference_key TEXT NOT NULL,
        preference_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, preference_key)
      );
    `);
  },
  
  down: async (db) => {
    await db.exec('DROP TABLE user_preferences;');
  }
};

module.exports = migration;
```

#### Running Migrations
```bash
# Run migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Reset and migrate
npm run migrate:reset
```

### 4. Code Generation

#### Model Generator
```bash
# Generate new model configuration
npm run generate:model -- --name "my-assistant" --provider "anthropic" --base-model "claude-3.5-sonnet"
```

#### Tool Generator
```bash
# Generate new tool
npm run generate:tool -- --name "web-scraper" --description "Scrapes web pages"
```

#### Route Generator
```bash
# Generate new route
npm run generate:route -- --name "analytics" --path "/api/analytics"
```

## Testing

### 1. Unit Tests

```javascript
// tests/unit/services/anthropicService.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const anthropicService = require('../../../services/anthropicService');

describe('AnthropicService', () => {
  beforeEach(() => {
    sinon.restore();
  });

  describe('createMessage', () => {
    it('should format messages correctly', async () => {
      const mockResponse = {
        data: {
          id: 'msg_123',
          content: [{ text: 'Hello, world!' }],
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 10, output_tokens: 5 }
        }
      };

      const axiosStub = sinon.stub(axios, 'post').resolves(mockResponse);

      const result = await anthropicService.createMessage(
        'anthropic/claude-3.5-sonnet',
        [{ role: 'user', content: 'Hello' }]
      );

      expect(result.choices[0].message.content).to.equal('Hello, world!');
      expect(result.usage.total_tokens).to.equal(15);
      expect(axiosStub.calledOnce).to.be.true;
    });

    it('should handle API errors gracefully', async () => {
      sinon.stub(axios, 'post').rejects(new Error('API Error'));

      try {
        await anthropicService.createMessage(
          'anthropic/claude-3.5-sonnet',
          [{ role: 'user', content: 'Hello' }]
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Anthropic API error');
      }
    });
  });
});
```

### 2. Integration Tests

```javascript
// tests/integration/chat.test.js
const request = require('supertest');
const app = require('../../server');
const db = require('../../database/connection');

describe('Chat API Integration', () => {
  let apiKey;
  let userId;

  before(async () => {
    // Setup test user and API key
    const user = await db.run(`
      INSERT INTO users (username, password_hash, email) 
      VALUES (?, ?, ?)
    `, ['testuser', 'hashedpass', 'test@example.com']);
    
    userId = user.lastID;
    
    const keyResult = await db.run(`
      INSERT INTO api_keys (user_id, key_name, key_hash) 
      VALUES (?, ?, ?)
    `, [userId, 'Test Key', 'test_key_hash']);
    
    apiKey = 'ak_test_key';
  });

  after(async () => {
    // Cleanup
    await db.run('DELETE FROM api_keys WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
  });

  it('should handle chat completion request', async () => {
    const response = await request(app)
      .post('/api/v1/chat/completions')
      .set('X-API-Key', apiKey)
      .send({
        model: 'custom/coding-assistant',
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(response.status).to.equal(200);
    expect(response.body).to.have.property('choices');
    expect(response.body.choices[0]).to.have.property('message');
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .post('/api/v1/chat/completions')
      .send({
        model: 'custom/coding-assistant',
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(response.status).to.equal(401);
  });

  it('should validate request body', async () => {
    const response = await request(app)
      .post('/api/v1/chat/completions')
      .set('X-API-Key', apiKey)
      .send({
        model: 'invalid-model'
        // Missing messages
      });

    expect(response.status).to.equal(400);
  });
});
```

### 3. End-to-End Tests

```javascript
// tests/e2e/full-workflow.test.js
const { chromium } = require('playwright');
const { expect } = require('chai');

describe('Full Workflow E2E', () => {
  let browser, page;

  before(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  after(async () => {
    await browser.close();
  });

  it('should complete full chat workflow', async () => {
    // Navigate to frontend
    await page.goto('http://localhost:3001');

    // Enter API key
    await page.fill('#api-key', 'ak_test_key');

    // Send message
    await page.fill('#message-input', 'Hello, AI!');
    await page.click('#send-button');

    // Wait for response
    await page.waitForSelector('.ai-response', { timeout: 10000 });

    // Check response
    const response = await page.textContent('.ai-response');
    expect(response).to.not.be.empty;
  });
});
```

### 4. Performance Tests

```javascript
// tests/performance/load.test.js
const autocannon = require('autocannon');

describe('Performance Tests', () => {
  it('should handle concurrent requests', async () => {
    const result = await autocannon({
      url: 'http://localhost:3000/api/v1/chat/completions',
      connections: 10,
      duration: 30,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'ak_test_key'
      },
      body: JSON.stringify({
        model: 'custom/fast-responder',
        messages: [{ role: 'user', content: 'Test' }]
      }),
      method: 'POST'
    });

    expect(result.errors).to.equal(0);
    expect(result.timeouts).to.equal(0);
    expect(result.latency.p99).to.be.below(5000); // 5 seconds
  });
});
```

### 5. Test Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run e2e tests only
npm run test:e2e

# Run performance tests
npm run test:performance

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Contributing

### 1. Development Setup

```bash
# Fork the repository
git clone https://github.com/yourusername/aiportal-backend.git
cd aiportal-backend

# Add upstream remote
git remote add upstream https://github.com/original/aiportal-backend.git

# Install dependencies
npm install

# Install pre-commit hooks
npm run prepare

# Create feature branch
git checkout -b feature/my-new-feature
```

### 2. Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Feature
git commit -m "feat: add deep research API endpoint"

# Bug fix
git commit -m "fix: handle rate limit errors correctly"

# Documentation
git commit -m "docs: update API documentation"

# Refactor
git commit -m "refactor: optimize model configuration loading"

# Test
git commit -m "test: add integration tests for chat API"

# CI/CD
git commit -m "ci: add GitHub Actions workflow"
```

### 3. Pull Request Process

1. **Create Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**:
   - Write code following style guidelines
   - Add tests for new functionality
   - Update documentation

3. **Test Changes**:
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

4. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

5. **Push Branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request**:
   - Use clear title and description
   - Link related issues
   - Add screenshots if UI changes
   - Request review from maintainers

### 4. Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No breaking changes (or properly documented)
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Error handling implemented
- [ ] Logging added where appropriate

## Code Style

### 1. JavaScript Style Guide

```javascript
// Use modern ES6+ features
const { model, messages, ...options } = req.body;

// Use async/await instead of callbacks
const handleRequest = async (req, res) => {
  try {
    const result = await someAsyncOperation();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Use descriptive variable names
const chatCompletionResponse = await anthropicService.createMessage(model, messages);

// Use JSDoc for documentation
/**
 * Creates a chat completion using the specified model and messages.
 * @param {string} model - The model identifier
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} The completion response
 */
const createChatCompletion = async (model, messages, options = {}) => {
  // Implementation
};

// Use consistent error handling
const handleError = (error, res) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
};
```

### 2. Linting Configuration

```json
// .eslintrc.json
{
  "extends": ["eslint:recommended", "node"],
  "env": {
    "node": true,
    "es2021": true
  },
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module"
  },
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "prefer-const": "error",
    "no-var": "error",
    "object-shorthand": "error",
    "prefer-arrow-callback": "error",
    "prefer-template": "error",
    "semi": ["error", "always"],
    "quotes": ["error", "single"],
    "indent": ["error", 2],
    "comma-dangle": ["error", "never"],
    "max-len": ["error", { "code": 100 }]
  }
}
```

### 3. Prettier Configuration

```json
// .prettierrc
{
  "singleQuote": true,
  "trailingComma": "none",
  "tabWidth": 2,
  "semi": true,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

### 4. File Organization

```
controllers/
├── index.js              # Export all controllers
├── baseController.js     # Base controller class
├── chatController.js     # Chat-related endpoints
└── authController.js     # Authentication endpoints

services/
├── index.js              # Export all services
├── baseService.js        # Base service class
├── providerService.js    # Base provider service
└── anthropicService.js   # Anthropic-specific service

utils/
├── index.js              # Export all utilities
├── logger.js             # Logging utility
├── validator.js          # Validation utility
└── formatter.js          # Response formatting
```

## Security Guidelines

### 1. Input Validation

```javascript
const { body, validationResult } = require('express-validator');

// Validation middleware
const validateChatRequest = [
  body('model')
    .isString()
    .notEmpty()
    .isLength({ max: 100 })
    .matches(/^[a-zA-Z0-9\-\/\.]+$/)
    .withMessage('Invalid model format'),
  
  body('messages')
    .isArray({ min: 1, max: 100 })
    .withMessage('Messages must be an array with 1-100 items'),
  
  body('messages.*.role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Invalid message role'),
  
  body('messages.*.content')
    .isString()
    .isLength({ min: 1, max: 100000 })
    .withMessage('Message content must be 1-100000 characters'),
  
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];
```

### 2. Authentication Security

```javascript
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

// Strong password requirements
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  return password.length >= minLength && 
         hasUpperCase && 
         hasLowerCase && 
         hasNumbers && 
         hasSpecialChar;
};

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many authentication attempts',
  standardHeaders: true,
  legacyHeaders: false
});

// Secure password hashing
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Secure API key generation
const generateApiKey = () => {
  const prefix = 'ak_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return prefix + randomBytes;
};
```

### 3. Data Protection

```javascript
// Sanitize user input
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

// Encrypt sensitive data
const encrypt = (text) => {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipher(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

// Prevent SQL injection
const safeQuery = async (query, params = []) => {
  // Use parameterized queries
  return await db.prepare(query).all(params);
};
```

### 4. Security Headers

```javascript
const helmet = require('helmet');
const cors = require('cors');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://api.anthropic.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || false,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Request logging for security monitoring
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});
```

## Performance Optimization

### 1. Caching Strategy

```javascript
const NodeCache = require('node-cache');

// Create cache instances
const modelCache = new NodeCache({ stdTTL: 600 }); // 10 minutes
const responseCache = new NodeCache({ stdTTL: 300 }); // 5 minutes

// Cache middleware
const cacheMiddleware = (ttl = 300) => {
  return (req, res, next) => {
    const key = `${req.method}:${req.path}:${JSON.stringify(req.query)}`;
    const cached = responseCache.get(key);
    
    if (cached) {
      return res.json(cached);
    }
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to cache response
    res.json = function(data) {
      responseCache.set(key, data, ttl);
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Model configuration caching
const getCachedModel = (modelId) => {
  const cached = modelCache.get(modelId);
  if (cached) return cached;
  
  const model = modelConfigService.getModel(modelId);
  if (model) {
    modelCache.set(modelId, model);
  }
  return model;
};
```

### 2. Database Optimization

```javascript
// Connection pooling
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

class DatabasePool {
  constructor(filename, poolSize = 10) {
    this.filename = filename;
    this.pool = [];
    this.poolSize = poolSize;
    this.activeConnections = 0;
  }

  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    
    if (this.activeConnections < this.poolSize) {
      this.activeConnections++;
      return await this.createConnection();
    }
    
    // Wait for connection to become available
    return new Promise((resolve) => {
      const checkPool = () => {
        if (this.pool.length > 0) {
          resolve(this.pool.pop());
        } else {
          setTimeout(checkPool, 10);
        }
      };
      checkPool();
    });
  }

  async createConnection() {
    return await open({
      filename: this.filename,
      driver: sqlite3.Database
    });
  }

  releaseConnection(connection) {
    this.pool.push(connection);
  }
}

// Query optimization
const optimizedQueries = {
  getUserByApiKey: `
    SELECT u.*, ak.key_name, ak.last_used 
    FROM users u 
    JOIN api_keys ak ON u.id = ak.user_id 
    WHERE ak.key_hash = ? AND ak.is_active = 1 AND u.is_active = 1
    LIMIT 1
  `,
  
  getUsageStats: `
    SELECT 
      model_id,
      SUM(request_count) as total_requests,
      SUM(token_count) as total_tokens,
      SUM(cost) as total_cost
    FROM usage_stats 
    WHERE user_id = ? AND date >= date('now', '-30 days')
    GROUP BY model_id
  `
};
```

### 3. Memory Management

```javascript
// Memory monitoring
const memoryMonitor = {
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const formatBytes = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
    
    console.log({
      rss: `${formatBytes(usage.rss)} MB`,
      heapTotal: `${formatBytes(usage.heapTotal)} MB`,
      heapUsed: `${formatBytes(usage.heapUsed)} MB`,
      external: `${formatBytes(usage.external)} MB`,
      arrayBuffers: `${formatBytes(usage.arrayBuffers)} MB`
    });
    
    // Alert if memory usage is high
    if (usage.heapUsed > 1024 * 1024 * 1024) { // 1GB
      console.warn('High memory usage detected!');
    }
  },
  
  startMonitoring(interval = 60000) {
    setInterval(() => {
      this.checkMemoryUsage();
    }, interval);
  }
};

// Stream processing for large responses
const streamResponse = (largeData, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked'
  });
  
  const chunkSize = 1024; // 1KB chunks
  let offset = 0;
  
  const sendChunk = () => {
    const chunk = largeData.slice(offset, offset + chunkSize);
    if (chunk.length > 0) {
      res.write(chunk);
      offset += chunkSize;
      setImmediate(sendChunk);
    } else {
      res.end();
    }
  };
  
  sendChunk();
};
```

### 4. API Optimization

```javascript
// Response compression
const compression = require('compression');
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Compression level (1-9)
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Request timeout handling
const requestTimeout = (timeout = 120000) => {
  return (req, res, next) => {
    req.setTimeout(timeout, () => {
      res.status(408).json({ error: 'Request timeout' });
    });
    next();
  };
};

// Efficient pagination
const paginateResults = async (query, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  
  const countQuery = query.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM');
  const { total } = await db.get(countQuery);
  
  const results = await db.all(`${query} LIMIT ? OFFSET ?`, [limit, offset]);
  
  return {
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
};
```

## Debugging

### 1. Logging Setup

```javascript
const winston = require('winston');

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${stack || ''} ${metaStr}`;
    })
  ),
  defaultMeta: { service: 'aiportal-backend' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};
```

### 2. Debug Utilities

```javascript
// Debug middleware
const debugMiddleware = (req, res, next) => {
  if (process.env.DEBUG_MODE === 'true') {
    console.log('--- DEBUG INFO ---');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Query:', req.query);
    console.log('Params:', req.params);
    console.log('User:', req.user);
    console.log('--- END DEBUG ---');
  }
  next();
};

// Performance profiler
const profileAsync = async (fn, name) => {
  const start = process.hrtime.bigint();
  try {
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    logger.debug(`Performance: ${name} took ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;
    logger.error(`Performance: ${name} failed after ${duration.toFixed(2)}ms`, { error });
    throw error;
  }
};

// Memory leak detector
const memoryLeakDetector = {
  baseline: null,
  
  setBaseline() {
    this.baseline = process.memoryUsage();
    logger.info('Memory baseline set', this.baseline);
  },
  
  checkLeak(threshold = 50 * 1024 * 1024) { // 50MB
    if (!this.baseline) {
      this.setBaseline();
      return;
    }
    
    const current = process.memoryUsage();
    const heapDiff = current.heapUsed - this.baseline.heapUsed;
    
    if (heapDiff > threshold) {
      logger.warn('Potential memory leak detected', {
        baseline: this.baseline.heapUsed,
        current: current.heapUsed,
        difference: heapDiff
      });
    }
  }
};
```

### 3. Error Tracking

```javascript
// Error handler
const errorHandler = (err, req, res, next) => {
  // Log error with context
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    user: req.user?.id
  });
  
  // Send appropriate response
  if (res.headersSent) {
    return next(err);
  }
  
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});
```

### 4. Debug Commands

```bash
# Start with debugging
NODE_OPTIONS="--inspect=0.0.0.0:9229" npm start

# Debug with breakpoints
NODE_OPTIONS="--inspect-brk=0.0.0.0:9229" npm start

# Memory profiling
NODE_OPTIONS="--inspect --max-old-space-size=4096" npm start

# Enable debug logs
DEBUG=* npm start

# Specific debug namespace
DEBUG=aiportal:* npm start
```

## Deployment

### 1. Docker Deployment

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine AS production

# Install Python for tools
RUN apk add --no-cache python3 py3-pip

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aiportal -u 1001

# Copy built application
COPY --from=builder --chown=aiportal:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=aiportal:nodejs /app .

# Create necessary directories
RUN mkdir -p logs database/backups && \
    chown -R aiportal:nodejs logs database

USER aiportal

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

CMD ["node", "server.js"]
```

### 2. Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aiportal-backend
  labels:
    app: aiportal-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aiportal-backend
  template:
    metadata:
      labels:
        app: aiportal-backend
    spec:
      containers:
      - name: aiportal-backend
        image: aiportal-backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_PATH
          value: "/data/aiportal.db"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: aiportal-secrets
              key: jwt-secret
        - name: OPENROUTER_API_KEY
          valueFrom:
            secretKeyRef:
              name: aiportal-secrets
              key: openrouter-api-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: data-volume
          mountPath: /data
        - name: logs-volume
          mountPath: /app/logs
      volumes:
      - name: data-volume
        persistentVolumeClaim:
          claimName: aiportal-data-pvc
      - name: logs-volume
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: aiportal-service
spec:
  selector:
    app: aiportal-backend
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: aiportal-data-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### 3. CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy AI Portal Backend

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      sqlite:
        image: sqlite:latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run tests
      run: npm test
      env:
        NODE_ENV: test
    
    - name: Run security audit
      run: npm audit --audit-level moderate

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Login to Container Registry
      uses: docker/login-action@v2
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: |
          ghcr.io/${{ github.repository }}:latest
          ghcr.io/${{ github.repository }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to production
      run: |
        # Add deployment script here
        echo "Deploying to production..."
```

This comprehensive development guide provides everything needed to understand, develop, extend, and maintain the AI Portal Backend system. The modular architecture, extensive examples, and detailed documentation make it easy for developers to contribute and for organizations to deploy and scale the system according to their needs.