import { GoogleGenerativeAI } from "@google/generative-ai";

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
 * Map frontend model IDs to Gemini model names
 */
const mapToGeminiModel = (modelId) => {
  const modelMappings = {
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'google/gemini-2.5-flash': 'gemini-2.5-flash',
    'google/gemini-2.0-flash': 'gemini-2.5-flash',
    'gemini-2.0-flash': 'gemini-2.5-flash',

    'gemini-2.5-pro': 'gemini-2.5-pro',
    'google/gemini-2.5-pro': 'gemini-2.5-pro',
    'google/gemini-pro': 'gemini-2.5-pro',
    'google/gemini-pro-vision': 'gemini-2.5-pro',
    'gemini-pro': 'gemini-2.5-pro',
  };
  
  return modelMappings[modelId] || modelId;
};

/**
 * Check if a model is a Gemini model
 */
export const isGeminiModel = (modelId) => {
  return modelId.startsWith('gemini-') || modelId.startsWith('google/gemini');
};

/**
 * Process a non-streaming Gemini chat request
 */
export const processGeminiChat = async (modelType, prompt, imageData = null, systemPrompt = null, conversationHistory = []) => {
  try {
    const genAI = initializeGeminiClient();
    if (!genAI) {
      throw new Error("Gemini API is not configured. Please set GEMINI_API_KEY environment variable.");
    }
    
    const modelName = mapToGeminiModel(modelType);
    
    console.log(`Processing Gemini request with model: ${modelName}`);
    
    const model = genAI.getGenerativeModel({ model: modelName });
    
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
      const text = response.text();
      
      // Format response to match OpenRouter format for consistency
      return {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
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
        model: modelName,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: -1, // Gemini doesn't provide token counts
          completion_tokens: -1,
          total_tokens: -1
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
export const streamGeminiChat = async (modelType, prompt, imageData = null, systemPrompt = null, onChunk, conversationHistory = []) => {
  try {
    const genAI = initializeGeminiClient();
    if (!genAI) {
      throw new Error("Gemini API is not configured. Please set GEMINI_API_KEY environment variable.");
    }
    
    const modelName = mapToGeminiModel(modelType);
    
    console.log(`Processing streaming Gemini request with model: ${modelName}`);
    
    const model = genAI.getGenerativeModel({ model: modelName });
    
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
          onChunk(`data: ${JSON.stringify({ content: chunkText })}\n\n`);
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
          model: modelName,
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
      pricing: {
        prompt: 0.00001,
        completion: 0.00003
      },
      isBackendModel: true
    },
    {
      id: 'google/gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      source: 'gemini',
      context_length: 1048576,
      capabilities: ['text', 'vision', 'audio'],
      pricing: {
        prompt: 0.0005,
        completion: 0.0015
      },
      isBackendModel: true
    }
  ];
}; 