# Live API v2 - Ephemeral Token Implementation

## Overview

The Live API v2 introduces a simplified, secure approach to accessing Google's Gemini Live API. Instead of managing WebSocket connections server-side, this implementation provides ephemeral tokens that allow clients to connect directly to the Gemini Live API.

## Architecture

### Before (v1) - Complex Server-Side Management
```
Client → Server WebSocket → Server Session Management → Gemini API
```

### After (v2) - Simple Token-Based Access
```
Client → Server (Token Request) → Client → Gemini API (Direct Connection)
```

## Key Benefits

- **Simplified Architecture**: No server-side session management
- **Better Performance**: Direct client-to-Gemini connection reduces latency
- **Enhanced Security**: Short-lived tokens reduce exposure risk
- **Reduced Server Load**: Server only handles token generation
- **Scalability**: No WebSocket connection limits on server

## API Endpoints

### Generate Ephemeral Token

**POST** `/api/v1/live-token`

Generate a short-lived token for direct Gemini Live API access.

#### Request Body (Optional)
```json
{
  "model": "gemini-2.0-flash-live-001",
  "responseModality": "TEXT",
  "duration": 30,
  "systemInstruction": "You are a helpful assistant",
  "temperature": 1.0
}
```

#### Response
```json
{
  "success": true,
  "token": "projects/*/locations/*/ephemeralTokens/*",
  "expiresAt": "2024-01-01T01:30:00Z",
  "sessionStartWindow": "2024-01-01T01:02:00Z",
  "constraints": {
    "model": "gemini-2.0-flash-live-001",
    "maxDuration": 30,
    "responseModality": "TEXT"
  },
  "usage": {
    "activeTokens": 1,
    "tokensLastHour": 3,
    "tokensLastDay": 15,
    "limits": {
      "tokensPerHour": 10,
      "tokensPerDay": 100
    }
  }
}
```

### Get Token Usage

**GET** `/api/v1/live-token/usage`

Get current user's token usage statistics.

#### Response
```json
{
  "success": true,
  "data": {
    "activeTokens": 1,
    "tokensLastHour": 3,
    "tokensLastDay": 15,
    "limits": {
      "tokensPerHour": 10,
      "tokensPerDay": 100
    }
  }
}
```

## Security Features

### Rate Limiting
- **Token Generation**: 15 tokens per hour per user
- **Cooldown Period**: 5 minutes between token requests
- **Daily Limits**: 100 tokens per day per user

### Security Measures
- **Request Validation**: Strict input validation and sanitization
- **Pattern Detection**: Identifies suspicious activity patterns
- **IP Blocking**: Automatic blocking of malicious IPs
- **Token Constraints**: Server-side enforcement of model and configuration limits

### Abuse Prevention
- **Short Token Lifetime**: Default 30 minutes, maximum 60 minutes
- **Session Start Window**: 2 minutes to begin using token
- **Single Use**: Each token can only be used once
- **Fingerprinting**: Request pattern analysis to detect bots

## Configuration

### Environment Variables

```bash
# Token Configuration
LIVE_API_TOKEN_DURATION_MINUTES=30
LIVE_API_MAX_TOKEN_DURATION_MINUTES=60
LIVE_API_SESSION_START_WINDOW_MINUTES=2

# Rate Limiting
LIVE_API_MAX_TOKENS_PER_HOUR=10
LIVE_API_MAX_TOKENS_PER_DAY=100
LIVE_API_COOLDOWN_PERIOD_MINUTES=5

# Security
LIVE_API_DEFAULT_MODEL=gemini-2.0-flash-live-001
LIVE_API_ALLOWED_MODELS=gemini-2.0-flash-live-001,gemini-live-2.5-flash-preview
LIVE_API_ALLOW_CUSTOM_INSTRUCTIONS=false
LIVE_API_DEFAULT_SYSTEM_INSTRUCTION="You are a helpful assistant."
```

## Client Implementation

### JavaScript Example

```javascript
// 1. Get ephemeral token
const tokenResponse = await fetch('/api/v1/live-token', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gemini-2.0-flash-live-001',
    responseModality: 'TEXT',
    duration: 30
  })
});

const { token, expiresAt } = await tokenResponse.json();

// 2. Connect directly to Gemini Live API
import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: token // Use ephemeral token as API key
});

const session = await ai.live.connect({
  model: 'gemini-2.0-flash-live-001',
  config: {
    responseModalities: [Modality.TEXT]
  },
  callbacks: {
    onopen: () => console.log('Connected to Gemini Live'),
    onmessage: (message) => console.log('Message:', message),
    onerror: (error) => console.error('Error:', error),
    onclose: () => console.log('Connection closed')
  }
});

// 3. Send messages
session.sendClientContent({
  turns: 'Hello, how are you?'
});
```

## Migration Guide

### From v1 to v2

1. **Remove WebSocket Code**: Replace WebSocket connections with token requests
2. **Update Authentication**: Use ephemeral tokens instead of session-based auth
3. **Handle Token Expiration**: Implement token renewal logic
4. **Direct API Calls**: Connect client directly to Gemini Live API

### Breaking Changes

- WebSocket endpoints (`/ws/live-audio`) are deprecated
- Session management endpoints are deprecated
- Authentication flow changed to token-based
- Rate limiting moved to token generation

## Error Handling

### Common Errors

- **429 Rate Limit Exceeded**: User has exceeded token generation limits
- **400 Invalid Request**: Invalid model or configuration parameters
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: IP blocked due to suspicious activity

### Error Response Format

```json
{
  "success": false,
  "error": "Rate limit exceeded: 10 tokens per hour",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600
}
```

## Monitoring

### Metrics to Track

- Token generation rate
- Active tokens per user
- Failed token requests
- Security violations
- IP blocks

### Health Check

**GET** `/api/v1/live-token/health`

Returns service health status.

## Best Practices

1. **Token Management**: Store tokens securely, handle expiration gracefully
2. **Error Handling**: Implement retry logic with exponential backoff
3. **Security**: Validate all inputs, never expose tokens in logs
4. **Performance**: Cache configuration, reuse connections when possible
5. **Monitoring**: Track usage patterns, monitor for abuse

## Troubleshooting

### Common Issues

1. **Token Expired**: Generate new token before expiration
2. **Rate Limited**: Implement proper backoff and retry logic
3. **Invalid Model**: Check allowed models in configuration
4. **Connection Failed**: Verify token is valid and not expired

### Debug Information

Enable debug logging to see token generation and usage patterns:

```bash
DEBUG=live-api:* npm start
```

## Security Considerations

1. **Token Storage**: Never store tokens in localStorage, use secure storage
2. **HTTPS Only**: Always use HTTPS for token requests
3. **Token Rotation**: Implement automatic token renewal
4. **Input Validation**: Validate all user inputs on client side
5. **Rate Limiting**: Respect server-side rate limits

## Future Enhancements

- Token refresh capabilities
- Enhanced monitoring and analytics
- Support for additional Gemini models
- Batch token generation for high-volume use cases
- Advanced security features (device fingerprinting, etc.)

---

For questions or issues, please refer to the main API documentation or contact support.