import axios from 'axios';
import { formatResponsePacket } from '../utils/formatters.js';
import { isGeminiModel, processGeminiChat, streamGeminiChat } from '../services/geminiService.js';
import { isAnthropicModel, processAnthropicChat, streamAnthropicChat } from '../services/anthropicService.js';
import { isOpenAIModel, processOpenAIChat, streamOpenAIChat, streamOpenAICompatibleChat, processOpenAICompatibleChat } from '../services/openaiService.js';
import { isOllamaModel, processOllamaChat, streamOllamaChat } from '../services/ollamaService.js';
import { isLocalModel, processLocalChat, streamLocalChat } from '../services/localInferenceService.js';
import modelConfigService from '../services/modelConfigService.js';
import toolsService from '../services/toolsService.js';
import systemPromptService from '../services/systemPromptService.js';

/**
 * Enhanced tool call manager for handling multiple concurrent tool calls
 */
class ToolCallManager {
  constructor() {
    this.activeCalls = new Map();
    this.callQueue = [];
    this.maxConcurrentCalls = 3;
  }

  /**
   * Process a tool call with enhanced state management
   * @param {Object} toolCall - Tool call object
   * @param {string} modelType - Model type
   * @param {Function} writeStream - Function to write to stream
   */
  async processToolCall(toolCall, modelType, writeStream) {
    const { id, function: func } = toolCall;
    const toolName = func.name;
    const callId = id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Send tool call start event
    writeStream(`data: ${JSON.stringify({
      type: 'tool_call_start',
      tool_id: callId,
      tool_name: toolName,
      status: 'pending',
      timestamp: new Date().toISOString(),
      parameters: func.arguments ? JSON.parse(func.arguments || '{}') : {}
    })}\n\n`);
    
    // Add to active calls
    this.activeCalls.set(callId, {
      id: callId,
      name: toolName,
      status: 'pending',
      startTime: Date.now()
    });
    
    try {
      // Send execution start event
      writeStream(`data: ${JSON.stringify({
        type: 'tool_call_executing',
        tool_id: callId,
        tool_name: toolName,
        status: 'executing',
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      // Update status
      this.activeCalls.get(callId).status = 'executing';
      
      // Execute tool
      const parameters = JSON.parse(func.arguments || '{}');
      const result = await toolsService.executeTool(toolName, parameters, modelType);
      
      // Calculate execution time
      const executionTime = Date.now() - this.activeCalls.get(callId).startTime;
      
      // Send completion event
      writeStream(`data: ${JSON.stringify({
        type: 'tool_call_completed',
        tool_id: callId,
        tool_name: toolName,
        status: 'completed',
        result: result,
        execution_time: executionTime,
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      // Update and remove from active calls
      this.activeCalls.delete(callId);
      
    } catch (error) {
      const executionTime = Date.now() - this.activeCalls.get(callId).startTime;
      
      // Send error event
      writeStream(`data: ${JSON.stringify({
        type: 'tool_call_error',
        tool_id: callId,
        tool_name: toolName,
        status: 'error',
        error: error.message,
        execution_time: executionTime,
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      // Remove from active calls
      this.activeCalls.delete(callId);
    }
  }

  /**
   * Send tool call summary
   * @param {Function} writeStream - Function to write to stream
   */
  sendToolCallSummary(writeStream) {
    const summary = Array.from(this.activeCalls.values());
    if (summary.length > 0) {
      writeStream(`data: ${JSON.stringify({
        type: 'tool_calls_summary',
        active_calls: summary,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }
  }
}

/**
 * Handle tool calls in streaming response with enhanced multi-call support
 * @param {string} chunk - Response chunk
 * @param {string} modelType - Model type
 * @param {Function} writeStream - Function to write to stream
 * @param {ToolCallManager} toolManager - Tool call manager instance
 * @returns {Promise<boolean>} - True if tool call was handled
 */
async function handleToolCall(chunk, modelType, writeStream, toolManager = null) {
  if (!toolManager) {
    toolManager = new ToolCallManager();
  }
  
  try {
    // Parse chunk to check for tool calls
    const lines = chunk.split('\n');
    let toolCallsFound = false;
    
    for (const line of lines) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          const data = JSON.parse(line.slice(6));
          const choice = data.choices?.[0];
          
          if (choice?.delta?.tool_calls || choice?.message?.tool_calls) {
            const toolCalls = choice.delta?.tool_calls || choice.message?.tool_calls;
            toolCallsFound = true;
            
            // Process all tool calls concurrently
            const promises = toolCalls.map(toolCall => {
              if (toolCall.function?.name) {
                return toolManager.processToolCall(toolCall, modelType, writeStream);
              }
              return Promise.resolve();
            });
            
            // Wait for all tool calls to complete
            await Promise.all(promises);
          }
        } catch (e) {
          // Not JSON or not a tool call, continue
        }
      }
    }
    
    return toolCallsFound;
  } catch (error) {
    console.error('Error handling tool call:', error);
    
    // Send error event
    writeStream(`data: ${JSON.stringify({
      type: 'tool_system_error',
      error: error.message,
      timestamp: new Date().toISOString()
    })}\n\n`);
  }
  
  return false;
}

/**
 * Process a chat completion request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const completeChat = async (req, res) => {
  try {
    const { modelType, prompt, search = false, deepResearch = false, imageGen = false, imageData = null, mode, systemPrompt, messages = [] } = req.body;
    
    // Log the request (without sensitive data)
    console.log(`Request received for model: ${modelType}, mode: ${mode}, search: ${search}, hasImage: ${!!imageData}`);
    
    // Get model configuration to determine routing
    const modelConfig = modelConfigService.getModelConfig(modelType);
    const routingService = modelConfig?.routing?.service;
    
    // Check against list of available models to prevent abuse
    // Skip this check for:
    // 1. Instant mode (uses meta-llama/llama-4-scout)
    // 2. Direct provider models (Anthropic, OpenAI, Gemini, Ollama, Local)
    const allowedModels = process.env.ALLOWED_MODELS?.split(',') || [];
    const isDirectProviderModel = isAnthropicModel(modelType) || isOpenAIModel(modelType) || isGeminiModel(modelType) || isOllamaModel(modelType) || isLocalModel(modelType);
    
    if (mode !== 'instant' && !isDirectProviderModel && !allowedModels.includes(modelType)) {
      return res.status(400).json({ error: 'Invalid model type requested' });
    }
    
    // If search is enabled, use the search processing functionality
    if (search) {
      console.log('Search functionality requested, performing search...');
      try {
        // Use internal API call to searchAndProcess
        const searchResponse = await axios.post(`${req.protocol}://${req.get('host')}/api/search-process`, {
          query: prompt,
          max_results: deepResearch ? 5 : 3,
          model_prompt: "Based on the search results above, please answer this question in a comprehensive way with the most up-to-date information. DO NOT mention or reference the sources in your answer, as they will be displayed separately.",
          modelType: modelType // Pass the model type to use the same model
        });
        
        // Return the search results
        return res.status(200).json(searchResponse.data);
      } catch (error) {
        console.error('Error in search processing:', error);
        console.error('Error details:', error.response?.data);
        
        // Fall back to normal completion if search fails
        console.log('Search failed, falling back to normal completion');
      }
    }
    
    // Handle routing based on model configuration first
    if (routingService) {
      console.log(`Using routing service: ${routingService} for model: ${modelType}`);
      
      if (routingService === 'openai') {
        // Use a custom OpenAI-compatible endpoint for models like Gemini flash-lite
        try {
          const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
          const openaiResponse = await processOpenAICompatibleChat(modelType, prompt, imageData, enhancedSystemPrompt, messages, modelConfig);
          return res.status(200).json(openaiResponse);
        } catch (error) {
          console.error('Error processing OpenAI-compatible request:', error);
          return res.status(500).json({
            error: 'OpenAI-compatible API error',
            details: error.message,
            modelType: modelType
          });
        }
      } else if (routingService === 'localInference') {
        try {
          const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
          const localResponse = await processLocalChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
          return res.status(200).json(localResponse);
        } catch (error) {
          console.error('Error processing local model request:', error);
          return res.status(500).json({
            error: 'Local model API error',
            details: error.message,
            modelType: modelType
          });
        }
      }
    }
    
    // Fallback to provider-based routing for backward compatibility
    // Check if this is an Anthropic model
    if (isAnthropicModel(modelType)) {
      console.log(`Detected Anthropic model: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const anthropicResponse = await processAnthropicChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(anthropicResponse);
      } catch (error) {
        console.error('Error processing Anthropic request:', error);
        return res.status(500).json({
          error: 'Anthropic API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Check if this is an OpenAI model
    if (isOpenAIModel(modelType)) {
      console.log(`Detected OpenAI model: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const openaiResponse = await processOpenAIChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(openaiResponse);
      } catch (error) {
        console.error('Error processing OpenAI request:', error);
        return res.status(500).json({
          error: 'OpenAI API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Check if this is a Gemini model
    if (isGeminiModel(modelType)) {
      console.log(`Detected Gemini model: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const geminiResponse = await processGeminiChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(geminiResponse);
      } catch (error) {
        console.error('Error processing Gemini request:', error);
        return res.status(500).json({
          error: 'Gemini API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Check if this is an Ollama model
    if (isOllamaModel(modelType)) {
      console.log(`Detected Ollama model: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const ollamaResponse = await processOllamaChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(ollamaResponse);
      } catch (error) {
        console.error('Error processing Ollama request:', error);
        return res.status(500).json({
          error: 'Ollama API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Check if this is a local model
    if (isLocalModel(modelType)) {
      console.log(`Detected local model: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const localResponse = await processLocalChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(localResponse);
      } catch (error) {
        console.error('Error processing local model request:', error);
        return res.status(500).json({
          error: 'Local model API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Model-specific adjustments and normalization for OpenRouter
    let adjustedModelType = modelType;
    let providerConfig = null;

    if (mode === 'instant') {
      adjustedModelType = 'meta-llama/llama-4-scout';
      providerConfig = { only: ["Cerebras"] };
      console.log(`Instant mode detected. Overriding model to ${adjustedModelType} with provider Cerebras.`);
    } else {
      // Some models need specific handling - these mappings may need to be updated
      // based on OpenRouter's current model IDs
      const modelMappings = {
        'deepseek/deepseek-v3-base:free': 'deepseek/deepseek-chat-v3-0324:free',
        'deepseek/deepseek-r1:free': 'deepseek/deepseek-r1'
      };
      
      if (modelMappings[modelType]) {
        console.log(`Adjusting model ID from ${modelType} to ${modelMappings[modelType]}`);
        adjustedModelType = modelMappings[modelType];
      }
    }
    
    // Prepare the message content based on whether we have an image or not
    let messageContent;
    
    if (imageData && imageData.data && imageData.mediaType) {
      // Format message content for multimodal models
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.data
          }
        },
        {
          type: "text",
          text: prompt
        }
      ];
    } else {
      // Plain text message
      messageContent = prompt;
    }
    
    // Create payload for OpenRouter
    const openRouterPayload = {
      model: adjustedModelType,
      messages: []
    };

    // Generate enhanced system prompt with tool instructions
    const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, adjustedModelType);
    if (enhancedSystemPrompt) {
      openRouterPayload.messages.push({ role: 'system', content: enhancedSystemPrompt });
    }

    openRouterPayload.messages.push({
      role: 'user',
      content: messageContent
    });

    if (providerConfig) {
      openRouterPayload.provider = providerConfig;
    }
    
    // Add conversation history
    if (messages && messages.length > 0) {
      // Insert history messages before the current user message
      const userMessage = openRouterPayload.messages.pop(); // Remove the current user message
      openRouterPayload.messages.push(...messages); // Add history
      openRouterPayload.messages.push(userMessage); // Add back the current user message
    }
    
    console.log(`Sending request to OpenRouter with payload:`, openRouterPayload);
    
    // Call OpenRouter API
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', openRouterPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aiportal.com',
        'X-Title': 'AI Portal'
      }
    });
    
    // Extract the full response from OpenRouter
    const aiResponse = response.data;
    
    // Send the complete, unmodified OpenRouter response to the client
    res.status(200).json(aiResponse);
    
  } catch (error) {
    console.error('Error in chat completion:', error);
    console.error('Error details:', error.response?.data);
    
    // Pass through any OpenRouter error messages 
    if (error.response && error.response.data) {
      return res.status(error.response.status || 500).json({
        error: 'OpenRouter API error',
        details: error.response.data,
        modelType: req.body.modelType
      });
    }
    
    // Generic error handling
    res.status(500).json({
      error: 'Failed to complete chat request',
      details: error.message,
      modelType: req.body.modelType
    });
  }
};

/**
 * Process a streaming chat completion request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const streamChat = async (req, res) => {
  const { modelType, prompt, search, deepResearch, imageGen, imageData, fileTextContent, mode, systemPrompt, messages = [] } = req.body;
  
  if (!modelType || !prompt) {
    return res.status(400).json({ error: 'Missing required fields: modelType and prompt' });
  }
  
  console.log("Backend streamChat received:", { 
    modelType, 
    mode,
    promptLength: prompt?.length,
    hasImage: !!imageData,
    hasFileText: !!fileTextContent,
    fileTextLength: fileTextContent?.length
  });
  
  // Set appropriate headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    // Convert boolean strings to actual booleans if needed
    const doSearch = search === 'true' || search === true;
    const doDeepResearch = deepResearch === 'true' || deepResearch === true;
    const doImageGen = imageGen === 'true' || imageGen === true;
    
    // Get model configuration to determine routing
    const modelConfig = modelConfigService.getModelConfig(modelType);
    const routingService = modelConfig?.routing?.service;
    
    // If search is enabled, use the search processing functionality
    if (doSearch) {
      try {
        // Call the search-process endpoint to get search results
        const searchResponse = await axios.post(`${req.protocol}://${req.get('host')}/api/search-process`, {
          query: prompt,
          max_results: doDeepResearch ? 5 : 3,
          model_prompt: "Based on the search results above, please answer this question in a comprehensive way with the most up-to-date information. DO NOT mention or reference the sources in your answer, as they will be displayed separately.",
          modelType: modelType // Pass the model type to use the same model
        });
        
        // If we have sources, include them in the message
        if (searchResponse.data.sources && searchResponse.data.sources.length > 0) {
          // Removing this section to eliminate the "Sources found:" text in the response
          // const sourcesText = searchResponse.data.sources
          //   .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
          //   .join('\n');
          // 
          // res.write(`data: Sources found:\n${sourcesText}\n\n`);
        }
        
        // Stream the response content if available
        let content = '';
        if (searchResponse.data.result && searchResponse.data.result.choices && 
            searchResponse.data.result.choices[0] && 
            searchResponse.data.result.choices[0].message) {
          
          content = searchResponse.data.result.choices[0].message.content;
        } else if (searchResponse.data.choices && searchResponse.data.choices[0]) {
          // For OpenRouter format
          content = searchResponse.data.choices[0].message.content;
        } else if (searchResponse.data.content) {
          content = searchResponse.data.content;
        } else {
          // If we can't find the content in the expected structure, try to send the whole response
          // This is a fallback for unexpected response structures
          try {
            const fullResponse = JSON.stringify(searchResponse.data);
            content = `Unable to parse structured response. Full data: ${fullResponse}`;
          } catch (e) {
            console.error('Error parsing search results:', e);
            content = "Received search results but couldn't parse them.";
          }
        }
        
        // The content already has the <links> format appended by the searchAndProcess function
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        
        // End the response
        res.write('data: [DONE]\n\n');
        return res.end();
      } catch (error) {
        console.error('Error in search processing:', error);
        console.error('Error details:', error.response?.data);
        
        // Send error message to client
        res.write(`data: Error performing search: ${error.message}\n\n`);
        res.write('data: Falling back to regular model response.\n\n');
        
        // Fall through to regular streaming response
      }
    }
    
    // Handle routing based on model configuration first
    if (routingService) {
      console.log(`Using routing service: ${routingService} for model: ${modelType}`);
      
      if (routingService === 'openai') {
        // Use a custom OpenAI-compatible endpoint for models like Gemini flash-lite
        try {
          await streamOpenAICompatibleChat(
            modelType,
            prompt,
            imageData,
            systemPromptService.generateSystemPrompt(systemPrompt, modelType),
            (chunk) => res.write(chunk),
            messages,
            modelConfig
          );
          return res.end();
        } catch (error) {
          console.error('Error in OpenAI-compatible streaming:', error);
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        }
      } else if (routingService === 'localInference') {
        try {
          await streamLocalChat(
            modelType,
            prompt,
            imageData,
            systemPromptService.generateSystemPrompt(systemPrompt, modelType),
            (chunk) => res.write(chunk),
            messages
          );
          return res.end();
        } catch (error) {
          console.error('Error in local inference streaming:', error);
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        }
      }
    }
    
    // Fallback to provider-based routing for backward compatibility
    // Check if this is an Anthropic model
    if (isAnthropicModel(modelType)) {
      console.log(`Detected Anthropic model for streaming: ${modelType}`);
      
      try {
        await streamAnthropicChat(
          modelType,
          prompt,
          imageData,
          systemPromptService.generateSystemPrompt(systemPrompt, modelType),
          (chunk) => res.write(chunk),
          messages
        );
        return res.end();
      } catch (error) {
        console.error('Error in Anthropic streaming:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
    
    // Check if this is an OpenAI model
    if (isOpenAIModel(modelType)) {
      console.log(`Detected OpenAI model for streaming: ${modelType}`);
      
      try {
        // Create tool call manager for enhanced tool handling
        const toolManager = new ToolCallManager();
        
        // Use enhanced streaming with tool manager
        await streamOpenAIChat(
          modelType,
          prompt,
          imageData,
          systemPromptService.generateSystemPrompt(systemPrompt, modelType),
          async (chunk) => {
            // Check for tool calls and handle them with enhanced manager
            const toolHandled = await handleToolCall(chunk, modelType, (toolData) => {
              res.write(toolData);
            }, toolManager);
            
            // Forward the original chunk to the client (unless it was a tool call)
            if (!toolHandled) {
              res.write(chunk);
            }
          },
          messages,
          true // Disable internal tool handling in OpenAI service
        );
        
        // Send final tool call summary if there were any active calls
        toolManager.sendToolCallSummary((toolData) => {
          res.write(toolData);
        });
        
        return res.end();
      } catch (error) {
        console.error('Error in OpenAI streaming:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
    
    // Check if this is a Gemini model
    if (isGeminiModel(modelType)) {
      console.log(`Detected Gemini model for streaming: ${modelType}`);
      
      try {
        await streamGeminiChat(
          modelType,
          prompt,
          imageData,
          systemPromptService.generateSystemPrompt(systemPrompt, modelType),
          (chunk) => res.write(chunk),
          messages
        );
        return res.end();
      } catch (error) {
        console.error('Error in Gemini streaming:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
    
    // Check if this is an Ollama model
    if (isOllamaModel(modelType)) {
      console.log(`Detected Ollama model for streaming: ${modelType}`);
      
      try {
        await streamOllamaChat(
          modelType,
          prompt,
          imageData,
          systemPromptService.generateSystemPrompt(systemPrompt, modelType),
          (chunk) => res.write(chunk),
          messages
        );
        return res.end();
      } catch (error) {
        console.error('Error in Ollama streaming:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
    
    // Check if this is a local model
    if (isLocalModel(modelType)) {
      console.log(`Detected local model for streaming: ${modelType}`);
      
      try {
        await streamLocalChat(
          modelType,
          prompt,
          imageData,
          systemPromptService.generateSystemPrompt(systemPrompt, modelType),
          (chunk) => res.write(chunk),
          messages
        );
        return res.end();
      } catch (error) {
        console.error('Error in local model streaming:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
    
    // Adjusted model name for OpenRouter (they use standardized model names)
    let adjustedModelType = modelType;
    let providerConfig = null;

    if (mode === 'instant') {
      adjustedModelType = 'meta-llama/llama-4-scout';
      providerConfig = { only: ["Cerebras"] };
      console.log(`Instant mode detected (streaming). Overriding model to ${adjustedModelType} with provider Cerebras.`);
    } else {
      // Map to standardized model names for OpenRouter if needed
      if (modelType === 'chatgpt-4' || modelType === 'gpt-4') {
        adjustedModelType = 'openai/gpt-4';
      } else if (modelType === 'chatgpt-4o' || modelType === 'gpt-4o') {
        adjustedModelType = 'openai/gpt-4o';
      } else if (modelType === 'chatgpt-3.5-turbo' || modelType === 'gpt-3.5-turbo') {
        adjustedModelType = 'openai/gpt-3.5-turbo';
      } else if (modelType === 'claude-3-opus') {
        adjustedModelType = 'anthropic/claude-3-opus';
      } else if (modelType === 'claude-3-sonnet') {
        adjustedModelType = 'anthropic/claude-3-sonnet';
      } else if (modelType === 'claude-3-haiku') {
        adjustedModelType = 'anthropic/claude-3-haiku';
      }
    }
    
    // Prepare message content based on what was provided
    let messageContent;
    
    // If we have both image data and PDF text, combine them
    if (imageData && imageData.data && imageData.mediaType && fileTextContent) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.data
          }
        },
        {
          type: "text",
          text: `File Content:\n${fileTextContent}\n\nUser Message:\n${prompt}`
        }
      ];
    }
    // If we only have image data
    else if (imageData && imageData.data && imageData.mediaType) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.data
          }
        },
        {
          type: "text",
          text: prompt
        }
      ];
    }
    // If we only have PDF text
    else if (fileTextContent) {
      messageContent = `File Content:\n${fileTextContent}\n\nUser Message:\n${prompt}`;
    }
    // Plain text message
    else {
      messageContent = prompt;
    }
    
    // Create payload for OpenRouter with streaming enabled
    const openRouterPayload = {
      model: adjustedModelType,
      messages: [],
      stream: true
    };

    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(adjustedModelType);
    if (availableTools && availableTools.length > 0) {
      openRouterPayload.tools = availableTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      
      // Send tools available indicator to frontend
      res.write(`data: ${JSON.stringify({
        type: 'tools_available',
        tools: availableTools.map(t => ({ id: t.id, name: t.name }))
      })}\n\n`);
    }

    // Generate enhanced system prompt with tool instructions
    const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, adjustedModelType);
    if (enhancedSystemPrompt) {
      openRouterPayload.messages.push({ role: 'system', content: enhancedSystemPrompt });
    }

    openRouterPayload.messages.push({
      role: 'user',
      content: messageContent
    });

    if (providerConfig) {
      openRouterPayload.provider = providerConfig;
    }
    
    // Add conversation history
    if (messages && messages.length > 0) {
      // Insert history messages before the current user message
      const userMessage = openRouterPayload.messages.pop(); // Remove the current user message
      openRouterPayload.messages.push(...messages); // Add history
      openRouterPayload.messages.push(userMessage); // Add back the current user message
    }
    
    console.log(`Sending streaming request to OpenRouter with payload:`, openRouterPayload);
    
    // Make a streaming request to OpenRouter
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', 
      openRouterPayload, 
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aiportal.com',
          'X-Title': 'AI Portal'
        },
        responseType: 'stream'
      }
    );
    
    // Create tool call manager for this session
    const toolManager = new ToolCallManager();
    
    // Pipe the OpenRouter response directly to the client
    response.data.on('data', async (chunk) => {
      const data = chunk.toString();
      
      // Check for tool calls and handle them with enhanced manager
      const toolHandled = await handleToolCall(data, adjustedModelType, (toolData) => {
        res.write(toolData);
      }, toolManager);
      
      // Forward the original chunk to the client (unless it was a tool call)
      if (!toolHandled) {
        res.write(data);
      }
    });
    
    response.data.on('end', () => {
      // Send final tool call summary if there were any active calls
      toolManager.sendToolCallSummary((toolData) => {
        res.write(toolData);
      });
      res.end();
    });
    
    // Handle client disconnect
    req.on('close', () => {
      response.data.destroy();
    });
  } catch (error) {
    console.error('Error in streaming chat:', error);
    console.error('Error details:', error.response?.data);
    
    // If headers haven't been sent yet, send an error response
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to initiate streaming chat',
        details: error.message,
        modelType: req.body.modelType
      });
    } else {
      // Otherwise, try to send an error event
      try {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      } catch (e) {
        console.error('Error sending streaming error:', e);
      }
    }
  }
};

/**
 * Handle chat completion request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleChat = async (req, res) => {
  const { modelType, prompt, search, deepResearch, imageGen, imageData, fileTextContent, mode, systemPrompt, messages = [] } = req.body;
  
  if (!modelType || !prompt) {
    return res.status(400).json({ error: 'Missing required fields: modelType and prompt' });
  }
  
  console.log("Backend handleChat received:", { 
    modelType, 
    mode,
    promptLength: prompt?.length,
    hasImage: !!imageData,
    hasFileText: !!fileTextContent,
    fileTextLength: fileTextContent?.length
  });
  
  try {
    // Check if this is an Anthropic model
    if (isAnthropicModel(modelType)) {
      console.log(`Detected Anthropic model in handleChat: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const anthropicResponse = await processAnthropicChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(anthropicResponse);
      } catch (error) {
        console.error('Error processing Anthropic request:', error);
        return res.status(500).json({
          error: 'Anthropic API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Check if this is an OpenAI model
    if (isOpenAIModel(modelType)) {
      console.log(`Detected OpenAI model in handleChat: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const openaiResponse = await processOpenAIChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(openaiResponse);
      } catch (error) {
        console.error('Error processing OpenAI request:', error);
        return res.status(500).json({
          error: 'OpenAI API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Check if this is a Gemini model
    if (isGeminiModel(modelType)) {
      console.log(`Detected Gemini model in handleChat: ${modelType}`);
      
      try {
        const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, modelType);
        const geminiResponse = await processGeminiChat(modelType, prompt, imageData, enhancedSystemPrompt, messages);
        return res.status(200).json(geminiResponse);
      } catch (error) {
        console.error('Error processing Gemini request:', error);
        return res.status(500).json({
          error: 'Gemini API error',
          details: error.message,
          modelType: modelType
        });
      }
    }
    
    // Adjusted model name for OpenRouter (they use standardized model names)
    let adjustedModelType = modelType;
    let providerConfig = null;

    if (mode === 'instant') {
      adjustedModelType = 'meta-llama/llama-4-scout';
      providerConfig = { only: ["Cerebras"] };
      console.log(`Instant mode detected (handleChat). Overriding model to ${adjustedModelType} with provider Cerebras.`);
    } else {
      // Map to standardized model names for OpenRouter if needed
      if (modelType === 'chatgpt-4' || modelType === 'gpt-4') {
        adjustedModelType = 'openai/gpt-4';
      } else if (modelType === 'chatgpt-4o' || modelType === 'gpt-4o') {
        adjustedModelType = 'openai/gpt-4o';
      } else if (modelType === 'chatgpt-3.5-turbo' || modelType === 'gpt-3.5-turbo') {
        adjustedModelType = 'openai/gpt-3.5-turbo';
      } else if (modelType === 'claude-3-opus') {
        adjustedModelType = 'anthropic/claude-3-opus';
      } else if (modelType === 'claude-3-sonnet') {
        adjustedModelType = 'anthropic/claude-3-sonnet';
      } else if (modelType === 'claude-3-haiku') {
        adjustedModelType = 'anthropic/claude-3-haiku';
      }
    }
    
    // Prepare message content based on what was provided
    let messageContent;
    
    // If we have both image data and PDF text, combine them
    if (imageData && imageData.data && imageData.mediaType && fileTextContent) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.data
          }
        },
        {
          type: "text",
          text: `File Content:\n${fileTextContent}\n\nUser Message:\n${prompt}`
        }
      ];
    }
    // If we only have image data
    else if (imageData && imageData.data && imageData.mediaType) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType,
            data: imageData.data
          }
        },
        {
          type: "text",
          text: prompt
        }
      ];
    }
    // If we only have PDF text
    else if (fileTextContent) {
      messageContent = `File Content:\n${fileTextContent}\n\nUser Message:\n${prompt}`;
    }
    // Plain text message
    else {
      messageContent = prompt;
    }
    
    // Create payload for OpenRouter
    const openRouterPayload = {
      model: adjustedModelType,
      messages: []
    };

    // Generate enhanced system prompt with tool instructions
    const enhancedSystemPrompt = systemPromptService.generateSystemPrompt(systemPrompt, adjustedModelType);
    if (enhancedSystemPrompt) {
      openRouterPayload.messages.push({ role: 'system', content: enhancedSystemPrompt });
    }

    openRouterPayload.messages.push({
      role: 'user',
      content: messageContent
    });
    
    if (providerConfig) {
      openRouterPayload.provider = providerConfig;
    }
    
    // Add conversation history
    if (messages && messages.length > 0) {
      // Insert history messages before the current user message
      const userMessage = openRouterPayload.messages.pop(); // Remove the current user message
      openRouterPayload.messages.push(...messages); // Add history
      openRouterPayload.messages.push(userMessage); // Add back the current user message
    }

    console.log(`Sending request to OpenRouter with payload:`, openRouterPayload);
    
    // Make request to OpenRouter
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', 
      openRouterPayload, 
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aiportal.com',
          'X-Title': 'AI Portal'
        }
      }
    );
    
    console.log('OpenRouter response:', response.data);
    
    // Send the response
    res.json(response.data);
  } catch (error) {
    console.error('Error in chat:', error);
    console.error('Error details:', error.response?.data);
    
    res.status(500).json({ 
      error: 'Failed to process chat',
      details: error.message,
      modelType: req.body.modelType
    });
  }
}; 