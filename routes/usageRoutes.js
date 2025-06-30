import express from 'express';
import { RateLimitingService } from '../services/rateLimitingService.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/v1/usage
 * Get current user's usage statistics
 */
router.get('/', protect, async (req, res) => {
  try {
    const { model } = req.query;
    const stats = await RateLimitingService.getUserUsageStats(req.user.id, model);
    
    res.json({
      success: true,
      data: {
        userId: req.user.id,
        username: req.user.username,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/usage/:model
 * Get usage statistics for a specific model
 */
router.get('/:model', protect, async (req, res) => {
  try {
    const modelId = req.params.model.startsWith('custom/') ? req.params.model : `custom/${req.params.model}`;
    const stats = await RateLimitingService.getUserUsageStats(req.user.id, modelId);
    
    res.json({
      success: true,
      data: {
        userId: req.user.id,
        username: req.user.username,
        modelId,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching model usage stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/usage
 * Reset user's usage statistics (admin feature)
 */
router.delete('/', protect, async (req, res) => {
  try {
    const { model } = req.body;
    await RateLimitingService.resetUserLimits(req.user.id, model);
    
    res.json({
      success: true,
      message: model ? `Usage reset for model ${model}` : 'All usage statistics reset'
    });
  } catch (error) {
    console.error('Error resetting usage stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;