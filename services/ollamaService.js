import axios from 'axios';
import modelConfigService from './modelConfigService.js';

/**
 * Ollama Service for local model inference
 */
export class OllamaService {
  constructor() {
    // Prefer HTTPS but fall back to HTTP if not available
    this.baseURL = process.env.OLLAMA_BASE_URL || 'https://localhost:11434';
    this.fallbackURL = 'http://localhost:11434';
  }

  /**
   * Check if a model is an Ollama model (locally hosted)
   */
  static isOllamaModel(modelType) {
    return modelType.startsWith('ollama/');
  }

  /**
   * Get list of available local models
   */
  async getAvailableModels() {
    try {
      let response;
      try {
        response = await axios.get(`${this.baseURL}/api/tags`);
      } catch (httpsError) {
        console.warn('⚠️  HTTPS connection to Ollama failed, falling back to HTTP');
        response = await axios.get(`${this.fallbackURL}/api/tags`);
      }
      return response.data.models || [];
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      return [];
    }
  }

  /**
   * Process chat completion with Ollama (non-streaming)
   */
  async processChat(modelType, prompt, imageData = null, systemPrompt = null, messages = []) {
    try {
      // Extract model name (remove ollama/ or local/ prefix)
      const modelName = modelType.replace(/^(ollama\/|local\/)/, '');
      
      // Build messages array
      const ollamaMessages = [];
      
      if (systemPrompt) {
        ollamaMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add conversation history
      if (messages && messages.length > 0) {
        ollamaMessages.push(...messages);
      }

      // Handle image data for multimodal models
      let userMessage;
      if (imageData && imageData.data) {
        userMessage = {
          role: 'user',
          content: prompt,
          images: [imageData.data] // Ollama expects base64 image data in images array
        };
      } else {
        userMessage = {
          role: 'user',
          content: prompt
        };
      }

      ollamaMessages.push(userMessage);

      const payload = {
        model: modelName,
        messages: ollamaMessages,
        stream: false
      };
      
      // Add tools if available for this model
      const availableTools = modelConfigService.getToolsForModel(modelType);
      console.log(`🔧 Ollama Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
      
      if (availableTools && availableTools.length > 0) {
        payload.tools = availableTools.map(tool => ({
          type: 'function',
          function: {
            name: tool.id,
            description: tool.description,
            parameters: tool.parameters
          }
        }));
        console.log(`🔧 Ollama Service: Added ${payload.tools.length} tools to request for model ${modelType}`);
      }

      console.log(`Sending request to Ollama: ${this.baseURL}/api/chat`);
      
      // Try HTTPS first, then fall back to HTTP
      let response;
      try {
        response = await axios.post(`${this.baseURL}/api/chat`, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 300000 // 5 minute timeout for local models
        });
      } catch (httpsError) {
        console.warn('⚠️  HTTPS connection to Ollama failed, falling back to HTTP');
        response = await axios.post(`${this.fallbackURL}/api/chat`, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 300000 // 5 minute timeout for local models
        });
      }

      // Check for tool calls and execute them with logging (when Ollama supports it)
      if (response.data.message?.tool_calls && response.data.message.tool_calls.length > 0) {
        const toolCalls = response.data.message.tool_calls;
        
        // Log summary of tool calls detected
        console.log(`\n🎯 DETECTED ${toolCalls.length} TOOL CALL${toolCalls.length > 1 ? 'S' : ''}:`);
        toolCalls.forEach((tc, i) => {
          console.log(`  ${i + 1}. ${tc.function?.name || 'Unknown'}`);
        });
        console.log('═════════════════════════════════════════');
        
        const toolResults = [];
        
        for (const toolCall of toolCalls) {
          if (toolCall.function && toolCall.function.name) {
            try {
              // Log tool execution details to console
              console.log(`\n🔧 TOOL CALL: ${toolCall.function.name}`);
              const parameters = JSON.parse(toolCall.function.arguments || '{}');
              console.log(`📝 Parameters:`, JSON.stringify(parameters, null, 2));
              
              const toolsService = await import('./toolsService.js');
              const result = await toolsService.default.executeTool(
                toolCall.function.name, 
                parameters, 
                modelType
              );
              
              console.log(`✅ Result:`, typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
              console.log(`─────────────────────────────────────────\n`);
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify(result)
              });
            } catch (error) {
              const parameters = JSON.parse(toolCall.function.arguments || '{}');
              console.log(`❌ TOOL ERROR: ${toolCall.function.name}`);
              console.log(`📝 Parameters:`, JSON.stringify(parameters, null, 2));
              console.log(`💥 Error:`, error.message);
              console.log(`─────────────────────────────────────────\n`);
              
              console.error(`Error executing tool ${toolCall.function.name}:`, error);
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify({ error: error.message })
              });
            }
          }
        }
        
        // If we have tool results, make another API call with the results
        if (toolResults.length > 0) {
          const messagesWithResults = [
            ...ollamaMessages,
            {
              role: 'assistant',
              content: null,
              tool_calls: toolCalls
            },
            ...toolResults
          ];
          
          const followUpPayload = {
            ...payload,
            messages: messagesWithResults,
            tools: undefined // Remove tools from follow-up to prevent loops
          };
          
          let followUpResponse;
          try {
            followUpResponse = await axios.post(`${this.baseURL}/api/chat`, followUpPayload, {
              headers: {
                'Content-Type': 'application/json'
              },
              timeout: 300000
            });
          } catch (httpsError) {
            console.warn('⚠️  HTTPS connection to Ollama failed, falling back to HTTP');
            followUpResponse = await axios.post(`${this.fallbackURL}/api/chat`, followUpPayload, {
              headers: {
                'Content-Type': 'application/json'
              },
              timeout: 300000
            });
          }
          
          // Return the follow-up response
          return {
            id: `ollama-follow-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelType,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: followUpResponse.data.message?.content || ''
              },
              finish_reason: followUpResponse.data.done ? 'stop' : null
            }],
            usage: {
              prompt_tokens: (response.data.prompt_eval_count || 0) + (followUpResponse.data.prompt_eval_count || 0),
              completion_tokens: (response.data.eval_count || 0) + (followUpResponse.data.eval_count || 0),
              total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0) + (followUpResponse.data.prompt_eval_count || 0) + (followUpResponse.data.eval_count || 0)
            }
          };
        }
      }

      // Transform Ollama response to match OpenAI format
      return {
        id: `ollama-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelType,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response.data.message?.content || ''
          },
          finish_reason: response.data.done ? 'stop' : null
        }],
        usage: {
          prompt_tokens: response.data.prompt_eval_count || 0,
          completion_tokens: response.data.eval_count || 0,
          total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
        }
      };

    } catch (error) {
      console.error('Error in Ollama chat completion:', error);
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  /**
   * Process streaming chat completion with Ollama
   */
  async streamChat(modelType, prompt, imageData = null, systemPrompt = null, writeCallback, messages = []) {
    try {
      // Extract model name (remove ollama/ or local/ prefix)
      const modelName = modelType.replace(/^(ollama\/|local\/)/, '');
      
      // Build messages array
      const ollamaMessages = [];
      
      if (systemPrompt) {
        ollamaMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add conversation history
      if (messages && messages.length > 0) {
        ollamaMessages.push(...messages);
      }

      // Handle image data for multimodal models
      let userMessage;
      if (imageData && imageData.data) {
        userMessage = {
          role: 'user',
          content: prompt,
          images: [imageData.data] // Ollama expects base64 image data in images array
        };
      } else {
        userMessage = {
          role: 'user',
          content: prompt
        };
      }

      ollamaMessages.push(userMessage);

      const payload = {
        model: modelName,
        messages: ollamaMessages,
        stream: true
      };
      
      // Add tools if available for this model
      const availableTools = modelConfigService.getToolsForModel(modelType);
      console.log(`🔧 Ollama Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
      
      if (availableTools && availableTools.length > 0) {
        payload.tools = availableTools.map(tool => ({
          type: 'function',
          function: {
            name: tool.id,
            description: tool.description,
            parameters: tool.parameters
          }
        }));
        console.log(`🔧 Ollama Service: Added ${payload.tools.length} tools to request for model ${modelType}`);
      }

      console.log(`Sending streaming request to Ollama: ${this.baseURL}/api/chat`);
      
      // Try HTTPS first, then fall back to HTTP
      let response;
      try {
        response = await axios.post(`${this.baseURL}/api/chat`, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 300000 // 5 minute timeout for local models
        });
      } catch (httpsError) {
        console.warn('⚠️  HTTPS connection to Ollama failed, falling back to HTTP');
        response = await axios.post(`${this.fallbackURL}/api/chat`, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 300000 // 5 minute timeout for local models
        });
      }

      // Process the streaming response
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.message && data.message.content) {
              // Transform to OpenAI streaming format
              const streamChunk = {
                id: `ollama-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelType,
                choices: [{
                  index: 0,
                  delta: {
                    content: data.message.content
                  },
                  finish_reason: data.done ? 'stop' : null
                }]
              };
              
              writeCallback(`data: ${JSON.stringify(streamChunk)}\n\n`);
            }
            
            if (data.done) {
              writeCallback('data: [DONE]\n\n');
            }
          } catch (parseError) {
            console.error('Error parsing Ollama stream chunk:', parseError);
          }
        }
      });

      response.data.on('end', () => {
        console.log('Ollama stream ended');
      });

      response.data.on('error', (error) => {
        console.error('Ollama stream error:', error);
        writeCallback(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        writeCallback('data: [DONE]\n\n');
      });

    } catch (error) {
      console.error('Error in Ollama streaming:', error);
      writeCallback(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      writeCallback('data: [DONE]\n\n');
    }
  }

  /**
   * Pull a model to Ollama (download if not available)
   */
  async pullModel(modelName) {
    try {
      const payload = { name: modelName };
      
      // Try HTTPS first, then fall back to HTTP
      let response;
      try {
        response = await axios.post(`${this.baseURL}/api/pull`, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 600000 // 10 minute timeout for model downloads
        });
      } catch (httpsError) {
        console.warn('⚠️  HTTPS connection to Ollama failed, falling back to HTTP');
        response = await axios.post(`${this.fallbackURL}/api/pull`, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 600000 // 10 minute timeout for model downloads
        });
      }

      return response.data;
    } catch (error) {
      console.error('Error pulling Ollama model:', error);
      throw new Error(`Failed to pull model ${modelName}: ${error.message}`);
    }
  }

  /**
   * Check if Ollama server is running
   */
  async isServerRunning() {
    try {
      // Try HTTPS first, then fall back to HTTP
      try {
        await axios.get(`${this.baseURL}/api/tags`, { timeout: 5000 });
        return true;
      } catch (httpsError) {
        await axios.get(`${this.fallbackURL}/api/tags`, { timeout: 5000 });
        return true;
      }
    } catch (error) {
      return false;
    }
  }
}

// Export functions for backward compatibility
export const isOllamaModel = (modelType) => {
  return OllamaService.isOllamaModel(modelType);
};

export const processOllamaChat = async (modelType, prompt, imageData, systemPrompt, messages) => {
  const service = new OllamaService();
  return await service.processChat(modelType, prompt, imageData, systemPrompt, messages);
};

export const streamOllamaChat = async (modelType, prompt, imageData, systemPrompt, writeCallback, messages) => {
  const service = new OllamaService();
  return await service.streamChat(modelType, prompt, imageData, systemPrompt, writeCallback, messages);
};