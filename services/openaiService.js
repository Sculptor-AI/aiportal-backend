import OpenAI from 'openai';
import modelConfigService from './modelConfigService.js';

/**
 * Initialize OpenAI client
 */
const initializeOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured in environment variables");
  }
  
  return new OpenAI({
    apiKey: apiKey,
  });
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
 * Check if a model is an OpenAI model
 */
export const isOpenAIModel = (modelId) => {
  // First check model config
  const modelConfig = modelConfigService.getModelConfig(modelId);
  if (modelConfig && modelConfig.provider === 'openai') {
    return true;
  }
  // Fallback to prefix check for backward compatibility
  return modelId.startsWith('gpt-') || modelId.startsWith('openai/gpt') || modelId.startsWith('o3') || modelId.startsWith('openai/o3') || modelId.startsWith('o4') || modelId.startsWith('openai/o4');
};

/**
 * Process a non-streaming OpenAI-compatible chat request with custom endpoint
 */
export const processOpenAICompatibleChat = async (modelType, prompt, imageData = null, systemPrompt = null, conversationHistory = [], modelConfig = null) => {
  try {
    // Select the appropriate API key based on the model provider
    let apiKey;
    if (modelConfig?.provider === 'google') {
      apiKey = process.env.GEMINI_API_KEY;
    } else if (modelConfig?.provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else {
      // Fallback logic based on endpoint
      if (modelConfig?.routing?.endpoint?.includes('googleapis.com')) {
        apiKey = process.env.GEMINI_API_KEY;
      } else {
        apiKey = process.env.OPENAI_API_KEY;
      }
    }
    
    if (!apiKey) {
      throw new Error("API key is not configured in environment variables");
    }
    
    // Get endpoint from model config or fallback to OpenAI
    const baseURL = modelConfig?.routing?.endpoint || 'https://api.openai.com/v1';
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing OpenAI-compatible request with model: ${modelName} at ${baseURL}`);
    
    // Create custom OpenAI client with the specified endpoint
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    });
    
    // Get model config parameters or use defaults
    const parameters = modelConfig?.parameters || {};
    
    // Build messages array
    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Prepare content for the user message
    let userContent;
    
    // Check if we have image data (for vision models)
    if (imageData && imageData.data && imageData.mediaType && modelConfig?.capabilities?.vision) {
      userContent = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageData.mediaType};base64,${imageData.data}`
          }
        }
      ];
    } else {
      // Text-only content
      userContent = prompt;
    }
    
    messages.push({
      role: 'user',
      content: userContent
    });
    
    // Build request parameters
    const requestParams = {
      model: modelName,
      messages: messages
    };
    
    // Only add parameters that are explicitly defined in the model config
    if (parameters.temperature !== undefined) {
      requestParams.temperature = parameters.temperature;
    }
    if (parameters.top_p !== undefined) {
      requestParams.top_p = parameters.top_p;
    }
    if (parameters.max_tokens !== undefined) {
      requestParams.max_tokens = parameters.max_tokens;
    }
    
    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 OpenAI Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    if (availableTools && availableTools.length > 0) {
      requestParams.tools = availableTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      console.log(`🔧 OpenAI Service: Added ${requestParams.tools.length} tools to request for model ${modelType}`);
    }
    
    // Make the API call
    const completion = await openai.chat.completions.create(requestParams);
    
    // Check for tool calls and execute them
    if (completion.choices?.[0]?.message?.tool_calls) {
      const toolCalls = completion.choices[0].message.tool_calls;
      const toolResults = [];
      
      for (const toolCall of toolCalls) {
        if (toolCall.function && toolCall.function.name) {
          try {
            // Import toolsService here to avoid circular dependency
            const toolsService = await import('./toolsService.js');
            const parameters = JSON.parse(toolCall.function.arguments || '{}');
            const result = await toolsService.default.executeTool(
              toolCall.function.name, 
              parameters, 
              modelType
            );
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(result)
            });
          } catch (error) {
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
          ...requestParams.messages,
          completion.choices[0].message, // Add the assistant's message with tool calls
          ...toolResults // Add tool results
        ];
        
        const followUpParams = {
          ...requestParams,
          messages: messagesWithResults
        };
        
        const followUpCompletion = await openai.chat.completions.create(followUpParams);
        
        // Return the follow-up completion
        return {
          id: followUpCompletion.id,
          object: followUpCompletion.object,
          created: followUpCompletion.created,
          model: modelType, // Return the requested model ID, not the API model name
          choices: followUpCompletion.choices,
          usage: {
            prompt_tokens: (completion.usage?.prompt_tokens || 0) + (followUpCompletion.usage?.prompt_tokens || 0),
            completion_tokens: (completion.usage?.completion_tokens || 0) + (followUpCompletion.usage?.completion_tokens || 0),
            total_tokens: (completion.usage?.total_tokens || 0) + (followUpCompletion.usage?.total_tokens || 0)
          }
        };
      }
    }
    
    // Format response to match OpenRouter format for consistency
    return {
      id: completion.id,
      object: completion.object,
      created: completion.created,
      model: modelType, // Return the requested model ID, not the API model name
      choices: completion.choices,
      usage: {
        prompt_tokens: completion.usage?.prompt_tokens || 0,
        completion_tokens: completion.usage?.completion_tokens || 0,
        total_tokens: completion.usage?.total_tokens || 0
      }
    };
  } catch (error) {
    console.error('Error in OpenAI-compatible chat processing:', error);
    throw error;
  }
};

/**
 * Process a non-streaming OpenAI chat request
 */
export const processOpenAIChat = async (modelType, prompt, imageData = null, systemPrompt = null, conversationHistory = []) => {
  try {
    const openai = initializeOpenAIClient();
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing OpenAI request with model: ${modelName}`);
    
    // Get model config to retrieve parameters
    const modelConfig = modelConfigService.getModelConfig(modelType);
    const parameters = modelConfig?.parameters || {};
    
    // Build messages array
    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Prepare content for the user message
    let userContent;
    
    // Check if we have image data (for vision models)
    if (imageData && imageData.data && imageData.mediaType && modelConfig?.capabilities?.vision) {
      userContent = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageData.mediaType};base64,${imageData.data}`
          }
        }
      ];
    } else {
      // Text-only content
      userContent = prompt;
    }
    
    messages.push({
      role: 'user',
      content: userContent
    });
    
    // Build request parameters
    const requestParams = {
      model: modelName,
      messages: messages
    };
    
    // Only add parameters that are explicitly defined in the model config
    if (parameters.temperature !== undefined) {
      requestParams.temperature = parameters.temperature;
    }
    if (parameters.top_p !== undefined) {
      requestParams.top_p = parameters.top_p;
    }
    if (parameters.frequency_penalty !== undefined) {
      requestParams.frequency_penalty = parameters.frequency_penalty;
    }
    if (parameters.presence_penalty !== undefined) {
      requestParams.presence_penalty = parameters.presence_penalty;
    }
    
    // Handle max_tokens vs max_completion_tokens based on model requirements
    if (parameters.max_completion_tokens !== undefined) {
      requestParams.max_completion_tokens = parameters.max_completion_tokens;
    } else if (parameters.max_tokens !== undefined) {
      requestParams.max_tokens = parameters.max_tokens;
    }
    
    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 OpenAI Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    if (availableTools && availableTools.length > 0) {
      requestParams.tools = availableTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      console.log(`🔧 OpenAI Service: Added ${requestParams.tools.length} tools to request for model ${modelType}`);
    }
    
    // Make the API call
    const completion = await openai.chat.completions.create(requestParams);
    
    // Check for tool calls and execute them
    if (completion.choices?.[0]?.message?.tool_calls) {
      const toolCalls = completion.choices[0].message.tool_calls;
      const toolResults = [];
      
      for (const toolCall of toolCalls) {
        if (toolCall.function && toolCall.function.name) {
          try {
            // Import toolsService here to avoid circular dependency
            const toolsService = await import('./toolsService.js');
            const parameters = JSON.parse(toolCall.function.arguments || '{}');
            const result = await toolsService.default.executeTool(
              toolCall.function.name, 
              parameters, 
              modelType
            );
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(result)
            });
          } catch (error) {
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
          ...requestParams.messages,
          completion.choices[0].message, // Add the assistant's message with tool calls
          ...toolResults // Add tool results
        ];
        
        const followUpParams = {
          ...requestParams,
          messages: messagesWithResults
        };
        
        const followUpCompletion = await openai.chat.completions.create(followUpParams);
        
        // Return the follow-up completion
        return {
          id: followUpCompletion.id,
          object: followUpCompletion.object,
          created: followUpCompletion.created,
          model: modelType,
          choices: followUpCompletion.choices,
          usage: {
            prompt_tokens: (completion.usage?.prompt_tokens || 0) + (followUpCompletion.usage?.prompt_tokens || 0),
            completion_tokens: (completion.usage?.completion_tokens || 0) + (followUpCompletion.usage?.completion_tokens || 0),
            total_tokens: (completion.usage?.total_tokens || 0) + (followUpCompletion.usage?.total_tokens || 0)
          }
        };
      }
    }
    
    // Format response to match OpenRouter format for consistency
    return {
      id: completion.id,
      object: completion.object,
      created: completion.created,
      model: modelType, // Return the requested model ID, not the API model name
      choices: completion.choices,
      usage: {
        prompt_tokens: completion.usage?.prompt_tokens || 0,
        completion_tokens: completion.usage?.completion_tokens || 0,
        total_tokens: completion.usage?.total_tokens || 0
      }
    };
  } catch (error) {
    console.error('Error in OpenAI chat processing:', error);
    throw error;
  }
};

/**
 * Process a streaming OpenAI-compatible chat request with custom endpoint
 */
export const streamOpenAICompatibleChat = async (modelType, prompt, imageData = null, systemPrompt = null, onChunk, conversationHistory = [], modelConfig = null) => {
  try {
    // Select the appropriate API key based on the model provider
    let apiKey;
    if (modelConfig?.provider === 'google') {
      apiKey = process.env.GEMINI_API_KEY;
    } else if (modelConfig?.provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else {
      // Fallback logic based on endpoint
      if (modelConfig?.routing?.endpoint?.includes('googleapis.com')) {
        apiKey = process.env.GEMINI_API_KEY;
      } else {
        apiKey = process.env.OPENAI_API_KEY;
      }
    }
    
    if (!apiKey) {
      throw new Error("API key is not configured in environment variables");
    }
    
    // Get endpoint from model config or fallback to OpenAI
    const baseURL = modelConfig?.routing?.endpoint || 'https://api.openai.com/v1';
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing streaming OpenAI-compatible request with model: ${modelName} at ${baseURL}`);
    
    // Create custom OpenAI client with the specified endpoint
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    });
    
    // Get model config parameters or use defaults
    const parameters = modelConfig?.parameters || {};
    
    // Build messages array
    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Prepare content for the user message
    let userContent;
    
    // Check if we have image data (for vision models)
    if (imageData && imageData.data && imageData.mediaType && modelConfig?.capabilities?.vision) {
      userContent = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageData.mediaType};base64,${imageData.data}`
          }
        }
      ];
    } else {
      // Text-only content
      userContent = prompt;
    }
    
    messages.push({
      role: 'user',
      content: userContent
    });
    
    // Build request parameters
    const requestParams = {
      model: modelName,
      messages: messages,
      stream: true
    };
    
    // Only add parameters that are explicitly defined in the model config
    if (parameters.temperature !== undefined) {
      requestParams.temperature = parameters.temperature;
    }
    if (parameters.top_p !== undefined) {
      requestParams.top_p = parameters.top_p;
    }
    if (parameters.max_tokens !== undefined) {
      requestParams.max_tokens = parameters.max_tokens;
    }
    
    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 OpenAI Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    if (availableTools && availableTools.length > 0) {
      requestParams.tools = availableTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      console.log(`🔧 OpenAI Service: Added ${requestParams.tools.length} tools to request for model ${modelType}`);
    }
    
    // Make the streaming API call
    const stream = await openai.chat.completions.create(requestParams);
    
    // Track tool calls across streaming chunks
    let toolCalls = [];
    let isCollectingToolCalls = false;
    
    // Process the stream
    for await (const chunk of stream) {
      // Format as SSE event
      const sseData = {
        id: chunk.id || `openai-compatible-${Date.now()}`,
        object: chunk.object || 'chat.completion.chunk',
        created: chunk.created || Math.floor(Date.now() / 1000),
        model: modelType, // Return the requested model ID, not the API model name
        choices: chunk.choices || []
      };
      
      // Check for tool calls in the chunk
      if (chunk.choices?.[0]?.delta?.tool_calls) {
        isCollectingToolCalls = true;
        const deltaToolCalls = chunk.choices[0].delta.tool_calls;
        
        // Merge tool calls
        for (const deltaToolCall of deltaToolCalls) {
          if (deltaToolCall.index !== undefined) {
            if (!toolCalls[deltaToolCall.index]) {
              toolCalls[deltaToolCall.index] = {
                id: deltaToolCall.id,
                type: deltaToolCall.type,
                function: {
                  name: deltaToolCall.function?.name || '',
                  arguments: deltaToolCall.function?.arguments || ''
                }
              };
            } else {
              if (deltaToolCall.function?.name) {
                toolCalls[deltaToolCall.index].function.name += deltaToolCall.function.name;
              }
              if (deltaToolCall.function?.arguments) {
                toolCalls[deltaToolCall.index].function.arguments += deltaToolCall.function.arguments;
              }
            }
          }
        }
        
        // Send the tool call chunk to frontend
        onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
      }
      
      // Check if this is the final chunk or tool calls finish
      if (chunk.choices?.[0]?.finish_reason === 'tool_calls' || (chunk.choices?.[0]?.finish_reason && isCollectingToolCalls)) {
        // If we have tool calls, execute them
        if (isCollectingToolCalls && toolCalls.length > 0) {
          // Execute tool calls
          const toolResults = [];
          
          for (const toolCall of toolCalls) {
            if (toolCall.function && toolCall.function.name) {
              try {
                const toolsService = await import('./toolsService.js');
                const parameters = JSON.parse(toolCall.function.arguments || '{}');
                const result = await toolsService.default.executeTool(
                  toolCall.function.name, 
                  parameters, 
                  modelType
                );
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: JSON.stringify(result)
                });
              } catch (error) {
                console.error(`Error executing tool ${toolCall.function.name}:`, error);
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: JSON.stringify({ error: error.message })
                });
              }
            }
          }
          
          // If we have tool results, make a follow-up streaming call
          if (toolResults.length > 0) {
            const messagesWithResults = [
              ...requestParams.messages,
              {
                role: 'assistant',
                content: null,
                tool_calls: toolCalls
              },
              ...toolResults
            ];
            
            const followUpParams = {
              ...requestParams,
              messages: messagesWithResults
            };
            
            // Make follow-up streaming call
            const followUpStream = await openai.chat.completions.create(followUpParams);
            
            for await (const followUpChunk of followUpStream) {
              const followUpSseData = {
                id: followUpChunk.id || `openai-compatible-follow-${Date.now()}`,
                object: followUpChunk.object || 'chat.completion.chunk',
                created: followUpChunk.created || Math.floor(Date.now() / 1000),
                model: modelType,
                choices: followUpChunk.choices || []
              };
              
              if (followUpChunk.choices?.[0]?.finish_reason) {
                onChunk(`data: ${JSON.stringify(followUpSseData)}\n\n`);
                onChunk('data: [DONE]\n\n');
                return;
              } else {
                const hasContent = followUpChunk.choices?.[0]?.delta?.content;
                if (hasContent) {
                  onChunk(`data: ${JSON.stringify(followUpSseData)}\n\n`);
                }
              }
            }
          }
        }
        
        // Only send done if we're not handling tool calls
        if (!isCollectingToolCalls) {
          onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
          onChunk('data: [DONE]\n\n');
        }
        break;
      } else {
        // Only send chunks with content (tool calls are handled above)
        const hasContent = chunk.choices?.[0]?.delta?.content;
        
        if (hasContent) {
          onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error in OpenAI-compatible streaming:', error);
    throw error;
  }
};

/**
 * Process a streaming OpenAI chat request
 */
export const streamOpenAIChat = async (modelType, prompt, imageData = null, systemPrompt = null, onChunk, conversationHistory = []) => {
  try {
    const openai = initializeOpenAIClient();
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing streaming OpenAI request with model: ${modelName}`);
    
    // Get model config to retrieve parameters
    const modelConfig = modelConfigService.getModelConfig(modelType);
    const parameters = modelConfig?.parameters || {};
    
    // Build messages array
    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Prepare content for the user message
    let userContent;
    
    // Check if we have image data (for vision models)
    if (imageData && imageData.data && imageData.mediaType && modelConfig?.capabilities?.vision) {
      userContent = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageData.mediaType};base64,${imageData.data}`
          }
        }
      ];
    } else {
      // Text-only content
      userContent = prompt;
    }
    
    messages.push({
      role: 'user',
      content: userContent
    });
    
    // Build request parameters
    const requestParams = {
      model: modelName,
      messages: messages,
      stream: true
    };
    
    // Only add parameters that are explicitly defined in the model config
    if (parameters.temperature !== undefined) {
      requestParams.temperature = parameters.temperature;
    }
    if (parameters.top_p !== undefined) {
      requestParams.top_p = parameters.top_p;
    }
    if (parameters.frequency_penalty !== undefined) {
      requestParams.frequency_penalty = parameters.frequency_penalty;
    }
    if (parameters.presence_penalty !== undefined) {
      requestParams.presence_penalty = parameters.presence_penalty;
    }
    
    // Handle max_tokens vs max_completion_tokens based on model requirements
    if (parameters.max_completion_tokens !== undefined) {
      requestParams.max_completion_tokens = parameters.max_completion_tokens;
    } else if (parameters.max_tokens !== undefined) {
      requestParams.max_tokens = parameters.max_tokens;
    }
    
    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 OpenAI Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    if (availableTools && availableTools.length > 0) {
      requestParams.tools = availableTools.map(tool => ({
        type: 'function',
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      console.log(`🔧 OpenAI Service: Added ${requestParams.tools.length} tools to request for model ${modelType}`);
    }
    
    // Make the streaming API call
    const stream = await openai.chat.completions.create(requestParams);
    
    // Track tool calls across streaming chunks
    let toolCalls = [];
    let isCollectingToolCalls = false;
    
    // Process the stream
    for await (const chunk of stream) {
      // Format as SSE event
      const sseData = {
        id: chunk.id || `openai-${Date.now()}`,
        object: chunk.object || 'chat.completion.chunk',
        created: chunk.created || Math.floor(Date.now() / 1000),
        model: modelType, // Return the requested model ID, not the API model name
        choices: chunk.choices || []
      };
      
      // Check for tool calls in the chunk
      if (chunk.choices?.[0]?.delta?.tool_calls) {
        isCollectingToolCalls = true;
        const deltaToolCalls = chunk.choices[0].delta.tool_calls;
        
        // Merge tool calls
        for (const deltaToolCall of deltaToolCalls) {
          if (deltaToolCall.index !== undefined) {
            if (!toolCalls[deltaToolCall.index]) {
              toolCalls[deltaToolCall.index] = {
                id: deltaToolCall.id,
                type: deltaToolCall.type,
                function: {
                  name: deltaToolCall.function?.name || '',
                  arguments: deltaToolCall.function?.arguments || ''
                }
              };
            } else {
              if (deltaToolCall.function?.name) {
                toolCalls[deltaToolCall.index].function.name += deltaToolCall.function.name;
              }
              if (deltaToolCall.function?.arguments) {
                toolCalls[deltaToolCall.index].function.arguments += deltaToolCall.function.arguments;
              }
            }
          }
        }
        
        // Send the tool call chunk to frontend
        onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
      }
      
      // Check if this is the final chunk or tool calls finish
      if (chunk.choices?.[0]?.finish_reason === 'tool_calls' || (chunk.choices?.[0]?.finish_reason && isCollectingToolCalls)) {
        // If we have tool calls, execute them
        if (isCollectingToolCalls && toolCalls.length > 0) {
          // Execute tool calls
          const toolResults = [];
          
          for (const toolCall of toolCalls) {
            if (toolCall.function && toolCall.function.name) {
              try {
                const toolsService = await import('./toolsService.js');
                const parameters = JSON.parse(toolCall.function.arguments || '{}');
                const result = await toolsService.default.executeTool(
                  toolCall.function.name, 
                  parameters, 
                  modelType
                );
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: JSON.stringify(result)
                });
              } catch (error) {
                console.error(`Error executing tool ${toolCall.function.name}:`, error);
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: JSON.stringify({ error: error.message })
                });
              }
            }
          }
          
          // If we have tool results, make a follow-up streaming call
          if (toolResults.length > 0) {
            const messagesWithResults = [
              ...requestParams.messages,
              {
                role: 'assistant',
                content: null,
                tool_calls: toolCalls
              },
              ...toolResults
            ];
            
            const followUpParams = {
              ...requestParams,
              messages: messagesWithResults
            };
            
            // Make follow-up streaming call
            const followUpStream = await openai.chat.completions.create(followUpParams);
            
            for await (const followUpChunk of followUpStream) {
              const followUpSseData = {
                id: followUpChunk.id || `openai-follow-${Date.now()}`,
                object: followUpChunk.object || 'chat.completion.chunk',
                created: followUpChunk.created || Math.floor(Date.now() / 1000),
                model: modelType,
                choices: followUpChunk.choices || []
              };
              
              if (followUpChunk.choices?.[0]?.finish_reason) {
                onChunk(`data: ${JSON.stringify(followUpSseData)}\n\n`);
                onChunk('data: [DONE]\n\n');
                return;
              } else {
                const hasContent = followUpChunk.choices?.[0]?.delta?.content;
                if (hasContent) {
                  onChunk(`data: ${JSON.stringify(followUpSseData)}\n\n`);
                }
              }
            }
          }
        }
        
        // Only send done if we're not handling tool calls
        if (!isCollectingToolCalls) {
          onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
          onChunk('data: [DONE]\n\n');
        }
        break;
      } else {
        // Only send chunks with content (tool calls are handled above)
        const hasContent = chunk.choices?.[0]?.delta?.content;
        
        if (hasContent) {
          onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error in OpenAI streaming:', error);
    throw error;
  }
};

/**
 * Get available OpenAI models
 */
export const getOpenAIModels = () => {
  return [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      source: 'openai',
      context_length: 128000,
      capabilities: ['text', 'vision'],
      isBackendModel: true
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      source: 'openai',
      context_length: 128000,
      capabilities: ['text', 'vision'],
      isBackendModel: true
    },
    {
      id: 'openai/o3',
      name: 'ChatGPT o3',
      provider: 'openai',
      source: 'openai',
      context_length: 200000,
      capabilities: ['text', 'reasoning'],
      isBackendModel: true
    },
    {
      id: 'openai/o3-mini',
      name: 'ChatGPT o3-mini',
      provider: 'openai',
      source: 'openai',
      context_length: 65536,
      capabilities: ['text', 'reasoning'],
      isBackendModel: true
    },
    {
      id: 'openai/o4-mini',
      name: 'o4 Mini',
      provider: 'openai',
      source: 'openai',
      context_length: 16384,
      capabilities: ['text', 'reasoning'],
      isBackendModel: true
    }
  ];
}; 