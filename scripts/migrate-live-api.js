#!/usr/bin/env node

/**
 * Migration script for Live API v1 to v2
 * 
 * This script helps users understand the changes needed to migrate
 * from the old WebSocket-based Live API to the new ephemeral token system.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LiveAPIMigrationHelper {
  constructor() {
    this.changes = [];
    this.warnings = [];
    this.info = [];
  }

  /**
   * Analyze code for Live API v1 usage
   */
  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        
        // Check for WebSocket usage
        if (line.includes('/ws/live-audio')) {
          this.changes.push({
            file: filePath,
            line: lineNumber,
            type: 'websocket',
            old: line.trim(),
            new: 'Use /api/v1/live-token to get ephemeral token, then connect directly to Gemini'
          });
        }

        // Check for old API endpoints
        if (line.includes('/api/v1/live-audio/')) {
          this.changes.push({
            file: filePath,
            line: lineNumber,
            type: 'endpoint',
            old: line.trim(),
            new: 'Replace with /api/v1/live-token endpoint'
          });
        }

        // Check for session management
        if (line.includes('session_id') || line.includes('sessionId')) {
          this.warnings.push({
            file: filePath,
            line: lineNumber,
            message: 'Session management is no longer needed in v2'
          });
        }

        // Check for audio processing
        if (line.includes('audio_data') || line.includes('audioData')) {
          this.info.push({
            file: filePath,
            line: lineNumber,
            message: 'Audio processing now handled directly by Gemini Live API'
          });
        }
      });
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error.message);
    }
  }

  /**
   * Scan directory for JavaScript/TypeScript files
   */
  scanDirectory(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.scanDirectory(fullPath);
        } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
          this.analyzeFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Generate migration report
   */
  generateReport() {
    console.log('🔄 Live API v1 to v2 Migration Report');
    console.log('=====================================\n');

    if (this.changes.length === 0 && this.warnings.length === 0 && this.info.length === 0) {
      console.log('✅ No Live API v1 usage detected in your code.');
      console.log('   You can start using the new Live API v2 right away!\n');
      this.showV2Usage();
      return;
    }

    // Show required changes
    if (this.changes.length > 0) {
      console.log('🚨 REQUIRED CHANGES:');
      console.log('===================');
      
      this.changes.forEach((change, index) => {
        console.log(`${index + 1}. ${change.file}:${change.line}`);
        console.log(`   OLD: ${change.old}`);
        console.log(`   NEW: ${change.new}\n`);
      });
    }

    // Show warnings
    if (this.warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      console.log('============');
      
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.file}:${warning.line}`);
        console.log(`   ${warning.message}\n`);
      });
    }

    // Show info
    if (this.info.length > 0) {
      console.log('ℹ️  INFO:');
      console.log('========');
      
      this.info.forEach((info, index) => {
        console.log(`${index + 1}. ${info.file}:${info.line}`);
        console.log(`   ${info.message}\n`);
      });
    }

    this.showV2Usage();
  }

  /**
   * Show Live API v2 usage examples
   */
  showV2Usage() {
    console.log('📚 Live API v2 Usage:');
    console.log('=====================');
    
    console.log(`
1. Generate ephemeral token:
   POST /api/v1/live-token
   {
     "model": "gemini-2.0-flash-live-001",
     "responseModality": "TEXT",
     "duration": 30
   }

2. Connect directly to Gemini:
   import { GoogleGenAI } from '@google/genai';
   
   const ai = new GoogleGenAI({ apiKey: ephemeralToken });
   const session = await ai.live.connect({
     model: 'gemini-2.0-flash-live-001',
     config: { responseModalities: ['TEXT'] }
   });

3. Send messages:
   session.sendClientContent({ turns: 'Hello!' });

📖 Full documentation: docs/LIVE_API_V2.md
🔧 Example client: examples/live-api-client.js
`);
  }

  /**
   * Show configuration changes
   */
  showConfigChanges() {
    console.log('⚙️  Configuration Changes:');
    console.log('=========================');
    
    console.log(`
Add these to your .env file:

# Live API v2 Configuration
LIVE_API_TOKEN_DURATION_MINUTES=30
LIVE_API_MAX_TOKEN_DURATION_MINUTES=60
LIVE_API_SESSION_START_WINDOW_MINUTES=2
LIVE_API_MAX_TOKENS_PER_HOUR=10
LIVE_API_MAX_TOKENS_PER_DAY=100
LIVE_API_COOLDOWN_PERIOD_MINUTES=5
LIVE_API_DEFAULT_MODEL=gemini-2.0-flash-live-001
LIVE_API_ALLOWED_MODELS=gemini-2.0-flash-live-001,gemini-live-2.5-flash-preview
LIVE_API_ALLOW_CUSTOM_INSTRUCTIONS=false
LIVE_API_DEFAULT_SYSTEM_INSTRUCTION=You are a helpful assistant.

Old Live Audio v1 configuration (LIVE_AUDIO_*) can be removed.
`);
  }
}

// Main execution
async function main() {
  const helper = new LiveAPIMigrationHelper();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/migrate-live-api.js <directory>');
    console.log('Example: node scripts/migrate-live-api.js ./src');
    process.exit(1);
  }

  const targetDir = args[0];
  
  if (!fs.existsSync(targetDir)) {
    console.error(`Directory ${targetDir} does not exist`);
    process.exit(1);
  }

  console.log(`🔍 Scanning ${targetDir} for Live API v1 usage...\n`);
  
  helper.scanDirectory(targetDir);
  helper.generateReport();
  helper.showConfigChanges();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { LiveAPIMigrationHelper };