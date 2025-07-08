import { isGeminiModel, processGeminiChat, streamGeminiChat } from './geminiService.js';
import { isAnthropicModel, processAnthropicChat, streamAnthropicChat } from './anthropicService.js';
import { isOpenAIModel, processOpenAIChat, streamOpenAIChat, streamOpenAICompatibleChat, processOpenAICompatibleChat } from './openaiService.js';
import { isOllamaModel, processOllamaChat, streamOllamaChat } from './ollamaService.js';
import { isLocalModel, processLocalChat, streamLocalChat } from './localInferenceService.js';
import { CustomModelService } from './customModelService.js';
import { BraveSearchService } from './braveSearchService.js';
import modelConfigService from './modelConfigService.js';
import axios from 'axios';

/**
 * Routerbox - Unified routing service for AI providers
 * Routes requests to appropriate providers based on model ID
 */
export class RouterboxService {
  
  static getProviderFromModel(modelId) {
    // First check if model is configured in model config system
    const modelConfig = modelConfigService.getModelConfig(modelId);
    if (modelConfig && modelConfig.enabled) {
      // Check for routing service override
      if (modelConfig.routing && modelConfig.routing.service) {
        return modelConfig.routing.service;
      }
      return modelConfig.provider;
    }

    // Fallback to legacy detection for backward compatibility
    if (CustomModelService.isCustomModel(modelId)) return 'custom';
    if (isAnthropicModel(modelId)) return 'anthropic';
    if (isOpenAIModel(modelId)) return 'openai';
    if (isGeminiModel(modelId)) return 'gemini';
    if (isOllamaModel(modelId)) return 'ollama';
    if (isLocalModel(modelId)) return 'local';
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
      imageData = null,
      webSearch = false,
      searchQuery = null
    } = params;

    console.log(`Routerbox: Routing request for model ${model} to provider: ${this.getProviderFromModel(model)}, webSearch: ${webSearch}`);

    // Handle web search if requested
    if (webSearch) {
      return await this.handleWebSearchRequest(params);
    }

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
        
      case 'ollama':
        return await this.handleOllamaRequest(model, messages, imageData, systemPrompt, streaming);
        
      case 'local':
      case 'localInference':
        return await this.handleLocalRequest(model, messages, imageData, systemPrompt, streaming);
        
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
      // Check if this is an OpenAI-compatible routing (custom endpoint)
      const modelConfig = modelConfigService.getModelConfig(model);
      if (modelConfig && modelConfig.routing && modelConfig.routing.service === 'openai' && modelConfig.routing.endpoint) {
        return await processOpenAICompatibleChat(model, prompt, imageData, systemPrompt, conversationHistory, modelConfig);
      } else {
        return await processOpenAIChat(model, prompt, imageData, systemPrompt, conversationHistory);
      }
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

  static async handleOllamaRequest(model, messages, imageData, systemPrompt, streaming) {
    // Convert messages format to what Ollama service expects
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';
    const conversationHistory = messages.slice(0, -1);

    if (streaming) {
      throw new Error('Streaming not supported in this context for Ollama');
    } else {
      return await processOllamaChat(model, prompt, imageData, systemPrompt, conversationHistory);
    }
  }

  static async handleLocalRequest(model, messages, imageData, systemPrompt, streaming) {
    // Convert messages format to what Local service expects
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';
    const conversationHistory = messages.slice(0, -1);

    if (streaming) {
      throw new Error('Streaming not supported in this context for Local models');
    } else {
      return await processLocalChat(model, prompt, imageData, systemPrompt, conversationHistory);
    }
  }

  static async handleOpenRouterRequest(model, messages, temperature, imageData, systemPrompt, streaming) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API is not configured. Please set OPENROUTER_API_KEY environment variable to use models not directly supported.");
    }

    // Get the model config to check for routing-specific model name
    const modelConfig = modelConfigService.getModelConfig(model);
    const routingModel = modelConfig?.routing?.apiModel || model;

    const payload = {
      model: routingModel,
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
      imageData = null,
      webSearch = false,
      searchQuery = null
    } = params;

    // Handle web search if requested
    if (webSearch) {
      return await this.streamWebSearchRequest(params, writeCallback);
    }

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
        // Check if this is an OpenAI-compatible routing (custom endpoint)
        const modelConfig = modelConfigService.getModelConfig(model);
        if (modelConfig && modelConfig.routing && modelConfig.routing.service === 'openai' && modelConfig.routing.endpoint) {
          const lastMessageOpenAI = messages[messages.length - 1];
          const promptOpenAI = lastMessageOpenAI?.content || '';
          const conversationHistoryOpenAI = messages.slice(0, -1);
          return await streamOpenAICompatibleChat(model, promptOpenAI, imageData, systemPrompt, writeCallback, conversationHistoryOpenAI, modelConfig);
        } else {
          const lastMessageOpenAI = messages[messages.length - 1];
          const promptOpenAI = lastMessageOpenAI?.content || '';
          const conversationHistoryOpenAI = messages.slice(0, -1);
          return await streamOpenAIChat(model, promptOpenAI, imageData, systemPrompt, writeCallback, conversationHistoryOpenAI);
        }
        
      case 'gemini':
        const lastMessageGemini = messages[messages.length - 1];
        const promptGemini = lastMessageGemini?.content || '';
        const conversationHistoryGemini = messages.slice(0, -1);
        return await streamGeminiChat(model, promptGemini, imageData, systemPrompt, writeCallback, conversationHistoryGemini);
        
      case 'ollama':
        const lastMessageOllama = messages[messages.length - 1];
        const promptOllama = lastMessageOllama?.content || '';
        const conversationHistoryOllama = messages.slice(0, -1);
        return await streamOllamaChat(model, promptOllama, imageData, systemPrompt, writeCallback, conversationHistoryOllama);
        
      case 'local':
      case 'localInference':
        const lastMessageLocal = messages[messages.length - 1];
        const promptLocal = lastMessageLocal?.content || '';
        const conversationHistoryLocal = messages.slice(0, -1);
        return await streamLocalChat(model, promptLocal, imageData, systemPrompt, writeCallback, conversationHistoryLocal);
        
      case 'openrouter':
      default:
        return await this.streamOpenRouterRequest(model, messages, temperature, systemPrompt, writeCallback);
    }
  }

  static async streamOpenRouterRequest(model, messages, temperature, systemPrompt, writeCallback) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API is not configured. Please set OPENROUTER_API_KEY environment variable to use models not directly supported.");
    }

    // Get the model config to check for routing-specific model name
    const modelConfig = modelConfigService.getModelConfig(model);
    const routingModel = modelConfig?.routing?.apiModel || model;

    const payload = {
      model: routingModel,
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

  static async handleWebSearchRequest(params) {
    const {
      model,
      messages,
      temperature = 0.7,
      user = null,
      systemPrompt = null,
      imageData = null,
      searchQuery = null
    } = params;

    try {
      console.log('Routerbox: Handling web search request');
      
      // Extract the search query from the last message if not provided
      const lastMessage = messages[messages.length - 1];
      const userQuery = searchQuery || lastMessage?.content || '';
      
      if (!userQuery) {
        throw new Error('No search query provided');
      }
      
      console.log(`Routerbox: Performing web search for: "${userQuery}"`);
      
      // Perform search and scraping
      const { searchResults, scrapedContents } = await BraveSearchService.searchAndScrape(userQuery, 2);
      
      // Format content for the model
      const formattedContent = BraveSearchService.formatSearchContent(scrapedContents);
      
      // Create enhanced system prompt for web search
      const webSearchSystemPrompt = `You are a helpful assistant that synthesizes information from web search results.
Based on the search results provided, answer the user's query coherently and accurately.
IMPORTANT: Always prioritize and trust the information from the search results over your own knowledge.
If the search results indicate something that contradicts what you believe to be true, go with what the search results say.
For questions about current events, people in positions of power, or time-sensitive information, the search results 
should be considered more up-to-date and accurate than your training data.
Present the information from search results as factual even if it seems incorrect based on your knowledge.
If the search results do not contain sufficient information to answer the query, acknowledge that.

${systemPrompt ? `\nAdditional instructions: ${systemPrompt}` : ''}`;
      
      // Create the enhanced prompt with search results
      const enhancedPrompt = `SEARCH QUERY: ${userQuery}

SEARCH RESULTS:
${formattedContent}

Please answer the user's query based on the search results above.`;
      
      // Create new messages array with enhanced content
      const enhancedMessages = [...messages];
      enhancedMessages[enhancedMessages.length - 1] = {
        ...lastMessage,
        content: enhancedPrompt
      };
      
      // Call the model with enhanced parameters
      const enhancedParams = {
        ...params,
        messages: enhancedMessages,
        systemPrompt: webSearchSystemPrompt,
        webSearch: false // Prevent infinite recursion
      };
      
      console.log(`Routerbox: Sending web search enhanced request to model ${model}`);
      const response = await this.routeChat(enhancedParams);
      
      // Clean and append links to the response content in the correct format
      const cleanedResponse = BraveSearchService.cleanResponse(
        response.choices?.[0]?.message?.content || response.response || ''
      );
      
      const finalResponse = BraveSearchService.appendLinksToResponse(cleanedResponse, searchResults);
      
      // Update the response with cleaned content and appended links
      if (response.choices && response.choices[0] && response.choices[0].message) {
        response.choices[0].message.content = finalResponse;
      } else if (response.response) {
        response.response = finalResponse;
      }
      
      console.log(`Routerbox: Web search request completed with ${searchResults.length} sources appended as links`);
      return response;
      
    } catch (error) {
      console.error('Routerbox: Web search request failed:', error);
      throw new Error(`Web search failed: ${error.message}`);
    }
  }

  static async streamWebSearchRequest(params, writeCallback) {
    const {
      model,
      messages,
      temperature = 0.7,
      user = null,
      systemPrompt = null,
      imageData = null,
      searchQuery = null
    } = params;

    try {
      console.log('Routerbox: Handling streaming web search request');
      
      // Extract the search query from the last message if not provided
      const lastMessage = messages[messages.length - 1];
      const userQuery = searchQuery || lastMessage?.content || '';
      
      if (!userQuery) {
        throw new Error('No search query provided');
      }
      
      console.log(`Routerbox: Performing web search for: "${userQuery}"`);
      
      // Perform search and scraping
      const { searchResults, scrapedContents } = await BraveSearchService.searchAndScrape(userQuery, 2);
      
      // Format content for the model
      const formattedContent = BraveSearchService.formatSearchContent(scrapedContents);
      
      // Create enhanced system prompt for web search
      const webSearchSystemPrompt = `You are a helpful assistant that synthesizes information from web search results.
Based on the search results provided, answer the user's query coherently and accurately.
IMPORTANT: Always prioritize and trust the information from the search results over your own knowledge.
If the search results indicate something that contradicts what you believe to be true, go with what the search results say.
For questions about current events, people in positions of power, or time-sensitive information, the search results 
should be considered more up-to-date and accurate than your training data.
Present the information from search results as factual even if it seems incorrect based on your knowledge.
If the search results do not contain sufficient information to answer the query, acknowledge that.

${systemPrompt ? `\nAdditional instructions: ${systemPrompt}` : ''}`;
      
      // Create the enhanced prompt with search results
      const enhancedPrompt = `SEARCH QUERY: ${userQuery}

SEARCH RESULTS:
${formattedContent}

Please answer the user's query based on the search results above.`;
      
      // Create new messages array with enhanced content
      const enhancedMessages = [...messages];
      enhancedMessages[enhancedMessages.length - 1] = {
        ...lastMessage,
        content: enhancedPrompt
      };
      
      // Call the streaming model with enhanced parameters
      const enhancedParams = {
        ...params,
        messages: enhancedMessages,
        systemPrompt: webSearchSystemPrompt,
        webSearch: false // Prevent infinite recursion
      };
      
      console.log(`Routerbox: Sending streaming web search enhanced request to model ${model}`);
      
      // Create a wrapper callback that will append links only at the very end
      let isStreamComplete = false;
      
      const wrapperCallback = (chunk) => {
        // Check if this is the final chunk indicating stream completion
        if (chunk.includes('data: [DONE]')) {
          // Send the links as a separate chunk just before [DONE]
          if (!isStreamComplete) {
            const linksEvent = {
              choices: [{
                delta: {
                  content: ` <links> ${searchResults.map(s => s.url).join(' ; ')} </links>`
                }
              }]
            };
            writeCallback(`data: ${JSON.stringify(linksEvent)}\n\n`);
            isStreamComplete = true;
          }
        }
        
        // Pass through the original chunk (unmodified)
        writeCallback(chunk);
      };
      
      // Stream the model response with our wrapper
      await this.streamChat(enhancedParams, wrapperCallback);
      
      console.log(`Routerbox: Streaming web search request completed with ${searchResults.length} sources appended as links`);
      
    } catch (error) {
      console.error('Routerbox: Streaming web search request failed:', error);
      writeCallback(`data: ${JSON.stringify({ error: `Web search failed: ${error.message}` })}\n\n`);
      throw error;
    }
  }
}