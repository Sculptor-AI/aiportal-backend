import Anthropic from '@anthropic-ai/sdk';
import modelConfigService from './modelConfigService.js';

/**
 * Initialize Anthropic client
 */
const initializeAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured in environment variables");
  }
  
  return new Anthropic({
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
 * Check if a model is an Anthropic model
 */
export const isAnthropicModel = (modelId) => {
  // First check model config
  const modelConfig = modelConfigService.getModelConfig(modelId);
  if (modelConfig && modelConfig.provider === 'anthropic') {
    return true;
  }
  // Fallback to prefix check for backward compatibility
  return modelId.startsWith('claude-') || modelId.startsWith('anthropic/claude');
};

/**
 * Process a non-streaming Anthropic chat request
 */
export const processAnthropicChat = async (modelType, prompt, imageData = null, systemPrompt = null, conversationHistory = []) => {
  try {
    const anthropic = initializeAnthropicClient();
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing Anthropic request with model: ${modelName}`);
    
    // Build messages array
    const messages = [];
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Prepare content for the current message
    const content = [];
    
    // Add text prompt
    content.push({
      type: 'text',
      text: prompt
    });
    
    // Add image if provided
    if (imageData && imageData.data && imageData.mediaType) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageData.mediaType,
          data: imageData.data
        }
      });
    }
    
    messages.push({
      role: 'user',
      content: content
    });
    
    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 Anthropic Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    
    const requestParams = {
      model: modelName,
      messages: messages,
      system: systemPrompt || undefined,
      max_tokens: 4096,
    };
    
    if (availableTools && availableTools.length > 0) {
      requestParams.tools = availableTools.map(tool => ({
        name: tool.id,
        description: tool.description,
        input_schema: tool.parameters
      }));
      console.log(`🔧 Anthropic Service: Added ${requestParams.tools.length} tools to request for model ${modelType}`);
    }
    
    // Make the API call
    const completion = await anthropic.messages.create(requestParams);
    
    // Check for tool calls and execute them
    if (completion.content && completion.content.some(block => block.type === 'tool_use')) {
      const toolUseBlocks = completion.content.filter(block => block.type === 'tool_use');
      const toolResults = [];
      
      for (const toolUse of toolUseBlocks) {
        try {
          const toolsService = await import('./toolsService.js');
          const result = await toolsService.default.executeTool(
            toolUse.name, 
            toolUse.input || {}, 
            modelType
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        } catch (error) {
          console.error(`Error executing tool ${toolUse.name}:`, error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: error.message })
          });
        }
      }
      
      // If we have tool results, make another API call with the results
      if (toolResults.length > 0) {
        const messagesWithResults = [
          ...requestParams.messages,
          {
            role: 'assistant',
            content: completion.content
          },
          {
            role: 'user',
            content: toolResults
          }
        ];
        
        const followUpParams = {
          ...requestParams,
          messages: messagesWithResults
        };
        
        const followUpResponse = await anthropic.messages.create(followUpParams);
        
        // Return the follow-up response
        return {
          id: followUpResponse.id,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelType,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: followUpResponse.content.map(block => block.text || '').join('') || ''
            },
            finish_reason: followUpResponse.stop_reason || 'stop'
          }],
          usage: {
            prompt_tokens: (completion.usage?.input_tokens || 0) + (followUpResponse.usage?.input_tokens || 0),
            completion_tokens: (completion.usage?.output_tokens || 0) + (followUpResponse.usage?.output_tokens || 0),
            total_tokens: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0) + (followUpResponse.usage?.input_tokens || 0) + (followUpResponse.usage?.output_tokens || 0)
          }
        };
      }
    }
    
    // Format response to match OpenRouter format for consistency
    return {
      id: completion.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelType, // Return the requested model ID, not the API model name
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: completion.content.map(block => block.text || '').join('') || ''
        },
        finish_reason: completion.stop_reason || 'stop'
      }],
      usage: {
        prompt_tokens: completion.usage?.input_tokens || 0,
        completion_tokens: completion.usage?.output_tokens || 0,
        total_tokens: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0)
      }
    };
  } catch (error) {
    console.error('Error in Anthropic chat processing:', error);
    throw error;
  }
};

/**
 * Process a streaming Anthropic chat request
 */
export const streamAnthropicChat = async (modelType, prompt, imageData = null, systemPrompt = null, onChunk, conversationHistory = []) => {
  try {
    const anthropic = initializeAnthropicClient();
    const modelName = getApiModelName(modelType);
    
    console.log(`Processing streaming Anthropic request with model: ${modelName}`);
    
    // Build messages array
    const messages = [];
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Prepare content for the current message
    const content = [];
    
    // Add text prompt
    content.push({
      type: 'text',
      text: prompt
    });
    
    // Add image if provided
    if (imageData && imageData.data && imageData.mediaType) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageData.mediaType,
          data: imageData.data
        }
      });
    }
    
    messages.push({
      role: 'user',
      content: content
    });
    
    // Add tools if available for this model
    const availableTools = modelConfigService.getToolsForModel(modelType);
    console.log(`🔧 Anthropic Service: Available tools for model ${modelType}:`, availableTools?.length || 0);
    
    const requestParams = {
      model: modelName,
      messages: messages,
      system: systemPrompt || undefined,
      max_tokens: 4096,
      stream: true,
    };
    
    if (availableTools && availableTools.length > 0) {
      requestParams.tools = availableTools.map(tool => ({
        name: tool.id,
        description: tool.description,
        input_schema: tool.parameters
      }));
      console.log(`🔧 Anthropic Service: Added ${requestParams.tools.length} tools to request for model ${modelType}`);
    }
    
    // Make the streaming API call
    const stream = await anthropic.messages.create(requestParams);
    
    // Track tool uses for potential execution
    let toolUses = [];
    let fullContent = [];
    
    // Process the stream
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        // Format as SSE event matching OpenRouter format
        const sseData = {
          id: `anthropic-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelType, // Return the requested model ID, not the API model name
          choices: [{
            index: 0,
            delta: {
              content: event.delta.text
            },
            finish_reason: null
          }]
        };
        
        onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        // Track tool use
        toolUses.push(event.content_block);
      } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        // Update tool use input as it streams
        const toolUse = toolUses[event.index];
        if (toolUse) {
          toolUse.input = (toolUse.input || '') + event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop' && event.index !== undefined) {
        // Tool use is complete, parse the input
        const toolUse = toolUses[event.index];
        if (toolUse && toolUse.input) {
          try {
            toolUse.input = JSON.parse(toolUse.input);
          } catch (error) {
            console.error('Error parsing tool input:', error);
          }
        }
      } else if (event.type === 'message_stop') {
        // Message is complete - execute any tools
        if (toolUses.length > 0) {
          const toolResults = [];
          
          for (const toolUse of toolUses) {
            try {
              const toolsService = await import('./toolsService.js');
              const result = await toolsService.default.executeTool(
                toolUse.name, 
                toolUse.input || {}, 
                modelType
              );
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result)
              });
            } catch (error) {
              console.error(`Error executing tool ${toolUse.name}:`, error);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: error.message })
              });
            }
          }
          
          // If we have tool results, make a follow-up streaming call
          if (toolResults.length > 0) {
            const messagesWithResults = [
              ...requestParams.messages,
              {
                role: 'assistant',
                content: [...fullContent, ...toolUses]
              },
              {
                role: 'user',
                content: toolResults
              }
            ];
            
            const followUpParams = {
              ...requestParams,
              messages: messagesWithResults
            };
            
            const followUpStream = await anthropic.messages.create(followUpParams);
            
            for await (const followUpEvent of followUpStream) {
              if (followUpEvent.type === 'content_block_delta' && followUpEvent.delta.type === 'text_delta') {
                const followUpSseData = {
                  id: `anthropic-follow-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: modelType,
                  choices: [{
                    index: 0,
                    delta: {
                      content: followUpEvent.delta.text
                    },
                    finish_reason: null
                  }]
                };
                
                onChunk(`data: ${JSON.stringify(followUpSseData)}\n\n`);
              } else if (followUpEvent.type === 'message_stop') {
                onChunk('data: [DONE]\n\n');
                return;
              }
            }
          }
        }
        
        // Send the final done message if no tools were executed
        onChunk('data: [DONE]\n\n');
        return;
      }
      
      // Track all content for potential tool execution
      if (event.type === 'content_block_start') {
        fullContent.push(event.content_block);
      }
    }
    
  } catch (error) {
    console.error('Error in Anthropic streaming:', error);
    throw error;
  }
};

/**
 * Get available Anthropic models
 */
export const getAnthropicModels = () => {
  return [
    {
      id: 'anthropic/claude-4-opus',
      name: 'Claude 4 Opus',
      provider: 'anthropic',
      source: 'anthropic',
      context_length: 200000,
      capabilities: ['text', 'vision'],
      isBackendModel: true
    },
    {
      id: 'anthropic/claude-4-sonnet',
      name: 'Claude 4 Sonnet',
      provider: 'anthropic',
      source: 'anthropic',
      context_length: 200000,
      capabilities: ['text', 'vision'],
      isBackendModel: true
    },
    {
      id: 'anthropic/claude-4-haiku',
      name: 'Claude 4 Haiku',
      provider: 'anthropic',
      source: 'anthropic',
      context_length: 200000,
      capabilities: ['text', 'vision'],
      isBackendModel: true
    }
  ];
}; 