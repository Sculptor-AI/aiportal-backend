import axios from 'axios';
import { getGeminiModels } from '../services/geminiService.js';
import { getAnthropicModels } from '../services/anthropicService.js';
import { getOpenAIModels } from '../services/openaiService.js';
import { OllamaService } from '../services/ollamaService.js';
import { LocalInferenceService } from '../services/localInferenceService.js';
import modelConfigService from '../services/modelConfigService.js';
import { safeConsoleLog, sanitizeErrorMessage } from '../utils/errorSanitizer.js';

/**
 * Get the list of available models from OpenRouter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getModels = async (req, res) => {
  try {
    let allModels = [];
    
    // Initialize model config service
    await modelConfigService.initialize();
    
    // Get models from configuration only
    const configuredModels = modelConfigService.getAllModels();
    if (configuredModels.length > 0) {
      allModels = configuredModels.map(model => ({
        id: model.id,
        name: model.displayName,
        provider: model.provider,
        source: 'configured',
        capabilities: model.capabilities || {},
        pricing: model.pricing || {},
        isBackendModel: true,
        isConfigured: true,
        enabled: model.enabled,
        parameters: model.parameters,
        routing: model.routing,
        globalRateLimit: model.globalRateLimit,
        userRateLimit: model.userRateLimit
      }));
      console.log(`Loaded ${configuredModels.length} configured models from model_config`);
    }
    
    res.status(200).json({ models: allModels });
    
  } catch (error) {
    safeConsoleLog('error', 'Error in getModels:', error);
    res.status(500).json({
      error: 'Failed to fetch models',
      details: sanitizeErrorMessage(error)
    });
  }
}; 