import express from 'express';
import { RouterboxService } from '../services/routerboxService.js';
import { CustomModelService } from '../services/customModelService.js';
import { protect } from '../middleware/authMiddleware.js';
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
      user
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
      streaming: stream
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
 * List available models
 */
router.get('/models', protect, async (req, res) => {
  try {
    // Load custom models
    const customModels = await CustomModelService.getAllCustomModels();
    
    // Base models
    const baseModels = [
      // Anthropic models
      { id: 'anthropic/claude-4-opus', object: 'model', created: Date.now(), owned_by: 'anthropic' },
      { id: 'anthropic/claude-4-sonnet', object: 'model', created: Date.now(), owned_by: 'anthropic' },
      
      // OpenAI models
      { id: 'openai/gpt-4o', object: 'model', created: Date.now(), owned_by: 'openai' },
      { id: 'openai/o3', object: 'model', created: Date.now(), owned_by: 'openai' },
      
      // Gemini models
      { id: 'google/gemini-2.5-flash', object: 'model', created: Date.now(), owned_by: 'google' },
      { id: 'google/gemini-2.5-pro', object: 'model', created: Date.now(), owned_by: 'google' },
    ];

    // Convert custom models to OpenAI format
    const customModelList = customModels.map(model => ({
      id: model.id,
      object: 'model',
      created: new Date(model.created_at).getTime(),
      owned_by: 'custom',
      description: model.description,
      name: model.name,
      capabilities: model.capabilities
    }));

    res.json({
      object: 'list',
      data: [...baseModels, ...customModelList]
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