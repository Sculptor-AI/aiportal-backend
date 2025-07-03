import express from 'express';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';
import modelConfigService from '../services/modelConfigService.js';
import rateLimitQueueService from '../services/rateLimitQueueService.js';

const router = express.Router();

// Get rate limit status for all models and users
router.get('/status', protect, requireAdmin, async (req, res) => {
  try {
    const status = rateLimitQueueService.getQueueStatus();
    const globalConfig = modelConfigService.getGlobalConfig();
    
    res.json({
      enabled: modelConfigService.isRateLimitingEnabled(),
      globalConfig,
      status
    });
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    res.status(500).json({
      error: 'Failed to get rate limit status',
      message: error.message
    });
  }
});

// Get rate limit info for a specific model
router.get('/models/:modelId', protect, async (req, res) => {
  try {
    const { modelId } = req.params;
    const userId = req.user.id;
    
    const modelConfig = modelConfigService.getModelConfig(modelId);
    if (!modelConfig) {
      return res.status(404).json({
        error: 'Model not found'
      });
    }

    const globalLimit = modelConfigService.getModelGlobalRateLimit(modelId);
    const userLimit = modelConfigService.getModelUserRateLimit(modelId);

    res.json({
      modelId,
      globalRateLimit: globalLimit,
      userRateLimit: userLimit,
      rateLimitingEnabled: modelConfigService.isRateLimitingEnabled()
    });
  } catch (error) {
    console.error('Error getting model rate limit info:', error);
    res.status(500).json({
      error: 'Failed to get model rate limit info',
      message: error.message
    });
  }
});

// Update global rate limiting settings (admin only)
router.post('/config', protect, requireAdmin, async (req, res) => {
  try {
    const { rateLimitingEnabled } = req.body;
    
    // This would require updating the config file
    // For now, just return current settings
    res.json({
      message: 'Rate limiting configuration is managed through model_config/config.json',
      currentlyEnabled: modelConfigService.isRateLimitingEnabled(),
      note: 'To disable rate limiting, set rateLimitingEnabled to false in model_config/config.json'
    });
  } catch (error) {
    console.error('Error updating rate limit config:', error);
    res.status(500).json({
      error: 'Failed to update rate limit config',
      message: error.message
    });
  }
});

export default router;