# Serverless Code Execution API

This document describes the serverless code execution feature that integrates with the external xenpac.org API to execute code in various programming languages.

## Overview

The serverless code execution feature allows you to execute code blocks in multiple programming languages without setting up local development environments. It uses the xenpac.org API for secure, sandboxed code execution.

## Features

- **Multi-language Support**: Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, Scala, R, MATLAB
- **Automatic Language Detection**: Detects programming language from code patterns
- **Real-time Streaming**: Get execution progress via Server-Sent Events
- **Secure Execution**: Code runs in isolated sandbox environments
- **Error Handling**: Comprehensive error reporting and handling
- **Direct Code Execution**: Execute code directly from AI response code blocks without predefined apps

## API Endpoints

### 1. Execute Code

**Endpoint:** `POST /api/execute-code`

**Description:** Execute code and return results synchronously.

**Request Body:**
```json
{
  "code": "print('Hello, World!')",
  "language": "python"  // Optional, auto-detected if not provided
}
```

**Response:**
```json
{
  "success": true,
  "result": "Hello, World!",
  "output": "Hello, World!\n",
  "error": null,
  "executionTime": 0.123,
  "language": "python"
}
```

### 2. Execute Code with Streaming

**Endpoint:** `POST /api/execute-code/stream`

**Description:** Execute code with real-time progress updates via Server-Sent Events.

**Request Body:**
```json
{
  "code": "for i in range(5):\n    print(f'Step {i}')\n    import time\n    time.sleep(1)",
  "language": "python"
}
```

**SSE Events:**
```
data: {"type":"execution_started","language":"python","timestamp":1234567890}

data: {"type":"execution_progress","output":"Step 0\n","timestamp":1234567891}

data: {"type":"execution_progress","output":"Step 1\n","timestamp":1234567892}

data: {"type":"execution_completed","timestamp":1234567895}
```

### 3. Get Supported Languages

**Endpoint:** `GET /api/execute-code/languages`

**Description:** Get list of supported programming languages.

**Response:**
```json
{
  "success": true,
  "languages": [
    {
      "id": "python",
      "name": "Python",
      "extension": ".py"
    },
    {
      "id": "javascript",
      "name": "JavaScript",
      "extension": ".js"
    }
    // ... more languages
  ]
}
```

## Supported Languages

| Language | ID | File Extension | Language ID |
|----------|----|----------------|-------------|
| Python | `python` | `.py` | 71 |
| JavaScript | `javascript` | `.js` | 63 |
| TypeScript | `typescript` | `.ts` | 74 |
| Java | `java` | `.java` | 62 |
| C++ | `cpp` | `.cpp` | 54 |
| C# | `csharp` | `.cs` | 51 |
| Go | `go` | `.go` | 60 |
| Rust | `rust` | `.rs` | 73 |
| PHP | `php` | `.php` | 68 |
| Ruby | `ruby` | `.rb` | 72 |
| Swift | `swift` | `.swift` | 83 |
| Kotlin | `kotlin` | `.kt` | 78 |
| Scala | `scala` | `.scala` | 81 |
| R | `r` | `.r` | 80 |
| MATLAB | `matlab` | `.m` | 58 |

## Language Detection

The service automatically detects the programming language based on code patterns:

- **Python**: `import`, `from`, `def`, `class`, `print(`, `if __name__`
- **JavaScript**: `function`, `const`, `let`, `var`, `console.`, `import`, `export`
- **TypeScript**: `interface`, `type`, `import`, `export`, `function`, `const`, `let`, `var`
- **Java**: `public class`, `import java`, `System.out`, `public static void main`
- **C++**: `#include`, `using namespace`, `int main`, `std::`, `cout <<`
- And more...

## Configuration

### Environment Variables

Set these environment variables to configure the external API:

```bash
# API Key for xenpac.org
XENPAC_API_KEY=94b3df12696e8f3e672fd40c91dc6e52
```

### Default Values

If environment variables are not set, the service uses these defaults:
- **API Key**: `94b3df12696e8f3e672fd40c91dc6e52`
- **Base URL**: `https://dev.xenpac.org/api`

## Usage Examples

### Python Example

```javascript
const response = await fetch('/api/execute-code', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    code: `
import math
print("Square root of 16:", math.sqrt(16))
print("Pi:", math.pi)
    `,
    language: 'python'
  })
});

const result = await response.json();
console.log(result.output);
```

### JavaScript Example

```javascript
const response = await fetch('/api/execute-code', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    code: `
const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log('Sum:', sum);
console.log('Average:', sum / numbers.length);
    `,
    language: 'javascript'
  })
});

const result = await response.json();
console.log(result.output);
```

### Streaming Example

```javascript
const eventSource = new EventSource('/api/execute-code/stream');

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'execution_started':
      console.log('Execution started for', data.language);
      break;
    case 'execution_progress':
      console.log('Output:', data.output);
      break;
    case 'execution_completed':
      console.log('Execution completed');
      eventSource.close();
      break;
    case 'execution_error':
      console.error('Error:', data.error);
      eventSource.close();
      break;
  }
};

// Send the code to execute
fetch('/api/execute-code/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    code: 'for i in range(3): print(f"Step {i}")',
    language: 'python'
  })
});
```

## Error Handling

The API returns structured error responses:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common error scenarios:
- **Invalid code**: Syntax errors or runtime errors in the code
- **Unsupported language**: Language not in the supported list
- **API errors**: External API service issues
- **Authentication errors**: Invalid or missing API key
- **Timeout errors**: Code execution taking too long

## Security Features

- **Sandboxed Execution**: Code runs in isolated environments
- **Timeout Protection**: 30-second execution timeout
- **Authentication Required**: All endpoints require valid authentication
- **Input Validation**: Code and language parameters are validated
- **Error Isolation**: Errors in one execution don't affect others

## Rate Limiting

The service respects rate limits from the external API. If you encounter rate limiting:

1. Wait before making additional requests
2. Consider using the streaming endpoint for long-running code
3. Implement exponential backoff in your client code

## Testing

Use the provided test script to verify the integration:

```bash
node test-external-code-execution.js
```

This will test:
- Python and JavaScript code execution
- Language detection
- Supported languages listing
- Error handling

## Integration with AI Portal

The serverless code execution feature integrates seamlessly with the AI Portal's existing tools system:

1. **Tool Integration**: Can be used as a tool in AI model conversations
2. **Streaming Support**: Real-time progress updates via SSE
3. **Authentication**: Uses the same authentication middleware
4. **Error Handling**: Consistent error response format
5. **Documentation**: Integrated with the main API documentation
6. **Direct Code Execution**: Execute code directly from AI response code blocks

## Troubleshooting

### Common Issues

1. **"API key invalid"**: Check your `XENPAC_API_KEY` environment variable
2. **"Language not supported"**: Check the supported languages list
3. **"Execution timeout"**: Code is taking too long to execute
4. **"Stream connection failed"**: Network issues or server problems

### Debug Mode

Enable debug logging by setting the log level in your application configuration.

## External API Reference

This feature integrates with the xenpac.org API:

- **Base URL**: `https://dev.xenpac.org/api`
- **Endpoint**: `/run`
- **Authentication**: `x-api-key` header
- **Format**: JSON with `mainFile`, `language_id`, `variables`, and `files` array

**Request Format:**
```json
{
  "mainFile": "main.py",
  "language_id": 71,
  "variables": {},
  "files": [
    {
      "name": "main.py",
      "content": "print('Hello, World!')"
    }
  ]
}
```

For more information about the external API, refer to the xenpac.org documentation.
