# AI Portal Tools

This directory contains the tools available to AI models in the AI Portal system. Each tool provides specific functionality that can be called by AI models during conversations.

## Available Tools

### 🐍 Code Execution (`code-execution/`)
Securely execute Python code in a sandboxed environment.

**Features:**
- Secure sandboxed execution
- Real-time progress tracking
- Memory and time limits
- Support for mathematical and data analysis operations
- Context data passing (variables and datasets)

**Example Usage:**
```json
{
  "code": "import math\nresult = math.sqrt(16)\nprint(f'Square root: {result}')",
  "context_data": {
    "variables": {"radius": 5},
    "data": [1, 2, 3, 4, 5]
  }
}
```

### 🧪 Test Tool (`test-tool/`)
A simple test tool for validating the tools system functionality.

**Features:**
- Basic parameter validation
- Simple message processing
- System health verification

### 📊 Test Calculator (`test-calculator/`)
Example calculator tool created using the tool creation system.

**Features:**
- Demonstrates tool creation workflow
- Template-based implementation
- Basic parameter handling

## Tool Development

### Quick Start

1. **Create a new tool using the admin API:**
```bash
curl -X POST http://localhost:3000/api/admin/tools/create \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "my-tool",
    "toolName": "My Tool",
    "options": {
      "description": "A custom tool for specific functionality"
    }
  }'
```

2. **Edit the generated `controller.py`** to implement your logic

3. **Test your tool:**
```bash
echo '{"test": "data"}' | python3 tools/my-tool/controller.py
```

### Tool Structure

Each tool directory contains:
```
my-tool/
├── config.json      # Tool configuration and metadata
├── controller.py    # Python implementation (executable)
├── README.md        # Tool documentation
└── test.py          # Optional test file
```

### Configuration File (`config.json`)

Required fields:
- `id`: Tool identifier (kebab-case)
- `name`: Human-readable name
- `description`: Tool description (min 10 chars)
- `version`: Semantic version (e.g., "1.0.0")
- `parameters`: JSON Schema for input parameters

Optional fields:
- `enabled`: Whether tool is active (default: true)
- `allowedModels`: Array of model IDs that can use this tool
- `maxExecutionTime`: Timeout in milliseconds
- `rateLimit`: Request rate limiting configuration
- `security`: Security configuration options

### Controller Implementation (`controller.py`)

Controllers are Python scripts that:
1. Read JSON parameters from stdin
2. Process the data
3. Output JSON results to stdout

**Basic Template:**
```python
#!/usr/bin/env python3
import json
import sys
from datetime import datetime

def main():
    try:
        # Read input
        input_data = sys.stdin.read()
        parameters = json.loads(input_data)
        
        # Process data
        result = process_data(parameters)
        
        # Return result
        print(json.dumps({
            'success': True,
            'result': result,
            'timestamp': datetime.now().isoformat()
        }))
        
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))

def process_data(parameters):
    # Implement your tool logic here
    return f"Processed: {parameters}"

if __name__ == '__main__':
    main()
```

### Available Python Modules

Tools have access to these Python standard library modules:
- **Math**: `math`, `statistics`, `random`, `decimal`, `fractions`
- **Text**: `re`, `string` operations
- **Data**: `json`, `collections`, `itertools`
- **Utils**: `time`, `datetime`, `uuid`, `hashlib`, `base64`
- **Algorithms**: `bisect`, `heapq`, `operator`, `functools`

### Progress Reporting

For long-running operations, emit structured progress:

```python
def emit_progress(step, percentage=None, message=None):
    progress_data = {
        'step': step,
        'percentage': percentage,
        'message': message,
        'timestamp': time.time()
    }
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)

# Usage
emit_progress('processing', 50, 'Halfway through computation')
```

### Status Updates

Emit status information:

```python
def emit_status(status, message=None, details=None):
    status_data = {
        'status': status,
        'message': message,
        'details': details,
        'timestamp': time.time()
    }
    print(f"STATUS:{json.dumps(status_data)}", flush=True)

# Usage
emit_status('running', 'Processing user data')
```

## Security Guidelines

### Sandboxing
All tools run in a secure sandbox with:
- Memory limits (128MB default)
- Execution timeouts (15s default)
- Restricted Python environment
- No file system access
- No network access
- Process isolation

### Code Validation
Before execution, code is validated for:
- Dangerous imports (`os`, `sys`, `subprocess`)
- File operations (`open`, `file`)
- System functions (`exec`, `eval`)
- Network operations (`socket`, `urllib`)

### Best Practices
1. **Validate all input parameters**
2. **Handle errors gracefully**
3. **Use minimal execution time**
4. **Avoid stateful operations**
5. **Follow principle of least privilege**

## Testing Tools

### Local Testing
Test tools directly:
```bash
echo '{"parameter": "value"}' | python3 tools/my-tool/controller.py
```

### API Testing
Test via API:
```bash
curl -X POST http://localhost:3000/api/v1/tools/tools/my-tool/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"test": "data"}}'
```

### Admin Testing
Test with admin API:
```bash
curl -X POST http://localhost:3000/api/admin/tools/tools/my-tool/test \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"test": "data"}}'
```

## Validation

Validate all tools:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3000/api/admin/tools/validate
```

Common validation errors:
- Missing required configuration fields
- Invalid parameter schemas
- Non-executable controller files
- Security policy violations

## Real-time Monitoring

Monitor tool execution in real-time:
```javascript
const eventSource = new EventSource('/api/v1/tools/executions/stream');
eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Tool event:', data);
};
```

## Examples

### Simple Calculator
```python
#!/usr/bin/env python3
import json
import sys
import operator

OPERATORS = {
    '+': operator.add,
    '-': operator.sub,
    '*': operator.mul,
    '/': operator.truediv
}

def calculate(expression):
    # Simple calculator implementation
    parts = expression.split()
    if len(parts) != 3:
        raise ValueError("Format: number operator number")
    
    a, op, b = parts
    return OPERATORS[op](float(a), float(b))

def main():
    try:
        parameters = json.loads(sys.stdin.read())
        result = calculate(parameters['expression'])
        
        print(json.dumps({
            'success': True,
            'result': result,
            'expression': parameters['expression']
        }))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))

if __name__ == '__main__':
    main()
```

### Data Processor
```python
#!/usr/bin/env python3
import json
import sys
import statistics

def process_data(data, operation):
    if operation == 'mean':
        return statistics.mean(data)
    elif operation == 'median':
        return statistics.median(data)
    elif operation == 'sum':
        return sum(data)
    elif operation == 'count':
        return len(data)
    else:
        raise ValueError(f"Unknown operation: {operation}")

def main():
    try:
        parameters = json.loads(sys.stdin.read())
        data = parameters['data']
        operation = parameters['operation']
        
        result = process_data(data, operation)
        
        print(json.dumps({
            'success': True,
            'result': result,
            'operation': operation,
            'data_count': len(data)
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

1. **Tool not loading**: Check config.json syntax and required fields
2. **Permission denied**: Make controller.py executable (`chmod +x`)
3. **Import errors**: Only use allowed Python modules
4. **Timeout errors**: Reduce execution time or increase timeout

### Debug Mode

Enable debug logging:
```bash
DEBUG=tools* npm start
```

Check tool logs in the console output.

---

For complete documentation, see:
- [Tools System Documentation](../docs/TOOLS_SYSTEM.md)
- [Tools API Reference](../docs/TOOLS_API.md)