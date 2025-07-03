# Model Configuration System

This directory contains configuration files for all AI models supported by the portal. The new system provides centralized model management with advanced rate limiting, automatic queuing, and hot-reloading capabilities.

## Features

- **Centralized Configuration**: All model settings in JSON files
- **Advanced Rate Limiting**: Global and per-user limits with time windows
- **Automatic Queuing**: Messages queue when rate limits are hit
- **Hot Reloading**: Configuration changes applied instantly
- **Per-Model Customization**: Individual settings for each model
- **Easy Management**: Add new models by updating JSON files

## Structure

```
model_config/
├── models/                     # Individual model configurations
│   ├── anthropic/
│   │   ├── claude-4-opus.json
│   │   └── claude-4-sonnet.json
│   ├── openai/
│   │   ├── gpt-4.json
│   │   └── gpt-3.5-turbo.json
│   ├── google/
│   │   └── gemini-pro.json
│   ├── ollama/
│   │   └── llama3.json
│   └── local/
│       └── llama-3.2-1b.json
├── config.json                 # Global configuration
└── README.md                   # This file
```

## Configuration Schema

### Global Configuration (`config.json`)

```json
{
  "rateLimitingEnabled": true,           // Master switch for all rate limiting
  "defaultGlobalRateLimit": {            // Default global limits
    "requests": 1000,
    "window": {
      "amount": 1,
      "unit": "hour"                     // "second", "minute", "hour", "day"
    }
  },
  "defaultUserRateLimit": {              // Default per-user limits
    "requests": 50,
    "window": {
      "amount": 6,
      "unit": "hours"                    // Window resets every 6 hours
    }
  },
  "queueConfig": {
    "enabled": true,                     // Enable message queuing
    "maxQueueSize": 1000,               // Max messages in queue
    "processingTimeout": 30000,          // Timeout for queued messages (ms)
    "retryAttempts": 3                   // Retry attempts for failed requests
  },
  "hotReload": true                      // Enable hot reloading in development
}
```

### Model Configuration Schema

Each model configuration file contains:

```json
{
  "id": "model-id",                      // Unique model identifier
  "displayName": "Model Display Name",   // Human-readable name
  "provider": "provider-name",           // Provider (anthropic, openai, etc.)
  "apiModel": "api-model-name",         // Technical name for API calls
  "enabled": true,                       // Enable/disable this model
  
  "routing": {                           // API routing configuration
    "service": "anthropic",             // Service to route to
    "endpoint": "https://api.anthropic.com/v1/messages"
  },
  
  "globalRateLimit": {                   // Global rate limit for this model
    "requests": 500,
    "window": {
      "amount": 1,
      "unit": "hour"
    }
  },
  
  "userRateLimit": {                     // Per-user rate limit
    "requests": 25,
    "window": {
      "amount": 6,
      "unit": "hours"                    // Window resets every 6 hours
    }
  },
  
  "parameters": {                        // Model-specific parameters
    "temperature": 0.7,
    "max_tokens": 4096,
    "top_p": 1.0
  },
  
  "capabilities": {                      // Model capabilities
    "streaming": true,
    "vision": true,
    "functionCalling": true,
    "webSearch": true
  }
}
```

## Rate Limiting System

### How It Works

1. **Global Rate Limits**: Prevent any single model from being overwhelmed
2. **User Rate Limits**: Prevent individual users from excessive usage
3. **Time Windows**: Limits reset after specified time periods (e.g., every 6 hours)
4. **Automatic Queuing**: When limits are hit, requests queue automatically
5. **Smart Processing**: Queue processes requests as limits become available

### Time Window Configuration

Time windows support:
- `"second"` / `"seconds"`
- `"minute"` / `"minutes"`  
- `"hour"` / `"hours"`
- `"day"` / `"days"`

Examples:
```json
"window": { "amount": 30, "unit": "minutes" }   // 30-minute window
"window": { "amount": 6, "unit": "hours" }      // 6-hour window (common)
"window": { "amount": 1, "unit": "day" }        // Daily limits
```

### Queue Behavior

When rate limits are exceeded:
- **If queueing is enabled**: Request waits in queue until limits reset
- **If queueing is disabled**: Immediate error with retry timing
- **Queue timeout**: Requests timeout after configured duration
- **Retry headers**: HTTP responses include retry-after timing

## Adding New Models

1. **Create configuration file**:
   ```bash
   # Create file in appropriate provider directory
   touch model_config/models/provider/new-model.json
   ```

2. **Configure the model**:
   ```json
   {
     "id": "new-model",
     "displayName": "New Model Name",
     "provider": "provider",
     "apiModel": "technical-api-name",
     "enabled": true,
     "routing": {
       "service": "provider-service",
       "endpoint": "https://api.provider.com/v1/chat"
     },
     "globalRateLimit": {
       "requests": 1000,
       "window": { "amount": 1, "unit": "hour" }
     },
     "userRateLimit": {
       "requests": 50,
       "window": { "amount": 6, "unit": "hours" }
     },
     "parameters": {
       "temperature": 0.7,
       "max_tokens": 4096
     }
   }
   ```

3. **Hot reload**: Configuration loads automatically in development mode
4. **Production**: Restart server to load new configuration

## API Endpoints

### Rate Limit Management

- `GET /api/v1/rate-limits/status` - Get rate limit status (admin)
- `GET /api/v1/rate-limits/models/:modelId` - Get model rate limit info
- `POST /api/v1/rate-limits/config` - Update rate limiting settings (admin)

### Model Management

- `GET /api/v1/models` - List all available models (includes configured models)

## Disabling Rate Limits

To disable all rate limiting:

1. **Global disable**: Set `rateLimitingEnabled: false` in `config.json`
2. **Per-model disable**: Set very high limits or disable specific models
3. **Queue disable**: Set `queueConfig.enabled: false` to prevent queuing

## Migration from Legacy System

The new system is backward compatible:
- Custom models still use the legacy rate limiting system
- Standard provider models use the new configuration system
- Existing API endpoints continue to work unchanged

## Monitoring and Debugging

Rate limit information is included in API responses:
- `X-RateLimit-Limit`: Current limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: When limit resets
- `Retry-After`: Seconds until retry is possible

Queue information for successful requests:
- Response includes queue timing if request was queued
- Admin endpoints provide detailed queue status