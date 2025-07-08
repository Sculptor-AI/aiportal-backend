import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Local Inference Service for running GGUF models locally
 * Uses llama.cpp for efficient CPU inference
 */
export class LocalInferenceService {
  constructor() {
    this.modelsPath = process.env.LOCAL_MODELS_PATH || './models';
    this.llamaCppPath = process.env.LLAMA_CPP_PATH || 'llama-server';
    this.runningServers = new Map(); // Track running model servers
    this.serverPorts = new Map(); // Track server ports
    this.basePort = 8081; // Starting port for local servers
  }

  /**
   * Check if a model is a local model
   */
  static isLocalModel(modelType) {
    return modelType.startsWith('local/') || modelType.startsWith('cal/');
  }

  /**
   * Check if local inference is available
   */
  async isAvailable() {
    try {
      const models = await this.getAvailableModels();
      return models.length > 0;
    } catch (error) {
      console.error('Error checking local model availability:', error);
      return false;
    }
  }

  /**
   * Get available local models
   */
  async getAvailableModels() {
    try {
      const modelsDir = path.resolve(this.modelsPath);
      if (!fs.existsSync(modelsDir)) {
        console.log('Models directory does not exist:', modelsDir);
        return [];
      }

      const models = [];
      const modelDirs = fs.readdirSync(modelsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const modelDir of modelDirs) {
        const modelPath = path.join(modelsDir, modelDir);
        const ggufFiles = fs.readdirSync(modelPath)
          .filter(file => file.endsWith('.gguf'));

        if (ggufFiles.length > 0) {
          const modelInfo = {
            name: modelDir,
            provider: 'local',
            source: 'local',
            modelPath: path.join(modelPath, ggufFiles[0]),
            capabilities: ['chat', 'text-generation'],
            isLocal: true
          };
          
          // Add model with both local/ and cal/ prefixes
          models.push({
            id: `local/${modelDir}`,
            ...modelInfo
          });
          models.push({
            id: `cal/${modelDir}`,
            ...modelInfo
          });
          
          console.log(`📁 Found local model: ${modelDir} at ${modelInfo.modelPath}`);
        }
      }

      return models;
    } catch (error) {
      console.error('Error getting local models:', error);
      return [];
    }
  }

  /**
   * Start a model server if not already running
   */
  async startModelServer(modelName) {
    const cleanModelName = modelName.replace(/^(local|cal)\//, '');
    
    // Check if we have a pre-configured server for this model
    if (process.env.LOCAL_MODEL_NAME === cleanModelName && process.env.LOCAL_MODEL_URL) {
      const url = new URL(process.env.LOCAL_MODEL_URL);
      const port = parseInt(url.port);
      
      // Test if the server is responding - use HTTP directly for local models
      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/models`);
        
        if (response.ok) {
          console.log(`Using pre-configured server for ${cleanModelName} on port ${port}`);
          this.runningServers.set(cleanModelName, true);
          this.serverPorts.set(cleanModelName, port);
          return port;
        }
      } catch (error) {
        console.log(`Pre-configured server for ${cleanModelName} not responding, will start new server`);
      }
    }
    
    if (this.runningServers.has(cleanModelName)) {
      return this.serverPorts.get(cleanModelName);
    }

    // Check if a server is already running on common ports (8081-8090)
    for (let port = 8081; port <= 8090; port++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/models`);
        if (response.ok) {
          console.log(`Found existing server for ${cleanModelName} on port ${port}`);
          this.runningServers.set(cleanModelName, true);
          this.serverPorts.set(cleanModelName, port);
          return port;
        }
      } catch (error) {
        // Continue checking other ports
      }
    }

    const models = await this.getAvailableModels();
    const model = models.find(m => m.name === cleanModelName);
    
    if (!model) {
      console.error(`Available models:`, models.map(m => m.name));
      throw new Error(`Model ${cleanModelName} not found. Available models: ${models.map(m => m.name).join(', ')}`);
    }

    const port = this.basePort + this.runningServers.size;
    
    return new Promise((resolve, reject) => {
      const serverProcess = spawn(this.llamaCppPath, [
        '-m', model.modelPath,
        '--port', port.toString(),
        '--host', '127.0.0.1',
        '-c', '4096', // Context length
        '-ngl', '0', // Number of GPU layers (0 for CPU only)
        '--log-disable' // Disable verbose logging
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          serverProcess.kill();
          reject(new Error(`Model server startup timeout for ${cleanModelName}`));
        }
      }, 30000); // 30 second timeout

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[${cleanModelName}] ${output}`);
        
        if (output.includes('HTTP server listening') || output.includes('listening on')) {
          serverReady = true;
          clearTimeout(timeout);
          this.runningServers.set(cleanModelName, serverProcess);
          this.serverPorts.set(cleanModelName, port);
          console.log(`Model server started for ${cleanModelName} on port ${port}`);
          resolve(port);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error(`[${cleanModelName}] Error: ${data}`);
      });

      serverProcess.on('exit', (code) => {
        console.log(`Model server for ${cleanModelName} exited with code ${code}`);
        this.runningServers.delete(cleanModelName);
        this.serverPorts.delete(cleanModelName);
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`Failed to start model server for ${cleanModelName}:`, error);
        reject(error);
      });
    });
  }

  /**
   * Process chat completion with local model (non-streaming)
   */
  async processChat(modelType, prompt, imageData = null, systemPrompt = null, messages = []) {
    try {
      const cleanModelName = modelType.replace(/^(local|cal)\//, '');
      const port = await this.startModelServer(modelType);
      
      // Build messages array for llama.cpp format
      const llamaMessages = [];
      
      if (systemPrompt) {
        llamaMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add conversation history
      if (messages && messages.length > 0) {
        llamaMessages.push(...messages);
      }

      llamaMessages.push({
        role: 'user',
        content: prompt
      });

      const payload = {
        messages: llamaMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: false
      };

      console.log(`Sending request to local model ${cleanModelName} on port ${port}`);
      
      // Use HTTP directly for local model connections
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Local model server error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Transform response to match OpenAI format
      return {
        id: `local-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelType,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: data.choices?.[0]?.message?.content || ''
          },
          finish_reason: data.choices?.[0]?.finish_reason || 'stop'
        }],
        usage: data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

    } catch (error) {
      console.error('Error in local model chat completion:', error);
      throw new Error(`Local model API error: ${error.message}`);
    }
  }

  /**
   * Process streaming chat completion with local model
   */
  async streamChat(modelType, prompt, imageData = null, systemPrompt = null, writeCallback, messages = []) {
    try {
      const cleanModelName = modelType.replace(/^(local|cal)\//, '');
      const port = await this.startModelServer(modelType);
      
      // Build messages array
      const llamaMessages = [];
      
      if (systemPrompt) {
        llamaMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add conversation history
      if (messages && messages.length > 0) {
        llamaMessages.push(...messages);
      }

      llamaMessages.push({
        role: 'user',
        content: prompt
      });

      const payload = {
        messages: llamaMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true
      };

      console.log(`Sending streaming request to local model ${cleanModelName} on port ${port}`);
      
      // Use HTTP directly for local model connections
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Local model server error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              writeCallback('data: [DONE]\n\n');
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Only send chunks that have actual content
              const content = parsed.choices?.[0]?.delta?.content;
              if (content !== undefined && content !== null) {
                // Transform to OpenAI streaming format if needed
                const streamChunk = {
                  id: `local-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: modelType,
                  choices: [{
                    index: 0,
                    delta: {
                      content: content
                    },
                    finish_reason: parsed.choices?.[0]?.finish_reason || null
                  }]
                };
                
                writeCallback(`data: ${JSON.stringify(streamChunk)}\n\n`);
              }
              
              // Send finish reason if present but no content
              if (parsed.choices?.[0]?.finish_reason && !content) {
                const streamChunk = {
                  id: `local-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: modelType,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: parsed.choices[0].finish_reason
                  }]
                };
                
                writeCallback(`data: ${JSON.stringify(streamChunk)}\n\n`);
              }
            } catch (parseError) {
              console.error('Error parsing local model stream chunk:', parseError);
              console.error('Raw data that failed to parse:', data);
            }
          }
        }
      }

      writeCallback('data: [DONE]\n\n');

    } catch (error) {
      console.error('Error in local model streaming:', error);
      writeCallback(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      writeCallback('data: [DONE]\n\n');
    }
  }

  /**
   * Stop a model server
   */
  async stopModelServer(modelName) {
    const cleanModelName = modelName.replace(/^(local|cal)\//, '');
    const serverProcess = this.runningServers.get(cleanModelName);
    
    if (serverProcess) {
      serverProcess.kill();
      this.runningServers.delete(cleanModelName);
      this.serverPorts.delete(cleanModelName);
      console.log(`Stopped model server for ${cleanModelName}`);
    }
  }

  /**
   * Stop all model servers
   */
  async stopAllServers() {
    for (const [modelName, serverProcess] of this.runningServers) {
      serverProcess.kill();
      console.log(`Stopped model server for ${modelName}`);
    }
    this.runningServers.clear();
    this.serverPorts.clear();
  }

  /**
   * Check if local inference is available
   */
  async isAvailable() {
    try {
      // Check if llama-server is available
      const testProcess = spawn(this.llamaCppPath, ['--help'], { stdio: 'pipe' });
      return new Promise((resolve) => {
        testProcess.on('exit', (code) => {
          resolve(code === 0);
        });
        testProcess.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }
}

// Export functions for backward compatibility
export const isLocalModel = (modelType) => {
  return LocalInferenceService.isLocalModel(modelType);
};

export const processLocalChat = async (modelType, prompt, imageData, systemPrompt, messages) => {
  const service = new LocalInferenceService();
  return await service.processChat(modelType, prompt, imageData, systemPrompt, messages);
};

export const streamLocalChat = async (modelType, prompt, imageData, systemPrompt, writeCallback, messages) => {
  const service = new LocalInferenceService();
  return await service.streamChat(modelType, prompt, imageData, systemPrompt, writeCallback, messages);
};