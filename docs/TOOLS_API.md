# Tools System API Reference

## Authentication

All API endpoints require authentication via either:
- JWT Token: `Authorization: Bearer <jwt-token>`
- API Key: `X-API-Key: <api-key>`

Admin endpoints require admin-level authentication.

## Public Tool APIs

### Get Available Tools

Get all tools available to authenticated users.

**Endpoint:** `GET /api/v1/tools/tools`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "tools": [
    {
      "id": "code-execution",
      "name": "Code Execution",
      "description": "Securely execute Python code",
      "parameters": { /* JSON Schema */ }
    }
  ],
  "toolsEnabled": true
}
```

### Get Tools for Model

Get tools available for a specific model.

**Endpoint:** `GET /api/v1/tools/tools/:modelId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "tools": [...],
  "modelId": "openai/gpt-4o"
}
```

### Execute Tool

Execute a tool with provided parameters.

**Endpoint:** `POST /api/v1/tools/tools/:toolId/execute`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "parameters": {
    "code": "print('Hello, World!')"
  },
  "modelId": "openai/gpt-4o"
}
```

**Response:**
```json
{
  "success": true,
  "toolId": "code-execution",
  "executionId": "code-execution_1625097600000_abc123",
  "result": {
    "success": true,
    "output": "Hello, World!\n",
    "execution_time": 123.45
  },
  "executionTime": 125.67
}
```

### Stream Tool Executions

Get real-time updates for tool executions via Server-Sent Events.

**Endpoint:** `GET /api/v1/tools/executions/stream`

**Headers:**
```
Authorization: Bearer <token>
Accept: text/event-stream
```

**Stream Events:**
```javascript
// Connection established
data: {"type": "connected", "message": "Tool execution stream connected"}

// Execution started
data: {"type": "execution_started", "executionId": "...", "toolId": "code-execution"}

// Progress update
data: {"type": "execution_progress_structured", "executionId": "...", "step": "executing", "percentage": 50, "message": "Processing data"}

// Execution completed
data: {"type": "execution_completed", "executionId": "...", "toolId": "code-execution", "result": {...}}
```

### Control Tool Execution

#### Pause Execution
**Endpoint:** `POST /api/v1/tools/executions/:executionId/pause`

**Response:**
```json
{
  "success": true,
  "message": "Execution paused"
}
```

#### Resume Execution
**Endpoint:** `POST /api/v1/tools/executions/:executionId/resume`

**Response:**
```json
{
  "success": true,
  "message": "Execution resumed"
}
```

#### Cancel Execution
**Endpoint:** `POST /api/v1/tools/executions/:executionId/cancel`

**Response:**
```json
{
  "success": true,
  "message": "Execution cancelled"
}
```

### Get Execution Status

**Endpoint:** `GET /api/v1/tools/executions/:executionId/status`

**Response:**
```json
{
  "success": true,
  "executionId": "...",
  "toolId": "code-execution",
  "status": "running",
  "startTime": 1625097600000,
  "duration": 5000,
  "parameters": {...}
}
```

### Get All Executions

**Endpoint:** `GET /api/v1/tools/executions`

**Response:**
```json
{
  "success": true,
  "executions": {
    "active": [
      {
        "id": "...",
        "toolId": "code-execution",
        "status": "running",
        "duration": 5000
      }
    ],
    "paused": []
  }
}
```

## Admin Tool APIs

### Get All Tools (Admin)

Get detailed information about all tools.

**Endpoint:** `GET /api/admin/tools/tools`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "enabled": true,
  "toolCount": 2,
  "tools": [
    {
      "id": "code-execution",
      "name": "Code Execution",
      "description": "...",
      "config": {
        "id": "code-execution",
        "enabled": true,
        "maxExecutionTime": 15000,
        "security": {...}
      }
    }
  ]
}
```

### Get Tool Configuration

**Endpoint:** `GET /api/admin/tools/tools/:toolId`

**Response:**
```json
{
  "success": true,
  "tool": {
    "id": "code-execution",
    "name": "Code Execution",
    "enabled": true,
    "parameters": {...},
    "security": {...}
  }
}
```

### Update Tool Configuration

**Endpoint:** `PUT /api/admin/tools/tools/:toolId`

**Request Body:**
```json
{
  "enabled": false,
  "maxExecutionTime": 20000,
  "allowedModels": ["openai/gpt-4o"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tool configuration updated",
  "tool": {...}
}
```

### Toggle Tool

**Endpoint:** `POST /api/admin/tools/tools/:toolId/toggle`

**Request Body:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tool enabled"
}
```

### Get Global Configuration

**Endpoint:** `GET /api/admin/tools/config`

**Response:**
```json
{
  "success": true,
  "config": {
    "globalSettings": {
      "enabled": true,
      "maxConcurrentToolCalls": 5,
      "toolExecutionTimeout": 30000
    }
  }
}
```

### Update Global Configuration

**Endpoint:** `PUT /api/admin/tools/config`

**Request Body:**
```json
{
  "globalSettings": {
    "maxConcurrentToolCalls": 10,
    "toolExecutionTimeout": 45000
  }
}
```

### Toggle Tools System

**Endpoint:** `POST /api/admin/tools/toggle`

**Request Body:**
```json
{
  "enabled": true
}
```

### Create New Tool

**Endpoint:** `POST /api/admin/tools/create`

**Request Body:**
```json
{
  "toolId": "my-new-tool",
  "toolName": "My New Tool",
  "options": {
    "description": "A custom tool for specific functionality",
    "parameters": {
      "type": "object",
      "properties": {
        "input": {
          "type": "string",
          "description": "Input parameter"
        }
      },
      "required": ["input"]
    },
    "allowedModels": ["openai/gpt-4o"],
    "maxExecutionTime": 20000
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tool created successfully",
  "tool": {
    "success": true,
    "toolId": "my-new-tool",
    "toolPath": "/path/to/tools/my-new-tool",
    "config": {...}
  }
}
```

### Validate All Tools

**Endpoint:** `GET /api/admin/tools/validate`

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalTools": 3,
    "validTools": 2,
    "invalidTools": 1
  },
  "validationResults": {
    "code-execution": {
      "config": {
        "isValid": true,
        "errors": [],
        "warnings": []
      },
      "directory": {
        "isValid": true,
        "errors": [],
        "warnings": ["Consider adding README.md"]
      },
      "overall": true
    },
    "broken-tool": {
      "config": {
        "isValid": false,
        "errors": ["Missing required field: description"],
        "warnings": []
      },
      "directory": {
        "isValid": false,
        "errors": ["controller.py file is missing"],
        "warnings": []
      },
      "overall": false
    }
  }
}
```

### Get Tool Template

**Endpoint:** `GET /api/admin/tools/template/:toolId?toolName=Tool%20Name`

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "my-tool",
    "name": "Tool Name",
    "description": "Tool description (minimum 10 characters)",
    "version": "1.0.0",
    "enabled": true,
    "parameters": {...},
    "security": {...}
  }
}
```

### Test Tool

**Endpoint:** `POST /api/admin/tools/tools/:toolId/test`

**Request Body:**
```json
{
  "parameters": {
    "code": "print('Admin test')"
  }
}
```

**Response:**
```json
{
  "success": true,
  "testResult": {
    "success": true,
    "toolId": "code-execution",
    "executionId": "...",
    "result": {...}
  }
}
```

### Get Tool Analytics

**Endpoint:** `GET /api/admin/tools/analytics`

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalTools": 3,
    "enabledTools": 2,
    "disabledTools": 1,
    "activeExecutions": 1,
    "pausedExecutions": 0,
    "toolsEnabled": true,
    "toolsByType": {
      "code": 1,
      "test": 2
    },
    "executionsByTool": {
      "code-execution": 2,
      "test-tool": 1
    }
  }
}
```

### Get All Executions (Admin)

**Endpoint:** `GET /api/admin/tools/executions`

**Response:**
```json
{
  "success": true,
  "executions": {
    "active": [...],
    "paused": [...]
  }
}
```

### Cancel All Executions

**Endpoint:** `POST /api/admin/tools/executions/cancel-all`

**Response:**
```json
{
  "success": true,
  "message": "Cancelled 3 executions",
  "cancelledIds": ["exec1", "exec2", "exec3"]
}
```

## Event Types

### Streaming Event Types

| Event Type | Description | Data Fields |
|------------|-------------|-------------|
| `connected` | Stream connection established | `message` |
| `ping` | Keep-alive ping | `timestamp` |
| `execution_started` | Tool execution began | `executionId`, `toolId` |
| `execution_progress` | Regular output | `executionId`, `type`, `data` |
| `execution_progress_structured` | Structured progress | `executionId`, `step`, `percentage`, `message` |
| `execution_status` | Status update | `executionId`, `status`, `message`, `details` |
| `execution_completed` | Execution finished successfully | `executionId`, `toolId`, `result` |
| `execution_failed` | Execution failed | `executionId`, `toolId`, `error` |
| `execution_paused` | Execution paused | `executionId`, `toolId` |
| `execution_resumed` | Execution resumed | `executionId`, `toolId` |
| `execution_cancelled` | Execution cancelled | `executionId`, `toolId` |

## Error Codes

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 400 | Bad Request | Invalid parameters or malformed request |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Tool or execution not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

### Error Response Format

```json
{
  "success": false,
  "error": "Error message description"
}
```

## Rate Limiting

Tools can have individual rate limits configured:

```json
{
  "rateLimit": {
    "requests": 10,
    "window": "1m"
  }
}
```

Global rate limiting is also applied to prevent abuse.

## Security Headers

All tool execution requests should include:
- `Content-Type: application/json`
- Appropriate authentication headers
- CORS headers are handled automatically

## Tool Configuration JSON Schema

Complete JSON schema for tool configuration:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "description", "version", "parameters"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "description": {
      "type": "string",
      "minLength": 10
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "allowedModels": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "maxExecutionTime": {
      "type": "number",
      "minimum": 1000
    },
    "requiresAuth": {
      "type": "boolean",
      "default": false
    },
    "rateLimit": {
      "type": "object",
      "properties": {
        "requests": {
          "type": "number",
          "minimum": 1
        },
        "window": {
          "type": "string",
          "pattern": "^\\d+[smhd]$"
        }
      }
    },
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "const": "object"
        },
        "properties": {
          "type": "object"
        },
        "required": {
          "type": "array"
        }
      }
    }
  }
}
```

---

For implementation examples and best practices, see the [Tools System Documentation](./TOOLS_SYSTEM.md).