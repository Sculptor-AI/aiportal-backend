import axios from 'axios';
import { getGeminiModels } from '../services/geminiService.js';
import { getAnthropicModels } from '../services/anthropicService.js';
import { getOpenAIModels } from '../services/openaiService.js';
import { OllamaService } from '../services/ollamaService.js';
import { LocalInferenceService } from '../services/localInferenceService.js';

/**
 * Get the list of available models from OpenRouter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getModels = async (req, res) => {
  try {
    let allModels = [];
    
    // Get Anthropic models if API key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropicModels = getAnthropicModels();
        allModels = [...allModels, ...anthropicModels];
        console.log(`Added ${anthropicModels.length} Anthropic models`);
      } catch (error) {
        console.error('Error getting Anthropic models:', error);
      }
    }
    
    // Get OpenAI models if API key is configured
    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiModels = getOpenAIModels();
        allModels = [...allModels, ...openaiModels];
        console.log(`Added ${openaiModels.length} OpenAI models`);
      } catch (error) {
        console.error('Error getting OpenAI models:', error);
      }
    }
    
    // Get Gemini models if API key is configured
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiModels = getGeminiModels();
        allModels = [...allModels, ...geminiModels];
        console.log(`Added ${geminiModels.length} Gemini models`);
      } catch (error) {
        console.error('Error getting Gemini models:', error);
      }
    }
    
    // Get Ollama models if available
    try {
      const ollamaService = new OllamaService();
      if (await ollamaService.isServerRunning()) {
        const ollamaModels = await ollamaService.getAvailableModels();
        const formattedOllamaModels = ollamaModels.map(model => ({
          id: `ollama/${model.name}`,
          name: model.name,
          provider: 'ollama',
          source: 'local',
          size: model.size,
          modified_at: model.modified_at,
          capabilities: ['chat', 'text-generation'],
          isBackendModel: true,
          isLocal: true
        }));
        
        allModels = [...allModels, ...formattedOllamaModels];
        console.log(`Added ${formattedOllamaModels.length} Ollama local models`);
      }
    } catch (error) {
      console.error('Error getting Ollama models:', error);
    }
    
    // Get Local GGUF models if available
    try {
      const localService = new LocalInferenceService();
      if (await localService.isAvailable()) {
        const localModels = await localService.getAvailableModels();
        const formattedLocalModels = localModels.map(model => ({
          id: model.id,
          name: model.name,
          provider: 'local',
          source: 'local',
          capabilities: ['chat', 'text-generation'],
          isBackendModel: true,
          isLocal: true,
          description: 'Local GGUF model inference'
        }));
        
        allModels = [...allModels, ...formattedLocalModels];
        console.log(`Added ${formattedLocalModels.length} local GGUF models`);
      }
    } catch (error) {
      console.error('Error getting local models:', error);
    }
    
    // Get OpenRouter models if API key is configured
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        
        // Get the best models from OpenRouter based on 2024-2025 rankings
        const bestModels = [
          // Latest and best models from the search results
          'meta-llama/llama-4-behemoth',
          'meta-llama/llama-4-maverick', 
          'anthropic/claude-3.7-sonnet',
          'google/gemini-2.5-pro',
          'google/gemini-2.5-flash',
          'google/gemini-2.5-flash-lite',
          'openai/o3-pro',
          'openai/o3',
          'openai/o4-mini',
          'openai/gpt-4o',
          'openai/gpt-4o-mini',
          'anthropic/claude-3-opus',
          'anthropic/claude-3-sonnet',
          'anthropic/claude-3-haiku',
          'alibaba/qwen2.5-max',
          'alibaba/qwq-32b',
          'deepseek/deepseek-v3',
          'deepseek/deepseek-chat-v3',
          'deepseek/deepseek-r1',
          'mistralai/mixtral-8x7b-instruct',
          'mistralai/mistral-large',
          'meta-llama/llama-3.1-405b-instruct',
          'meta-llama/llama-3.1-70b-instruct',
          'meta-llama/llama-3.1-8b-instruct',
          'meta-llama/llama-4-scout'
        ];
        
        // Filter models based on allowed list in env or use best models
        const allowedModels = process.env.ALLOWED_MODELS?.split(',') || bestModels;
        
        let openRouterModels;
        if (allowedModels.length > 0) {
          openRouterModels = response.data.data.filter(model => 
            allowedModels.includes(model.id)
          );
        } else {
          openRouterModels = response.data.data;
        }
        
        // Format OpenRouter models
        const formattedOpenRouterModels = openRouterModels.map(model => ({
          id: model.id,
          name: model.name || model.id.split('/').pop(),
          provider: model.id.split('/')[0],
          source: 'openrouter',
          pricing: {
            prompt: model.pricing?.prompt,
            completion: model.pricing?.completion
          },
          context_length: model.context_length,
          capabilities: model.capabilities || [],
          isBackendModel: true
        }));
        
        allModels = [...allModels, ...formattedOpenRouterModels];
        console.log(`Added ${formattedOpenRouterModels.length} OpenRouter models`);
      } catch (error) {
        console.error('Error fetching OpenRouter models:', error);
      }
    }
    
    res.status(200).json({ models: allModels });
    
  } catch (error) {
    console.error('Error in getModels:', error);
    res.status(500).json({
      error: 'Failed to fetch models',
      details: error.message
    });
  }
}; 