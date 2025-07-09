# Deep Research API Documentation

## Overview

The Deep Research API provides an advanced multi-agent research capability that breaks down complex queries into sub-questions, processes them in parallel using multiple Gemini 2.5 Flash agents with Google Search grounding, and synthesizes the results into a comprehensive final report.

## Endpoint

**POST** `/api/deep-research`

### Authentication

Requires authentication via JWT token in the `Authorization` header or API key in the `x-api-key` header.

### Request Body

```json
{
  "query": "string (required)",
  "model": "string (required)",
  "maxAgents": "number (optional, 2-12, default: 8)"
}
```

#### Parameters

- **query** (required): The research question or topic you want to investigate
- **model** (required): The model to use for task decomposition and synthesis (e.g., "google/gemini-2.5-pro")
- **maxAgents** (optional): Number of parallel research agents to deploy (2-12, default: 8)

### Response Format

The API uses Server-Sent Events (SSE) for real-time progress updates and delivers the final result in a single response.

#### Content-Type
```
text/event-stream
```

#### Response Events

##### 1. Progress Events
```json
{
  "type": "progress",
  "message": "Current status message",
  "progress": 0-100
}
```

##### 2. Completion Event
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
    "Sub-question 2",
    "..."
  ],
  "response": "Comprehensive synthesized research report",
  "sources": [
    {
      "url": "https://example.com/source1",
      "title": "Source Title",
      "relevantToQuestions": ["Sub-question 1", "Sub-question 2"]
    }
  ],
  "agentResults": [
    {
      "subQuestion": "Sub-question 1",
      "agentId": 1,
      "hasError": false,
      "sourceCount": 3
    }
  ]
}
```

##### 3. Error Events
```json
{
  "type": "error",
  "message": "Error description"
}
```

### Process Flow

1. **Task Decomposition** (Progress: 0-25%)
   - Main model analyzes the query
   - Breaks it into 2-12 specific sub-questions
   - Creates research approach strategy

2. **Parallel Research** (Progress: 25-75%)
   - Multiple Gemini 2.5 Flash agents work simultaneously
   - Each agent uses Google Search grounding
   - Real-time progress updates as agents complete

3. **Synthesis** (Progress: 75-100%)
   - Main model synthesizes all findings
   - Creates comprehensive final report
   - Aggregates sources and citations

### Usage Examples

#### Basic Request
```bash
curl -X POST http://localhost:3000/api/deep-research \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "What are the latest developments in quantum computing and their potential impact on cryptography?",
    "model": "google/gemini-2.5-pro",
    "maxAgents": 6
  }'
```

#### JavaScript/Node.js Example
```javascript
async function performDeepResearch(query, model, maxAgents = 8) {
  const response = await fetch('/api/deep-research', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
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
```

#### Frontend Integration Example
```javascript
// React Hook for Deep Research
function useDeepResearch() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const performResearch = async (query, model, maxAgents = 8) => {
    setIsLoading(true);
    setError(null);
    setProgress(0);

    try {
      const response = await fetch('/api/deep-research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ query, model, maxAgents })
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
              setIsLoading(false);
              return;
            }

            try {
              const event = JSON.parse(data);
              
              if (event.type === 'progress') {
                setProgress(event.progress);
                setStatus(event.message);
              } else if (event.type === 'completion') {
                setResult(event);
                setProgress(100);
                setStatus('Research completed successfully!');
              } else if (event.type === 'error') {
                setError(event.message);
                setIsLoading(false);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return { performResearch, progress, status, result, error, isLoading };
}
```

### Error Handling

#### Common Error Codes

- **400 Bad Request**: Invalid parameters
  - Missing required fields (query, model)
  - Invalid maxAgents value (must be 2-12)
  - Invalid model name

- **401 Unauthorized**: Authentication required
  - Missing or invalid JWT token
  - Missing or invalid API key

- **500 Internal Server Error**: Server-side errors
  - Gemini API configuration issues
  - Network connectivity problems
  - Model processing errors

#### Error Response Format
```json
{
  "error": "Error message description"
}
```

### Rate Limiting

The deep research API may be subject to rate limiting based on:
- User authentication level
- Model usage quotas
- API key restrictions

### Performance Considerations

- **Typical Response Time**: 30-120 seconds depending on query complexity
- **Concurrent Agents**: 2-12 agents work in parallel
- **Token Usage**: High token consumption due to multiple model calls
- **Search Quotas**: Uses Google Search grounding which may have quotas

### Best Practices

1. **Query Formulation**:
   - Be specific and focused
   - Include context for better sub-question generation
   - Avoid overly broad topics

2. **Model Selection**:
   - Use `google/gemini-2.5-pro` for complex synthesis tasks
   - Consider token limits for very long queries

3. **Agent Configuration**:
   - Start with 6-8 agents for balanced performance
   - Use fewer agents (2-4) for simple queries
   - Use more agents (8-12) for comprehensive research

4. **Error Handling**:
   - Implement proper SSE error handling
   - Handle network timeouts gracefully
   - Provide fallback mechanisms

### Security Considerations

- All requests require authentication
- Input validation prevents injection attacks
- Rate limiting prevents abuse
- No sensitive data is logged
- Google Search grounding follows privacy guidelines

### Monitoring and Logging

The API logs:
- Request parameters (query, model, maxAgents)
- Agent completion status
- Error conditions
- Performance metrics

## Support

For issues or questions regarding the Deep Research API, please refer to the main API documentation or contact the development team.

## Changelog

### Version 1.0.0
- Initial release with multi-agent research capability
- Google Search grounding integration
- Real-time progress streaming
- Comprehensive source attribution