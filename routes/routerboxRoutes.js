import express from 'express';
import { RouterboxService } from '../services/routerboxService.js';
import { CustomModelService } from '../services/customModelService.js';
import { getGeminiModels } from '../services/geminiService.js';
import { getAnthropicModels } from '../services/anthropicService.js';
import { getOpenAIModels } from '../services/openaiService.js';
import { OllamaService } from '../services/ollamaService.js';
import { LocalInferenceService } from '../services/localInferenceService.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import { checkModelRateLimit, recordModelUsage } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * POST /api/v1/chat/completions
 * OpenAI-compatible chat completions endpoint
 * This is the main "Routerbox" endpoint that routes to appropriate providers
 */
router.post('/completions', protect, checkModelRateLimit, recordModelUsage, async (req, res) => {
  try {
    const {
      model,
      messages,
      temperature = 0.7,
      max_tokens,
      stream = false,
      user,
      web_search = false,
      search_query = null
    } = req.body;

    // Validate required fields
    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Missing or invalid required fields: model and messages are required',
          type: 'invalid_request_error'
        }
      });
    }

    // Validate messages format
    for (const message of messages) {
      if (!message.role || !message.content) {
        return res.status(400).json({
          error: {
            message: 'Each message must have role and content fields',
            type: 'invalid_request_error'
          }
        });
      }
    }

    // Add user context for rate limiting
    const routerboxParams = {
      model,
      messages,
      temperature,
      max_tokens,
      user: req.user.id,
      streaming: stream,
      webSearch: web_search,
      searchQuery: search_query
    };

    // Handle streaming requests
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        await RouterboxService.streamChat(routerboxParams, (chunk) => {
          res.write(chunk);
        });
        res.end();
      } catch (error) {
        console.error('Routerbox streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } else {
      // Handle non-streaming requests
      const response = await RouterboxService.routeChat(routerboxParams);
      res.json(response);
    }

  } catch (error) {
    console.error('Routerbox error:', error);
    
    // Return OpenAI-compatible error format
    res.status(error.status || 500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error',
        code: error.code || null
      }
    });
  }
});

/**
 * GET /api/v1/models
 * List available models (OpenRouter-compatible)
 */
router.get('/models', protect, async (req, res) => {
  try {
    let allModels = [];
    
    // Get Anthropic models if API key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropicModels = getAnthropicModels().map(model => ({
          id: model.id,
          object: 'model',
          created: Date.now(),
          owned_by: 'anthropic'
        }));
        allModels = [...allModels, ...anthropicModels];
      } catch (error) {
        console.error('Error getting Anthropic models:', error);
      }
    }
    
    // Get OpenAI models if API key is configured
    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiModels = getOpenAIModels().map(model => ({
          id: model.id,
          object: 'model',
          created: Date.now(),
          owned_by: 'openai'
        }));
        allModels = [...allModels, ...openaiModels];
      } catch (error) {
        console.error('Error getting OpenAI models:', error);
      }
    }
    
    // Get Gemini models if API key is configured
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiModels = getGeminiModels().map(model => ({
          id: model.id,
          object: 'model',
          created: Date.now(),
          owned_by: 'google'
        }));
        allModels = [...allModels, ...geminiModels];
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
          object: 'model',
          created: Date.now(),
          owned_by: 'ollama'
        }));
        
        allModels = [...allModels, ...formattedOllamaModels];
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
          object: 'model',
          created: Date.now(),
          owned_by: 'local'
        }));
        
        allModels = [...allModels, ...formattedLocalModels];
      }
    } catch (error) {
      console.error('Error getting local models:', error);
    }
    
    // Get custom models
    try {
      const customModels = await CustomModelService.getAllCustomModels();
      const formattedCustomModels = customModels.map(model => ({
        id: model.id,
        object: 'model',
        created: new Date(model.created_at).getTime(),
        owned_by: 'custom',
        description: model.description,
        name: model.name,
        capabilities: model.capabilities
      }));
      
      allModels = [...allModels, ...formattedCustomModels];
    } catch (error) {
      console.error('Error getting custom models:', error);
    }

    res.json({
      object: 'list',
      data: allModels
    });
    
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      error: {
        message: 'Failed to fetch models',
        type: 'api_error'
      }
    });
  }
});

export default router;