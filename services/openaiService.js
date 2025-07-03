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
    
    // Make the API call
    const completion = await openai.chat.completions.create(requestParams);
    
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
    
    // Make the streaming API call
    const stream = await openai.chat.completions.create(requestParams);
    
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
      
      // Check if this is the final chunk
      if (chunk.choices[0]?.finish_reason) {
        onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
        onChunk('data: [DONE]\n\n');
      } else {
        onChunk(`data: ${JSON.stringify(sseData)}\n\n`);
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