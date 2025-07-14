/**
 * Example client implementation for Live API v2
 * 
 * This example shows how to:
 * 1. Generate an ephemeral token
 * 2. Connect directly to Gemini Live API
 * 3. Send and receive messages
 * 4. Handle errors and token expiration
 */

import { GoogleGenAI, Modality } from '@google/genai';

class LiveAPIClient {
  constructor(serverUrl, userToken) {
    this.serverUrl = serverUrl;
    this.userToken = userToken;
    this.ephemeralToken = null;
    this.tokenExpiry = null;
    this.session = null;
  }

  /**
   * Generate ephemeral token for Live API access
   */
  async generateToken(options = {}) {
    try {
      const response = await fetch(`${this.serverUrl}/api/v1/live-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model || 'gemini-2.0-flash-live-001',
          responseModality: options.responseModality || 'TEXT',
          duration: options.duration || 30,
          systemInstruction: options.systemInstruction,
          temperature: options.temperature || 1.0
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Token generation failed: ${error.error}`);
      }

      const result = await response.json();
      
      this.ephemeralToken = result.token;
      this.tokenExpiry = new Date(result.expiresAt);
      
      console.log('✅ Ephemeral token generated successfully');
      console.log(`   Expires at: ${result.expiresAt}`);
      console.log(`   Usage: ${result.usage.tokensLastHour}/${result.usage.limits.tokensPerHour} tokens this hour`);
      
      return result;
    } catch (error) {
      console.error('❌ Token generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if token is valid and not expired
   */
  isTokenValid() {
    return this.ephemeralToken && 
           this.tokenExpiry && 
           new Date() < this.tokenExpiry;
  }

  /**
   * Connect to Gemini Live API
   */
  async connect(options = {}) {
    try {
      // Generate token if needed
      if (!this.isTokenValid()) {
        await this.generateToken(options);
      }

      // Create AI client with ephemeral token
      const ai = new GoogleGenAI({
        apiKey: this.ephemeralToken
      });

      // Connect to Live API
      this.session = await ai.live.connect({
        model: options.model || 'gemini-2.0-flash-live-001',
        config: {
          responseModalities: [options.responseModality === 'AUDIO' ? Modality.AUDIO : Modality.TEXT],
          systemInstruction: options.systemInstruction
        },
        callbacks: {
          onopen: () => {
            console.log('🔗 Connected to Gemini Live API');
            if (options.onopen) options.onopen();
          },
          onmessage: (message) => {
            console.log('📨 Received message:', message);
            if (options.onmessage) options.onmessage(message);
          },
          onerror: (error) => {
            console.error('❌ Live API error:', error);
            if (options.onerror) options.onerror(error);
          },
          onclose: (event) => {
            console.log('🔌 Connection closed:', event.reason);
            if (options.onclose) options.onclose(event);
          }
        }
      });

      return this.session;
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(text) {
    if (!this.session) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      this.session.sendClientContent({
        turns: text
      });
      console.log('📤 Sent message:', text);
    } catch (error) {
      console.error('❌ Failed to send message:', error.message);
      throw error;
    }
  }

  /**
   * Send audio data
   */
  async sendAudio(audioData, mimeType = 'audio/pcm;rate=16000') {
    if (!this.session) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      this.session.sendRealtimeInput({
        audio: {
          data: audioData,
          mimeType: mimeType
        }
      });
      console.log('🎤 Sent audio data');
    } catch (error) {
      console.error('❌ Failed to send audio:', error.message);
      throw error;
    }
  }

  /**
   * Get token usage statistics
   */
  async getUsage() {
    try {
      const response = await fetch(`${this.serverUrl}/api/v1/live-token/usage`, {
        headers: {
          'Authorization': `Bearer ${this.userToken}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Usage request failed: ${error.error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Failed to get usage:', error.message);
      throw error;
    }
  }

  /**
   * Close connection
   */
  close() {
    if (this.session) {
      this.session.close();
      this.session = null;
      console.log('🔌 Connection closed');
    }
  }

  /**
   * Auto-renewal for long-running sessions
   */
  async enableAutoRenewal(options = {}) {
    const checkInterval = options.checkInterval || 5 * 60 * 1000; // 5 minutes
    const renewalBuffer = options.renewalBuffer || 5 * 60 * 1000; // 5 minutes before expiry

    setInterval(async () => {
      if (this.tokenExpiry && this.session) {
        const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
        
        if (timeUntilExpiry < renewalBuffer) {
          console.log('🔄 Auto-renewing token...');
          try {
            await this.generateToken(options);
            console.log('✅ Token renewed successfully');
          } catch (error) {
            console.error('❌ Token renewal failed:', error.message);
          }
        }
      }
    }, checkInterval);
  }
}

// Example usage
async function example() {
  const client = new LiveAPIClient('http://localhost:3000', 'your-user-token');

  try {
    // Connect with text responses
    await client.connect({
      model: 'gemini-2.0-flash-live-001',
      responseModality: 'TEXT',
      systemInstruction: 'You are a helpful assistant. Be concise.',
      onmessage: (message) => {
        if (message.text) {
          console.log('AI Response:', message.text);
        }
      }
    });

    // Enable auto-renewal for long sessions
    await client.enableAutoRenewal();

    // Send messages
    await client.sendMessage('Hello, how are you?');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await client.sendMessage('What is the weather like?');
    
    // Check usage
    const usage = await client.getUsage();
    console.log('Token Usage:', usage);

  } catch (error) {
    console.error('Example failed:', error.message);
  } finally {
    client.close();
  }
}

// Audio example
async function audioExample() {
  const client = new LiveAPIClient('http://localhost:3000', 'your-user-token');

  try {
    // Connect with audio responses
    await client.connect({
      model: 'gemini-2.0-flash-live-001',
      responseModality: 'AUDIO',
      onmessage: (message) => {
        if (message.data) {
          console.log('Received audio data');
          // Process audio data here
        }
      }
    });

    // Send text message, get audio response
    await client.sendMessage('Please tell me a joke');

    // You can also send audio input
    // const audioBuffer = ... // your audio data as base64
    // await client.sendAudio(audioBuffer);

  } catch (error) {
    console.error('Audio example failed:', error.message);
  } finally {
    client.close();
  }
}

// Rate limiting example
async function rateLimitExample() {
  const client = new LiveAPIClient('http://localhost:3000', 'your-user-token');

  try {
    // Try to generate many tokens quickly (will hit rate limit)
    for (let i = 0; i < 20; i++) {
      try {
        await client.generateToken();
        console.log(`Token ${i + 1} generated successfully`);
      } catch (error) {
        if (error.message.includes('Rate limit exceeded')) {
          console.log(`Rate limit hit at token ${i + 1}`);
          break;
        }
        throw error;
      }
    }

    // Check usage after rate limiting
    const usage = await client.getUsage();
    console.log('Final usage:', usage);

  } catch (error) {
    console.error('Rate limit example failed:', error.message);
  }
}

// Export for use in other files
export { LiveAPIClient };

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Live API v2 examples...');
  
  // Uncomment to run examples
  // await example();
  // await audioExample();
  // await rateLimitExample();
}