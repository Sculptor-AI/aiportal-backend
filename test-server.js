#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('🧪 Testing AI Portal Backend...\n');

// Start server
console.log('1. Starting server...');
const serverProcess = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: 3002 },
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverOutput = '';
serverProcess.stdout.on('data', (data) => {
  serverOutput += data.toString();
  process.stdout.write(data);
});

serverProcess.stderr.on('data', (data) => {
  serverOutput += data.toString();
  process.stderr.write(data);
});

// Wait for server to start
await setTimeout(3000);

try {
  // Test 1: Health check
  console.log('\n2. Testing health endpoint...');
  const healthTest = spawn('curl', ['-s', 'http://localhost:3002/health']);
  
  let healthOutput = '';
  healthTest.stdout.on('data', (data) => {
    healthOutput += data.toString();
  });
  
  await new Promise((resolve) => {
    healthTest.on('close', (code) => {
      if (code === 0 && healthOutput.includes('OK')) {
        console.log('✅ Health check passed');
      } else {
        console.log('❌ Health check failed');
      }
      resolve();
    });
  });

  // Test 2: Registration
  console.log('\n3. Testing user registration...');
  const registerTest = spawn('curl', [
    '-s', '-X', 'POST', 
    'http://localhost:3002/api/auth/register',
    '-H', 'Content-Type: application/json',
    '-d', '{"username":"testuser","password":"Test123!","email":"test@test.com"}'
  ]);
  
  let registerOutput = '';
  registerTest.stdout.on('data', (data) => {
    registerOutput += data.toString();
  });
  
  await new Promise((resolve) => {
    registerTest.on('close', (code) => {
      if (registerOutput.includes('success')) {
        console.log('✅ User registration passed');
      } else {
        console.log('❌ User registration failed:', registerOutput);
      }
      resolve();
    });
  });

  console.log('\n🎉 Basic tests completed!');
  console.log('\n📋 Next steps:');
  console.log('   1. Register a user: POST /api/auth/register');
  console.log('   2. Login: POST /api/auth/login');
  console.log('   3. Generate API key: POST /api/auth/api-keys');
  console.log('   4. Test chat: POST /api/v1/chat/completions');
  console.log('\n📖 See SETUP_GUIDE.md for detailed instructions');

} catch (error) {
  console.error('❌ Test failed:', error);
} finally {
  // Cleanup
  console.log('\n🛑 Stopping test server...');
  serverProcess.kill('SIGTERM');
  process.exit(0);
}