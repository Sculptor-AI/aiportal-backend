#!/usr/bin/env node

/**
 * Standalone streaming test for AI Portal Backend
 * Tests streaming chat with Gemini 2.5 Flash
 */

// Node 18+ has built-in fetch

const API_BASE = 'http://192.168.1.85:3000';
const API_KEY = 'ak_2156e9306161e1c00b64688d4736bf00aecddd486f2a838c44a6e40144b52c19'; // Replace with your actual API key

// Test configuration
const TEST_CONFIG = {
  model: 'google/gemini-2.5-flash',
  messages: [
    {
      role: 'user',
      content: 'Count from 1 to 10, explaining each number briefly as you go. Take your time and be descriptive.'
    }
  ],
  stream: true,
  temperature: 0.7
};

async function testStreaming() {
  console.log('🚀 Testing AI Portal Backend Streaming...\n');
  console.log(`📡 API Base: ${API_BASE}`);
  console.log(`🤖 Model: ${TEST_CONFIG.model}`);
  console.log(`💬 Prompt: "${TEST_CONFIG.messages[0].content}"\n`);
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(TEST_CONFIG)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    console.log('✅ Connection established. Streaming response:\n');
    console.log('─'.repeat(60));

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('\n' + '─'.repeat(60));
        console.log('🏁 Stream completed!');
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            console.log('\n✅ Stream finished normally');
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            
            // Handle different streaming formats
            if (parsed.choices && parsed.choices[0]) {
              const delta = parsed.choices[0].delta;
              if (delta && delta.content) {
                process.stdout.write(delta.content);
                fullResponse += delta.content;
              }
            } else if (parsed.error) {
              console.error('\n❌ Stream error:', parsed.error);
            }
          } catch (parseError) {
            // Ignore parsing errors for malformed chunks
            console.error('\n⚠️  Parse error:', parseError.message);
          }
        }
      }
    }

    console.log('\n📊 Stream Summary:');
    console.log(`📝 Total characters received: ${fullResponse.length}`);
    console.log(`🔤 Total words: ${fullResponse.split(' ').length}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('1. Make sure the server is running: npm start');
      console.log('2. Check the server is on port 3000');
      console.log('3. Verify your API key is correct');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.log('\n💡 Authentication issue:');
      console.log('1. Update API_KEY in this file with your real API key');
      console.log('2. Make sure you have registered a user and generated an API key');
      console.log('3. Check the API key starts with "ak_"');
    } else if (error.message.includes('rate limit')) {
      console.log('\n💡 Rate limit hit - wait a moment and try again');
    }
  }
}

async function testNonStreaming() {
  console.log('\n🔄 Testing non-streaming response for comparison...\n');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        ...TEST_CONFIG,
        stream: false,
        messages: [{ role: 'user', content: 'Say hello and tell me the current time.' }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    console.log('📦 Non-streaming response:');
    console.log('─'.repeat(40));
    console.log(data.choices[0].message.content);
    console.log('─'.repeat(40));
    console.log('✅ Non-streaming test completed');

  } catch (error) {
    console.error('❌ Non-streaming test failed:', error.message);
  }
}

// Health check first
async function healthCheck() {
  console.log('🔍 Checking server health...');
  
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    if (data.status === 'OK') {
      console.log('✅ Server is healthy\n');
      return true;
    } else {
      console.log('⚠️  Server health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Cannot connect to server:', error.message);
    console.log('💡 Make sure the server is running with: npm start\n');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🧪 AI Portal Backend - Streaming Test\n');
  
  // Check if API key is set
  if (API_KEY === 'your_api_key_here') {
    console.log('⚠️  Please update the API_KEY variable in this file with your actual API key!');
    console.log('📝 You can get an API key by:');
    console.log('1. Register: POST /api/auth/register');
    console.log('2. Login: POST /api/auth/login');
    console.log('3. Generate key: POST /api/auth/api-keys\n');
    process.exit(1);
  }

  // Health check
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    process.exit(1);
  }

  // Run tests
  await testStreaming();
  await testStreaming(); // Test twice to check consistency
  await testNonStreaming();
  
  console.log('\n🎉 All tests completed!');
}

// Handle errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { testStreaming, testNonStreaming, healthCheck };