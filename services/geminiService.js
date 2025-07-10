import { GoogleGenerativeAI } from "@google/generative-ai";
import modelConfigService from './modelConfigService.js';

/**
 * Initialize Gemini client
 */
const initializeGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not configured in environment variables");
    return null;
  }
  
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Get API model name from model config
 */
const getApiModelName = (modelId) => {
  const modelConfig = modelConfigService.getModelConfig(modelId);
  if (modelConfig && modelConfig.apiModel) {
    return modelConfig.apiModel;
  }
  // Fallback to the model ID if not found in config
  return modelId;
};

/**
 * Check if a model is a Gemini model
 */
export const isGeminiModel = (modelId) => {
  // First check model config
  const modelConfig = modelConfigService.getModelConfig(modelId);
  if (modelConfig && modelConfig.provider === 'google') {
    return true;
  }
  // Fallback to prefix check for backward compatibility
  return modelId.startsWith('gemini-') || modelId.startsWith('google/gemini');
};

/**
 * Process a non-streaming Gemini chat request
 */
export const processGeminiChat = async (modelType, prompt, imageData = null, systemPrompt = null, conversationHistory = [], useGrounding = false) => {
  try {
    const genAI = initializeGeminiClient();
    if (!genAI) {
      throw new Error("Gemini API is not configured. Please set GEMINI_API_KEY environment variable.");
    }
    
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing Gemini request with model: ${modelName}`);
    
    // Configure model with optional grounding and custom tools
    const modelConfig = { model: modelName };
    const toolsArray = [];
    
    if (useGrounding) {
      toolsArray.push({ googleSearch: {} });
    }
    
    // Add custom tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 Gemini Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    
    if (availableTools && availableTools.length > 0) {
      const customTools = availableTools.map(tool => ({
        functionDeclaration: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      toolsArray.push(...customTools);
      console.log(`🔧 Gemini Service: Added ${customTools.length} custom tools to request for model ${modelType}`);
    }
    
    if (toolsArray.length > 0) {
      modelConfig.tools = toolsArray;
    }
    
    const model = genAI.getGenerativeModel(modelConfig);
    
    // If we have conversation history, use chat session
    if (conversationHistory && conversationHistory.length > 0) {
      // Convert conversation history to Gemini format
      const history = conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      const chat = model.startChat({ history });
      
      // Build the current prompt with system prompt if provided
      let currentPrompt = prompt;
      if (systemPrompt) {
        currentPrompt = `${systemPrompt}\n\n${prompt}`;
      }
      
      // Prepare the content parts for current message
      const parts = [];
      parts.push({ text: currentPrompt });
      
      // Add image if provided
      if (imageData && imageData.data && imageData.mediaType) {
        parts.push({
          inlineData: {
            mimeType: imageData.mediaType,
            data: imageData.data
          }
        });
      }
      
      // Send message with parts
      const result = await chat.sendMessage(parts);
      const response = await result.response;
      
      // Check for function calls in response and execute them with logging
      const functionCalls = response.candidates?.[0]?.content?.parts?.filter(part => part.functionCall) || [];
      if (functionCalls.length > 0) {
        // Log summary of tool calls detected
        console.log(`\n🎯 DETECTED ${functionCalls.length} TOOL CALL${functionCalls.length > 1 ? 'S' : ''}:`);
        functionCalls.forEach((fc, i) => {
          console.log(`  ${i + 1}. ${fc.functionCall?.name || 'Unknown'}`);
        });
        console.log('═════════════════════════════════════════');
        
        // Execute function calls
        const functionResults = [];
        for (const functionCall of functionCalls) {
          try {
            // Log tool execution details to console
            console.log(`\n🔧 TOOL CALL: ${functionCall.functionCall.name}`);
            console.log(`📝 Parameters:`, JSON.stringify(functionCall.functionCall.args || {}, null, 2));
            
            const toolsService = await import('./toolsService.js');
            const result = await toolsService.default.executeTool(
              functionCall.functionCall.name,
              functionCall.functionCall.args || {},
              modelType
            );
            
            console.log(`✅ Result:`, typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
            console.log(`─────────────────────────────────────────\n`);
            
            functionResults.push({
              functionResponse: {
                name: functionCall.functionCall.name,
                response: result
              }
            });
          } catch (error) {
            console.log(`❌ TOOL ERROR: ${functionCall.functionCall.name}`);
            console.log(`📝 Parameters:`, JSON.stringify(functionCall.functionCall.args || {}, null, 2));
            console.log(`💥 Error:`, error.message);
            console.log(`─────────────────────────────────────────\n`);
            
            console.error(`Error executing tool ${functionCall.functionCall.name}:`, error);
            functionResults.push({
              functionResponse: {
                name: functionCall.functionCall.name,
                response: { error: error.message }
              }
            });
          }
        }
        
        // If we have function results, make another API call with the results
        if (functionResults.length > 0) {
          const followUpResult = await chat.sendMessage(functionResults);
          const followUpResponse = await followUpResult.response;
          
          // Return the follow-up response
          return {
            id: `gemini-follow-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelType,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: followUpResponse.text()
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0
            }
          };
        }
      }
      
      const text = response.text();
      
      // Format response to match OpenRouter format for consistency
      return {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelType, // Return the requested model ID, not the API model name
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    } else {
      // No history - use single generation
      // Build the prompt with system prompt if provided
      let fullPrompt = prompt;
      if (systemPrompt) {
        fullPrompt = `${systemPrompt}\n\nUser: ${prompt}`;
      }
      
      // Prepare the content parts
      const parts = [];
      
      // Add text prompt
      parts.push({ text: fullPrompt });
      
      // Add image if provided
      if (imageData && imageData.data && imageData.mediaType) {
        parts.push({
          inlineData: {
            mimeType: imageData.mediaType,
            data: imageData.data
          }
        });
      }
      
      // Generate content
      const result = await model.generateContent(parts);
      const response = await result.response;
      const text = response.text();
    
      // Format response to match OpenRouter format for consistency
      return {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelType, // Return the requested model ID, not the API model name
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0, // Gemini doesn't provide token counts
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    }
  } catch (error) {
    console.error('Error in Gemini chat processing:', error);
    throw error;
  }
};

/**
 * Process a streaming Gemini chat request
 */
export const streamGeminiChat = async (modelType, prompt, imageData = null, systemPrompt = null, onChunk, conversationHistory = [], useGrounding = false) => {
  try {
    const genAI = initializeGeminiClient();
    if (!genAI) {
      throw new Error("Gemini API is not configured. Please set GEMINI_API_KEY environment variable.");
    }
    
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing streaming Gemini request with model: ${modelName}`);
    
    // Configure model with optional grounding and custom tools
    const modelConfig = { model: modelName };
    const toolsArray = [];
    
    if (useGrounding) {
      toolsArray.push({ googleSearch: {} });
    }
    
    // Add custom tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 Gemini Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    
    if (availableTools && availableTools.length > 0) {
      const customTools = availableTools.map(tool => ({
        functionDeclaration: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      toolsArray.push(...customTools);
      console.log(`🔧 Gemini Service: Added ${customTools.length} custom tools to request for model ${modelType}`);
    }
    
    if (toolsArray.length > 0) {
      modelConfig.tools = toolsArray;
    }
    
    const model = genAI.getGenerativeModel(modelConfig);
    
    // If we have conversation history, use chat session
    if (conversationHistory && conversationHistory.length > 0) {
      // Convert conversation history to Gemini format
      const history = conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      const chat = model.startChat({ history });
      
      // Build the current prompt with system prompt if provided
      let currentPrompt = prompt;
      if (systemPrompt) {
        currentPrompt = `${systemPrompt}\n\n${prompt}`;
      }
      
      // Prepare the content parts for current message
      const parts = [];
      parts.push({ text: currentPrompt });
      
      // Add image if provided
      if (imageData && imageData.data && imageData.mediaType) {
        parts.push({
          inlineData: {
            mimeType: imageData.mediaType,
            data: imageData.data
          }
        });
      }
      
      // Send streaming message
      const result = await chat.sendMessageStream(parts);
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          // Format as SSE event matching OpenRouter format
          const sseData = {
            id: `gemini-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelType, // Return the requested model ID, not the API model name
            choices: [{
              index: 0,
              delta: {
                content: chunkText
              },
              finish_reason: null
            }]
          };
          
          onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      }
      
      onChunk('data: [DONE]\n\n');
      return;
    } else {
      // No history - use single generation
      // Build the prompt with system prompt if provided
      let fullPrompt = prompt;
      if (systemPrompt) {
        fullPrompt = `${systemPrompt}\n\nUser: ${prompt}`;
      }
      
      // Prepare the content parts
      const parts = [];
      
      // Add text prompt
      parts.push({ text: fullPrompt });
    
    // Add image if provided
    if (imageData && imageData.data && imageData.mediaType) {
      parts.push({
        inlineData: {
          mimeType: imageData.mediaType,
          data: imageData.data
        }
      });
    }
    
    // Generate content with streaming
    const result = await model.generateContentStream(parts);
    
    // Process the stream
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        // Format as SSE event matching OpenRouter format
        const sseData = {
          id: `gemini-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelType, // Return the requested model ID, not the API model name
          choices: [{
            index: 0,
            delta: {
              content: chunkText
            },
            finish_reason: null
          }]
        };
        
        onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
      }
    }
    
      // Send the final done message
      onChunk('data: [DONE]\n\n');
    }
    
  } catch (error) {
    console.error('Error in Gemini streaming:', error);
    throw error;
  }
};

/**
 * Process a grounded search request with Google Search
 */
export const processGroundedSearch = async (modelType, query) => {
  try {
    const genAI = initializeGeminiClient();
    if (!genAI) {
      throw new Error("Gemini API is not configured. Please set GEMINI_API_KEY environment variable.");
    }
    
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing grounded search request with model: ${modelName}`);
    
    // Configure model with Google Search grounding
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      tools: [{ googleSearch: {} }]
    });
    
    const result = await model.generateContent(query);
    const response = await result.response;
    const text = response.text();
    
    // Extract grounding metadata if available
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    
    return {
      id: `gemini-grounded-${Date.now()}`,
      object: 'grounded.search.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelType,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: text
        },
        finish_reason: 'stop'
      }],
      groundingMetadata: groundingMetadata || null,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  } catch (error) {
    console.error('Error in grounded search:', error);
    throw error;
  }
};

/**
 * Get available Gemini models
 */
export const getGeminiModels = () => {
  return [
    {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'google',
      source: 'gemini',
      context_length: 1048576,
      capabilities: ['text', 'vision'],
      isBackendModel: true
    },
    {
      id: 'google/gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      source: 'gemini',
      context_length: 2097152,
      capabilities: ['text', 'vision', 'thinking'],
      isBackendModel: true
    },
    {
      id: 'google/gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash Experimental',
      provider: 'google',
      source: 'gemini',
      context_length: 1048576,
      capabilities: ['text', 'vision', 'audio', 'multimodal'],
      isBackendModel: true
    }
  ];
};

// Export the service object
const geminiService = {
  isGeminiModel,
  processGeminiChat,
  streamGeminiChat,
  processGroundedSearch,
  getGeminiModels
};

export default geminiService; 