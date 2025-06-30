#!/usr/bin/env node

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

async function findAvailablePort(startPort = 3000) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      await execAsync(`lsof -ti:${port}`);
      // Port is in use, try next one
    } catch (error) {
      // Port is available
      return port;
    }
  }
  throw new Error('No available ports found');
}

async function startServer() {
  try {
    console.log('🚀 Starting AI Portal Backend...');
    
    // Find an available port
    const port = await findAvailablePort(3000);
    console.log(`📡 Using port ${port}`);
    
    // Set environment variables
    process.env.PORT = port;
    
    // Start the server
    const serverProcess = spawn('node', ['server.js'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: port }
    });
    
    serverProcess.on('error', (err) => {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    });
    
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        process.exit(code);
      }
    });
    
    // Handle shutdown gracefully
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down server...');
      serverProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down server...');
      serverProcess.kill('SIGTERM');
    });
    
  } catch (error) {
    console.error('❌ Error starting server:', error.message);
    process.exit(1);
  }
}

startServer();