import { isGeminiModel, processGeminiChat, streamGeminiChat } from './geminiService.js';
import { isAnthropicModel, processAnthropicChat, streamAnthropicChat } from './anthropicService.js';
import { isOpenAIModel, processOpenAIChat, streamOpenAIChat } from './openaiService.js';
import { CustomModelService } from './customModelService.js';
import axios from 'axios';

/**
 * Routerbox - Unified routing service for AI providers
 * Routes requests to appropriate providers based on model ID
 */
export class RouterboxService {
  
  static getProviderFromModel(modelId) {
    if (CustomModelService.isCustomModel(modelId)) return 'custom';
    if (isAnthropicModel(modelId)) return 'anthropic';
    if (isOpenAIModel(modelId)) return 'openai';
    if (isGeminiModel(modelId)) return 'gemini';
    return 'openrouter'; // Default fallback
  }

  static async routeChat(params) {
    const {
      model,
      messages,
      temperature = 0.7,
      user = null,
      streaming = false,
      systemPrompt = null,
      imageData = null
    } = params;

    console.log(`Routerbox: Routing request for model ${model} to provider: ${this.getProviderFromModel(model)}`);

    // Route to appropriate provider
    const provider = this.getProviderFromModel(model);
    
    switch (provider) {
      case 'custom':
        return await CustomModelService.routeCustomModel(params);
        
      case 'anthropic':
        return await this.handleAnthropicRequest(model, messages, imageData, systemPrompt, streaming);
        
      case 'openai':
        return await this.handleOpenAIRequest(model, messages, imageData, systemPrompt, streaming);
        
      case 'gemini':
        return await this.handleGeminiRequest(model, messages, imageData, systemPrompt, streaming);
        
      case 'openrouter':
      default:
        return await this.handleOpenRouterRequest(model, messages, temperature, imageData, systemPrompt, streaming);
    }
  }

  static async handleAnthropicRequest(model, messages, imageData, systemPrompt, streaming) {
    // Convert messages format to what Anthropic service expects
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';
    const conversationHistory = messages.slice(0, -1);

    if (streaming) {
      throw new Error('Streaming not supported in this context for Anthropic');
    } else {
      return await processAnthropicChat(model, prompt, imageData, systemPrompt, conversationHistory);
    }
  }

  static async handleOpenAIRequest(model, messages, imageData, systemPrompt, streaming) {
    // Convert messages format to what OpenAI service expects
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';
    const conversationHistory = messages.slice(0, -1);

    if (streaming) {
      throw new Error('Streaming not supported in this context for OpenAI');
    } else {
      return await processOpenAIChat(model, prompt, imageData, systemPrompt, conversationHistory);
    }
  }

  static async handleGeminiRequest(model, messages, imageData, systemPrompt, streaming) {
    // Convert messages format to what Gemini service expects
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';
    const conversationHistory = messages.slice(0, -1);

    if (streaming) {
      throw new Error('Streaming not supported in this context for Gemini');
    } else {
      return await processGeminiChat(model, prompt, imageData, systemPrompt, conversationHistory);
    }
  }

  static async handleOpenRouterRequest(model, messages, temperature, imageData, systemPrompt, streaming) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API is not configured. Please set OPENROUTER_API_KEY environment variable to use models not directly supported.");
    }

    const payload = {
      model: model,
      messages: [],
      temperature: temperature,
      stream: streaming
    };

    // Add system prompt if provided
    if (systemPrompt) {
      payload.messages.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation messages
    payload.messages.push(...messages);

    const headers = {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aiportal.com',
      'X-Title': 'AI Portal'
    };

    const config = {
      headers,
      ...(streaming && { responseType: 'stream' })
    };

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, config);
    
    return response.data;
  }

  static normalizeResponse(response, provider) {
    // Normalize responses from different providers to a consistent format
    switch (provider) {
      case 'anthropic':
      case 'openai':
      case 'gemini':
        return response; // These are already normalized by their respective services
        
      case 'openrouter':
      default:
        return response; // OpenRouter uses OpenAI-compatible format
    }
  }

  static async streamChat(params, writeCallback) {
    const {
      model,
      messages,
      temperature = 0.7,
      user = null,
      systemPrompt = null,
      imageData = null
    } = params;

    const provider = this.getProviderFromModel(model);
    
    switch (provider) {
      case 'custom':
        return await CustomModelService.streamCustomModel(params, writeCallback);
        
      case 'anthropic':
        const lastMessage = messages[messages.length - 1];
        const prompt = lastMessage?.content || '';
        const conversationHistory = messages.slice(0, -1);
        return await streamAnthropicChat(model, prompt, imageData, systemPrompt, writeCallback, conversationHistory);
        
      case 'openai':
        const lastMessageOpenAI = messages[messages.length - 1];
        const promptOpenAI = lastMessageOpenAI?.content || '';
        const conversationHistoryOpenAI = messages.slice(0, -1);
        return await streamOpenAIChat(model, promptOpenAI, imageData, systemPrompt, writeCallback, conversationHistoryOpenAI);
        
      case 'gemini':
        const lastMessageGemini = messages[messages.length - 1];
        const promptGemini = lastMessageGemini?.content || '';
        const conversationHistoryGemini = messages.slice(0, -1);
        return await streamGeminiChat(model, promptGemini, imageData, systemPrompt, writeCallback, conversationHistoryGemini);
        
      case 'openrouter':
      default:
        return await this.streamOpenRouterRequest(model, messages, temperature, systemPrompt, writeCallback);
    }
  }

  static async streamOpenRouterRequest(model, messages, temperature, systemPrompt, writeCallback) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API is not configured. Please set OPENROUTER_API_KEY environment variable to use models not directly supported.");
    }

    const payload = {
      model: model,
      messages: [],
      temperature: temperature,
      stream: true
    };

    // Add system prompt if provided
    if (systemPrompt) {
      payload.messages.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation messages
    payload.messages.push(...messages);

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aiportal.com',
        'X-Title': 'AI Portal'
      },
      responseType: 'stream'
    });

    // Pipe the OpenRouter response through the callback
    response.data.on('data', (chunk) => {
      writeCallback(chunk.toString());
    });

    return new Promise((resolve, reject) => {
      response.data.on('end', () => resolve());
      response.data.on('error', reject);
    });
  }
}