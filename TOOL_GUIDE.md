# AI Portal Tools System - Frontend Developer Guide

## 🚀 Overview

The AI Portal Tools System enables models to call external functions and execute code during conversations. This guide covers how to integrate tool support into your frontend application.

## 📡 Streaming Tool Events

When a model uses tools, several streaming events are sent to the frontend. You need to handle these events in your SSE (Server-Sent Events) stream processing.

### Event Types

#### 1. Tools Available
Sent when a model has tools available for use:

```json
{
  "type": "tools_available",
  "tools": [
    {"id": "test-tool", "name": "Test Tool"},
    {"id": "python-executor", "name": "Python Code Executor"}
  ]
}
```

#### 2. Tool Call Started
Sent when a tool is being executed:

```json
{
  "type": "tool_call",
  "tool_name": "test-tool",
  "tool_id": "call_abc123",
  "status": "executing"
}
```

#### 3. Tool Execution Result
Sent when a tool completes successfully:

```json
{
  "type": "tool_result",
  "tool_name": "test-tool",
  "tool_id": "call_abc123",
  "status": "completed",
  "result": {
    "success": true,
    "message": "Tools system working! Received: Hello World",
    "timestamp": "2024-07-03T12:00:00.000Z",
    "executionTime": 0.1
  }
}
```

#### 4. Tool Execution Error
Sent when a tool fails:

```json
{
  "type": "tool_error",
  "tool_name": "test-tool",
  "tool_id": "call_abc123", 
  "status": "error",
  "error": "Tool execution failed: Missing required parameter"
}
```

## 🔧 Frontend Implementation

### React/JavaScript Example

```javascript
import React, { useState, useEffect } from 'react';

const ChatWithTools = () => {
  const [messages, setMessages] = useState([]);
  const [toolStatus, setToolStatus] = useState({});
  const [availableTools, setAvailableTools] = useState([]);

  const sendMessage = async (messageText) => {
    const response = await fetch('/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your-api-key'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-tools', // Model with tools enabled
        messages: [
          { role: 'user', content: messageText }
        ],
        stream: true
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentMessage = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // Handle tool events
            if (parsed.type === 'tools_available') {
              setAvailableTools(parsed.tools);
              console.log('Tools available:', parsed.tools);
            } 
            else if (parsed.type === 'tool_call') {
              setToolStatus(prev => ({
                ...prev,
                [parsed.tool_id]: {
                  name: parsed.tool_name,
                  status: 'executing'
                }
              }));
              console.log(`Tool ${parsed.tool_name} executing...`);
            }
            else if (parsed.type === 'tool_result') {
              setToolStatus(prev => ({
                ...prev,
                [parsed.tool_id]: {
                  ...prev[parsed.tool_id],
                  status: 'completed',
                  result: parsed.result
                }
              }));
              console.log(`Tool ${parsed.tool_name} completed:`, parsed.result);
            }
            else if (parsed.type === 'tool_error') {
              setToolStatus(prev => ({
                ...prev,
                [parsed.tool_id]: {
                  ...prev[parsed.tool_id],
                  status: 'error',
                  error: parsed.error
                }
              }));
              console.error(`Tool ${parsed.tool_name} failed:`, parsed.error);
            }
            // Handle regular message content
            else if (parsed.choices?.[0]?.delta?.content) {
              currentMessage += parsed.choices[0].delta.content;
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages[newMessages.length - 1]?.role === 'assistant') {
                  newMessages[newMessages.length - 1].content = currentMessage;
                } else {
                  newMessages.push({ role: 'assistant', content: currentMessage });
                }
                return newMessages;
              });
            }
          } catch (e) {
            // Skip parsing errors
            console.warn('Failed to parse SSE data:', e);
          }
        }
      }
    }
  };

  return (
    <div className="chat-container">
      {/* Tool Status Indicators */}
      {Object.entries(toolStatus).map(([toolId, status]) => (
        <div key={toolId} className={`tool-status tool-${status.status}`}>
          🔧 {status.name}: {status.status}
          {status.status === 'error' && (
            <span className="error">❌ {status.error}</span>
          )}
          {status.status === 'completed' && (
            <span className="success">✅ Completed</span>
          )}
        </div>
      ))}

      {/* Available Tools Display */}
      {availableTools.length > 0 && (
        <div className="available-tools">
          🛠️ Available tools: {availableTools.map(t => t.name).join(', ')}
        </div>
      )}

      {/* Messages */}
      {messages.map((msg, idx) => (
        <div key={idx} className={`message ${msg.role}`}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
    </div>
  );
};

export default ChatWithTools;
```

### CSS Styling Example

```css
.tool-status {
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 6px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-executing {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.tool-completed {
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.tool-error {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.available-tools {
  background-color: #e7f3ff;
  border: 1px solid #b6d7ff;
  padding: 8px 12px;
  border-radius: 6px;
  margin: 8px 0;
  color: #0056b3;
  font-size: 14px;
}

.tool-status .error {
  color: #dc3545;
  font-weight: bold;
}

.tool-status .success {
  color: #28a745;
  font-weight: bold;
}
```

### Vue.js Example

```vue
<template>
  <div class="chat-with-tools">
    <!-- Tool Status -->
    <div v-for="(status, toolId) in toolStatus" :key="toolId" 
         :class="['tool-status', `tool-${status.status}`]">
      🔧 {{ status.name }}: {{ status.status }}
      <span v-if="status.status === 'error'" class="error">
        ❌ {{ status.error }}
      </span>
      <span v-if="status.status === 'completed'" class="success">
        ✅ Completed
      </span>
    </div>

    <!-- Available Tools -->
    <div v-if="availableTools.length > 0" class="available-tools">
      🛠️ Available tools: {{ availableTools.map(t => t.name).join(', ') }}
    </div>

    <!-- Messages -->
    <div v-for="(message, index) in messages" :key="index" 
         :class="['message', message.role]">
      <strong>{{ message.role }}:</strong> {{ message.content }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'ChatWithTools',
  data() {
    return {
      messages: [],
      toolStatus: {},
      availableTools: []
    };
  },
  methods: {
    async sendMessage(messageText) {
      const response = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your-api-key'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-tools',
          messages: [
            { role: 'user', content: messageText }
          ],
          stream: true
        })
      });

      await this.handleStreamingResponse(response);
    },

    async handleStreamingResponse(response) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              this.handleToolEvent(parsed);
              this.handleMessageContent(parsed);
            } catch (e) {
              console.warn('Failed to parse SSE data:', e);
            }
          }
        }
      }
    },

    handleToolEvent(parsed) {
      if (parsed.type === 'tools_available') {
        this.availableTools = parsed.tools;
      } else if (parsed.type === 'tool_call') {
        this.$set(this.toolStatus, parsed.tool_id, {
          name: parsed.tool_name,
          status: 'executing'
        });
      } else if (parsed.type === 'tool_result') {
        this.$set(this.toolStatus, parsed.tool_id, {
          ...this.toolStatus[parsed.tool_id],
          status: 'completed',
          result: parsed.result
        });
      } else if (parsed.type === 'tool_error') {
        this.$set(this.toolStatus, parsed.tool_id, {
          ...this.toolStatus[parsed.tool_id],
          status: 'error',
          error: parsed.error
        });
      }
    },

    handleMessageContent(parsed) {
      if (parsed.choices?.[0]?.delta?.content) {
        const content = parsed.choices[0].delta.content;
        if (this.messages.length > 0 && 
            this.messages[this.messages.length - 1].role === 'assistant') {
          this.messages[this.messages.length - 1].content += content;
        } else {
          this.messages.push({ role: 'assistant', content });
        }
      }
    }
  }
};
</script>
```

## 🎯 Best Practices

### 1. User Experience
- **Show tool status clearly**: Use visual indicators (loading spinners, success/error icons)
- **Provide context**: Explain what each tool does when it's being used
- **Handle errors gracefully**: Show user-friendly error messages
- **Manage expectations**: Let users know tools are being executed

### 2. Performance
- **Debounce updates**: Avoid updating UI too frequently during rapid tool calls
- **Clean up status**: Remove completed tool statuses after a timeout
- **Batch updates**: Group multiple tool status updates when possible

### 3. Error Handling
```javascript
const handleToolError = (toolError) => {
  console.error(`Tool ${toolError.tool_name} failed:`, toolError.error);
  
  // Show user-friendly message
  toast.error(`${toolError.tool_name} encountered an error. Please try again.`);
  
  // Log for debugging
  analytics.track('tool_error', {
    tool_name: toolError.tool_name,
    error: toolError.error
  });
};
```

### 4. Security Considerations
- **Validate tool results**: Don't trust tool results blindly
- **Sanitize display**: Escape HTML/JS when displaying tool results
- **Rate limiting**: Implement client-side rate limiting for tool-heavy operations

## 🔧 Testing Tools Integration

### Test with the Built-in Test Tool

The system includes a test tool that you can use to verify your frontend integration:

1. **Enable the test tool** via the admin API:
```bash
curl -X PUT https://api.sculptorai.org/api/admin/tools/test-tool/enabled \\
  -H "Authorization: Bearer <admin-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"enabled": true}'
```

2. **Send a message** that would trigger the test tool:
```javascript
sendMessage("Please use the test tool to verify everything is working");
```

3. **Verify events** are received in your frontend:
   - `tools_available` with test-tool
   - `tool_call` when the tool starts
   - `tool_result` with success message

## 📚 Advanced Usage

### Custom Tool Status Components

```javascript
const ToolStatusIndicator = ({ toolId, status }) => {
  const getIcon = () => {
    switch (status.status) {
      case 'executing': return '⏳';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '🔧';
    }
  };

  const getColor = () => {
    switch (status.status) {
      case 'executing': return '#ffa500';
      case 'completed': return '#28a745';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return (
    <div className="tool-indicator" style={{ color: getColor() }}>
      {getIcon()} {status.name}
      {status.status === 'executing' && <Spinner />}
      {status.status === 'completed' && (
        <small>({status.result?.executionTime}ms)</small>
      )}
      {status.status === 'error' && (
        <details>
          <summary>Error details</summary>
          <pre>{status.error}</pre>
        </details>
      )}
    </div>
  );
};
```

### Tool Result Formatting

```javascript
const formatToolResult = (result) => {
  if (result.success) {
    return {
      type: 'success',
      message: result.message,
      data: result.data,
      executionTime: result.executionTime
    };
  } else {
    return {
      type: 'error',
      message: result.error || 'Tool execution failed',
      details: result.details
    };
  }
};
```

## 🚨 Troubleshooting

### Common Issues

**Tools not appearing in stream:**
- Verify the model has tools enabled in its configuration
- Check that tools are globally enabled
- Ensure the model supports function calling

**Tool events not being parsed:**
- Check your SSE parsing logic
- Verify JSON parsing doesn't throw errors
- Look for typos in event type checks

**Tool execution failing:**
- Check server logs for Python execution errors
- Verify tool configuration is correct
- Ensure tool has proper permissions

### Debug Logging

```javascript
const debugToolEvents = (parsed) => {
  if (parsed.type?.startsWith('tool')) {
    console.group(`🔧 Tool Event: ${parsed.type}`);
    console.log('Data:', parsed);
    console.log('Timestamp:', new Date().toISOString());
    console.groupEnd();
  }
};
```

---

## 📝 Summary

The Tools System provides a powerful way to extend AI model capabilities with external functions. Key points for frontend integration:

1. **Handle streaming events** for tools_available, tool_call, tool_result, and tool_error
2. **Provide clear UX** with loading states and error handling
3. **Test thoroughly** with the built-in test tool
4. **Follow best practices** for performance and security

For backend development and creating custom tools, see the main API documentation and tool creation guides.

---

**Happy coding! 🚀**