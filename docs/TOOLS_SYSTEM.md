# AI Portal Tools System Documentation

## Overview

The AI Portal Tools System provides a secure, extensible framework for AI models to execute code and perform complex computations. The system features sandboxed execution, real-time progress tracking, pause/resume functionality, and comprehensive security measures.

## Architecture

### Core Components

1. **ToolsService** (`services/toolsService.js`) - Central orchestrator for tool management and execution
2. **Tool Controllers** (`tools/*/controller.py`) - Python scripts that implement tool functionality
3. **Configuration System** - JSON-based configuration for tools and global settings
4. **Security Layer** - Sandboxing, validation, and isolation mechanisms
5. **Streaming Interface** - Real-time progress and status updates via Server-Sent Events

### Directory Structure

```
tools/
├── config.json                 # Global tools configuration
├── code-execution/             # Secure Python code execution tool
│   ├── config.json            # Tool-specific configuration
│   ├── controller.py          # Tool implementation
│   └── README.md              # Tool documentation
├── test-tool/                 # Example/test tool
│   ├── config.json
│   └── controller.py
└── [other-tools]/             # Additional tools
```

## Features

### 🔒 Security Features

- **Sandboxed Execution**: Tools run in isolated Python environments
- **Resource Limits**: Memory (128MB) and execution time (15s) constraints
- **Code Validation**: Pattern-based security scanning
- **Process Isolation**: Each execution runs in a separate subprocess
- **Restricted Imports**: Only approved Python modules are available

### ⚡ Real-time Features

- **Live Progress Tracking**: Step-by-step execution progress with percentages
- **Status Updates**: Real-time status messages and execution states
- **Streaming Output**: Live stdout/stderr streaming via Server-Sent Events
- **Pause/Resume**: Ability to pause and resume long-running executions
- **Cancellation**: Force-stop running tools

### 🎛️ Management Features

- **Dynamic Configuration**: Hot-reload tool configurations without restart
- **Admin Interface**: Comprehensive admin API for tool management
- **Validation System**: Automatic validation of tool configurations
- **Tool Creation**: Programmatic creation of new tools with templates
- **Analytics**: Usage metrics and execution statistics

## Tool Development

### Creating a New Tool

#### 1. Using the Admin API

```bash
curl -X POST http://localhost:3000/api/admin/tools/create \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "my-tool",
    "toolName": "My Custom Tool",
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
      }
    }
  }'
```

#### 2. Manual Creation

1. Create tool directory: `tools/my-tool/`
2. Create `config.json` with tool configuration
3. Create `controller.py` with tool implementation
4. Make controller executable: `chmod +x controller.py`

### Tool Configuration Schema

```json
{
  "id": "tool-name",
  "name": "Human Readable Name",
  "description": "Tool description (minimum 10 characters)",
  "version": "1.0.0",
  "enabled": true,
  "allowedModels": ["openai/gpt-4o", "openai/gpt-4o-mini"],
  "maxExecutionTime": 30000,
  "requiresAuth": false,
  "rateLimit": {
    "requests": 10,
    "window": "1m"
  },
  "parameters": {
    "type": "object",
    "properties": {
      "parameter_name": {
        "type": "string",
        "description": "Parameter description"
      }
    },
    "required": ["parameter_name"],
    "additionalProperties": false
  },
  "returns": {
    "type": "object",
    "properties": {
      "success": {
        "type": "boolean",
        "description": "Whether the operation was successful"
      },
      "result": {
        "description": "The result of the operation"
      }
    }
  },
  "security": {
    "sandboxed": true,
    "no_file_access": true,
    "no_network_access": true,
    "memory_limit": "128MB",
    "timeout": 30
  }
}
```

### Controller Implementation

Tool controllers are Python scripts that receive JSON input via stdin and return JSON output via stdout.

#### Basic Template

```python
#!/usr/bin/env python3
import json
import sys
from datetime import datetime

def emit_progress(step, percentage=None, message=None):
    """Emit structured progress information"""
    progress_data = {
        'step': step,
        'percentage': percentage,
        'message': message,
        'timestamp': time.time()
    }
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)

def emit_status(status, message=None, details=None):
    """Emit status information"""
    status_data = {
        'status': status,
        'message': message,
        'details': details,
        'timestamp': time.time()
    }
    print(f"STATUS:{json.dumps(status_data)}", flush=True)

def main():
    try:
        # Read parameters from stdin
        input_data = sys.stdin.read()
        parameters = json.loads(input_data)
        
        # Emit progress updates
        emit_progress('initializing', 0, 'Starting tool execution')
        
        # Your tool logic here
        result = process_data(parameters)
        
        emit_progress('completed', 100, 'Tool execution completed')
        
        # Return result
        print(json.dumps({
            'success': True,
            'result': result,
            'timestamp': datetime.now().isoformat()
        }))
        
    except Exception as e:
        emit_status('failed', str(e))
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))

if __name__ == '__main__':
    main()
```

#### Available Python Modules

Tools have access to these Python modules:
- `math`, `statistics`, `random`
- `re`, `uuid`, `hashlib`, `base64`
- `json`, `time`, `datetime`
- `decimal`, `fractions`
- `collections`, `itertools`, `operator`, `functools`
- `bisect`, `heapq`

## API Reference

### Public Tool APIs

#### Execute Tool
```
POST /api/v1/tools/tools/:toolId/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "parameters": { /* tool parameters */ },
  "modelId": "openai/gpt-4o"
}
```

#### Get Available Tools
```
GET /api/v1/tools/tools
Authorization: Bearer <token>
```

#### Stream Tool Execution
```
GET /api/v1/tools/executions/stream
Authorization: Bearer <token>
Accept: text/event-stream
```

#### Control Tool Execution
```
POST /api/v1/tools/executions/:executionId/pause
POST /api/v1/tools/executions/:executionId/resume
POST /api/v1/tools/executions/:executionId/cancel
```

### Admin Tool APIs

#### Get All Tools (Admin)
```
GET /api/admin/tools/tools
Authorization: Bearer <admin-token>
```

#### Create New Tool
```
POST /api/admin/tools/create
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "toolId": "new-tool",
  "toolName": "New Tool",
  "options": { /* configuration options */ }
}
```

#### Validate All Tools
```
GET /api/admin/tools/validate
Authorization: Bearer <admin-token>
```

#### Get Tool Analytics
```
GET /api/admin/tools/analytics
Authorization: Bearer <admin-token>
```

#### Test Tool
```
POST /api/admin/tools/tools/:toolId/test
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "parameters": { /* test parameters */ }
}
```

## Security Considerations

### Sandboxing

Tools run in a restricted Python environment with:
- Limited builtin functions (no `open`, `exec`, `eval`, etc.)
- Restricted module imports
- Memory and time limits
- No file system access
- No network access
- Process isolation

### Code Validation

Before execution, code is scanned for dangerous patterns:
- File operations (`open`, `file`)
- System access (`os`, `sys`, `subprocess`)
- Network operations (`socket`, `urllib`, `requests`)
- Dangerous builtins (`exec`, `eval`, `compile`)
- Import manipulation (`__import__`, `importlib`)

### Rate Limiting

Tools can be configured with rate limits:
- Per-tool request limits
- Time-window based limits
- Model-specific restrictions

## Real-time Streaming

### Event Types

The streaming endpoint emits these event types:

- `execution_started` - Tool execution begins
- `execution_progress` - Regular stdout/stderr output
- `execution_progress_structured` - Structured progress with percentages
- `execution_status` - Status updates from tools
- `execution_completed` - Tool execution finished successfully
- `execution_failed` - Tool execution failed
- `execution_paused` - Tool execution paused
- `execution_resumed` - Tool execution resumed
- `execution_cancelled` - Tool execution cancelled

### Frontend Integration

```javascript
const eventSource = new EventSource('/api/v1/tools/executions/stream', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'execution_started':
      console.log('Tool started:', data.toolId);
      break;
    case 'execution_progress_structured':
      updateProgressBar(data.percentage);
      showStatusMessage(data.message);
      break;
    case 'execution_completed':
      console.log('Tool completed:', data.result);
      break;
    // Handle other event types...
  }
};
```

## Examples

### Code Execution Tool

The built-in code execution tool demonstrates advanced features:

```json
{
  "code": "import math\nresult = math.sqrt(16)\nprint(f'Square root: {result}')",
  "context_data": {
    "variables": {
      "user_name": "Alice",
      "user_age": 25
    },
    "data": [1, 2, 3, 4, 5]
  }
}
```

### Custom Calculator Tool

```python
#!/usr/bin/env python3
import json
import sys
from datetime import datetime

def calculate(expression):
    """Safely evaluate mathematical expressions"""
    allowed_chars = set('0123456789+-*/().')
    if not all(c in allowed_chars or c.isspace() for c in expression):
        raise ValueError("Invalid characters in expression")
    
    return eval(expression, {"__builtins__": {}})

def main():
    try:
        input_data = sys.stdin.read()
        parameters = json.loads(input_data)
        
        expression = parameters.get('expression', '')
        result = calculate(expression)
        
        print(json.dumps({
            'success': True,
            'expression': expression,
            'result': result,
            'timestamp': datetime.now().isoformat()
        }))
        
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))

if __name__ == '__main__':
    main()
```

## Troubleshooting

### Common Issues

1. **Tool Not Loading**
   - Check `config.json` syntax
   - Verify required fields are present
   - Run validation: `GET /api/admin/tools/validate`

2. **Permission Denied**
   - Ensure `controller.py` is executable: `chmod +x controller.py`
   - Check file ownership and permissions

3. **Timeout Errors**
   - Increase `maxExecutionTime` in config
   - Optimize tool logic for performance
   - Use progress reporting for long operations

4. **Import Errors**
   - Only use approved Python modules
   - Check security validation patterns

### Debugging

Enable debug logging:
```bash
DEBUG=tools* npm start
```

Check tool validation:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3000/api/admin/tools/validate
```

Test tool directly:
```bash
echo '{"test": "parameter"}' | python3 tools/my-tool/controller.py
```

## Best Practices

### Tool Development

1. **Always validate input parameters**
2. **Use structured progress reporting for long operations**
3. **Handle errors gracefully with meaningful messages**
4. **Keep tools stateless and idempotent**
5. **Follow the principle of least privilege**

### Security

1. **Never trust user input - validate everything**
2. **Use the smallest possible execution timeout**
3. **Restrict model access where appropriate**
4. **Regularly validate tool configurations**
5. **Monitor tool usage and performance**

### Performance

1. **Emit progress updates for operations > 1 second**
2. **Use appropriate rate limits**
3. **Optimize for memory efficiency**
4. **Consider caching for expensive operations**

---

For more information, see the [API documentation](./API.md) and [security guidelines](./SECURITY.md).