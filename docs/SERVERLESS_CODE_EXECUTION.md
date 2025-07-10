# Serverless Code Execution API

This document describes the serverless code execution endpoints that allow frontend applications (like xenpac.org) to execute AI-generated code blocks without authentication.

## Overview

The serverless code execution system integrates with external code execution APIs (like Judge0) to provide secure, sandboxed code execution for multiple programming languages. It's designed to be called directly from frontend applications without requiring user authentication.

## Endpoints

### 1. Get Supported Languages

Get all supported programming languages for code execution.

**Endpoint:** `GET /api/v1/tools/languages`

**Response:**
```json
{
  "success": true,
  "languages": [
    {
      "name": "python",
      "id": 71,
      "mainFile": "main.py"
    },
    {
      "name": "javascript",
      "id": 63,
      "mainFile": "main.js"
    },
    {
      "name": "java",
      "id": 62,
      "mainFile": "Main.java"
    }
  ],
  "count": 100
}
```

### 2. Execute Code (Non-Streaming)

Execute code in any supported programming language and return the result immediately.

**Endpoint:** `POST /api/v1/tools/execute-code`

**Request Body:**
```json
{
  "code": "print('Hello, World!')\nresult = 2 + 2\nprint(f'Result: {result}')",
  "language": "python",
  "variables": {
    "radius": 5,
    "pi": 3.14159
  },
  "execution_id": "optional-custom-id"
}
```

**Response:**
```json
{
  "success": true,
  "execution_id": "serverless_1703123456789_abc123def",
  "result": {
    "success": true,
    "output": "Hello, World!\nResult: 4\n",
    "execution_time": 45.67,
    "result": 4
  },
  "execution_time": 67.89,
  "timestamp": "2023-12-21T10:30:45.123Z"
}
```

### 3. Execute Code (Streaming)

Execute code with real-time progress updates via Server-Sent Events.

**Endpoint:** `POST /api/v1/tools/execute-code/stream`

**Request Body:** Same as non-streaming endpoint

**Stream Events:**
```javascript
// Connection established
data: {"type": "connected", "execution_id": "...", "message": "Serverless code execution stream connected"}

// Execution started
data: {"type": "execution_started", "execution_id": "...", "toolId": "code-execution"}

// Progress update
data: {"type": "execution_progress_structured", "execution_id": "...", "step": "executing", "percentage": 50, "message": "Processing data"}

// Execution completed
data: {"type": "execution_completed", "execution_id": "...", "result": {...}, "execution_time": 67.89}

// Keep-alive ping
data: {"type": "ping", "execution_id": "...", "timestamp": 1703123456789}
```

## Frontend Integration Examples

### JavaScript/TypeScript

#### Non-Streaming Execution
```javascript
async function executeCode(code, language = null, variables = {}) {
  try {
    const response = await fetch('https://api.sculptorai.org/api/v1/tools/execute-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: code,
        language: language,
        variables: variables
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Code executed successfully:', result.result);
      return result;
    } else {
      console.error('Code execution failed:', result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}

// Usage examples
// Python
executeCode(`
import math
radius = 5
area = math.pi * radius ** 2
print(f"Area of circle with radius {radius}: {area:.2f}")
result = area
`, 'python').then(result => {
  console.log('Python execution result:', result);
}).catch(error => {
  console.error('Error:', error);
});

// JavaScript
executeCode(`
const radius = 5;
const area = Math.PI * radius ** 2;
console.log(\`Area of circle with radius \${radius}: \${area.toFixed(2)}\`);
result = area;
`, 'javascript').then(result => {
  console.log('JavaScript execution result:', result);
}).catch(error => {
  console.error('Error:', error);
});
```

#### Streaming Execution
```javascript
function executeCodeStreaming(code, language = null, variables = {}, onProgress = null, onComplete = null, onError = null) {
  const eventSource = new EventSource('/api/v1/tools/execute-code/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code,
      language: language,
      variables: variables
    })
  });

  eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'connected':
        console.log('Connected to execution stream');
        break;
        
      case 'execution_started':
        console.log('Code execution started');
        break;
        
      case 'execution_progress_structured':
        if (onProgress) {
          onProgress(data.percentage, data.message);
        }
        break;
        
      case 'execution_completed':
        if (onComplete) {
          onComplete(data.result);
        }
        eventSource.close();
        break;
        
      case 'execution_failed':
        if (onError) {
          onError(data.error);
        }
        eventSource.close();
        break;
        
      case 'ping':
        // Keep-alive ping, ignore
        break;
    }
  };

  eventSource.onerror = function(error) {
    console.error('EventSource error:', error);
    if (onError) {
      onError('Connection error');
    }
    eventSource.close();
  };

  return eventSource;
}

// Usage example
executeCodeStreaming(
  `
import time
for i in range(5):
    print(f"Processing step {i+1}/5")
    time.sleep(0.5)
result = "Processing complete"
  `,
  'python',
  {},
  (percentage, message) => {
    console.log(`Progress: ${percentage}% - ${message}`);
  },
  (result) => {
    console.log('Execution completed:', result);
  },
  (error) => {
    console.error('Execution failed:', error);
  }
);
```

### React Component Example

```jsx
import React, { useState } from 'react';

function CodeExecutor({ code, contextData }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const executeCode = async () => {
    setIsExecuting(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const response = await fetch('/api/v1/tools/execute-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          context_data: contextData
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setResult(data.result);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="code-executor">
      <button 
        onClick={executeCode} 
        disabled={isExecuting}
        className="execute-button"
      >
        {isExecuting ? 'Executing...' : 'Execute Code'}
      </button>
      
      {isExecuting && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
          <span>{progress}%</span>
        </div>
      )}
      
      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {result && (
        <div className="result">
          <h4>Execution Result:</h4>
          <pre>{result.output}</pre>
          {result.result && (
            <div>
              <strong>Return Value:</strong> {JSON.stringify(result.result)}
            </div>
          )}
          <div className="execution-time">
            Execution time: {result.execution_time}ms
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeExecutor;
```

## Supported Programming Languages

The system supports 100+ programming languages including:

### Popular Languages
- **Python** (3.8.1) - ID: 71
- **JavaScript** (Node.js 12.14.0) - ID: 63
- **Java** (OpenJDK 13.0.1) - ID: 62
- **C++** (GCC 9.2.0) - ID: 54
- **C** (GCC 9.2.0) - ID: 50
- **C#** (Mono 6.6.0.161) - ID: 51
- **PHP** (7.4.1) - ID: 68
- **Ruby** (2.7.0) - ID: 72
- **Go** (1.13.5) - ID: 60
- **Rust** (1.40.0) - ID: 73
- **Swift** (5.2.3) - ID: 83
- **Kotlin** (1.3.70) - ID: 78
- **TypeScript** (3.7.4) - ID: 74

### Specialized Languages
- **R** (4.0.0) - ID: 80
- **SQL** (SQLite 3.27.2) - ID: 82
- **Bash** (5.0.0) - ID: 46
- **Assembly** (NASM 2.14.02) - ID: 45
- **Haskell** (GHC 8.8.1) - ID: 61
- **Lua** (5.3.5) - ID: 64
- **Perl** (5.28.1) - ID: 85
- **Scala** (2.13.2) - ID: 81

### Esoteric Languages
- **Brainfuck** - ID: 44
- **LOLCODE** - ID: 89
- **Whitespace** - ID: 36
- **Malbolge** - ID: 35
- **Hexagony** - ID: 25

## Security Features

- **Sandboxed Execution**: Code runs in isolated environments
- **Resource Limits**: Memory and execution time constraints
- **Process Isolation**: Each execution runs in a separate container
- **No Network Access**: Cannot make external network requests
- **No File System Access**: Cannot read/write files outside sandbox

## Limitations

- **Code Length**: Maximum 10,000 characters
- **Execution Time**: Varies by language (typically 5-15 seconds)
- **Memory**: Varies by language (typically 128MB-512MB)
- **No File Access**: Cannot read/write files outside sandbox
- **No Network Access**: Cannot make external network requests
- **No System Access**: Cannot access system resources
- **Language-Specific**: Some languages may have additional restrictions

## Error Handling

Common error responses:

```json
{
  "success": false,
  "error": "Code parameter is required and must be a string",
  "timestamp": "2023-12-21T10:30:45.123Z"
}
```

```json
{
  "success": false,
  "error": "Code length exceeds maximum limit of 10,000 characters",
  "timestamp": "2023-12-21T10:30:45.123Z"
}
```

```json
{
  "success": false,
  "error": "Security validation failed: Import of 'os' module is not allowed",
  "timestamp": "2023-12-21T10:30:45.123Z"
}
```

## Rate Limiting

The serverless endpoints are subject to rate limiting to prevent abuse:
- 20 requests per 5 minutes per IP address
- Additional limits may apply based on server configuration

## CORS Support

The endpoints support CORS and can be called from any origin, making them suitable for frontend integration. 