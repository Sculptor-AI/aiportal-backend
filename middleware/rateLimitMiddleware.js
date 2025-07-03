import { RateLimitingService } from '../services/rateLimitingService.js';
import rateLimitQueueService from '../services/rateLimitQueueService.js';
import modelConfigService from '../services/modelConfigService.js';

export const checkModelRateLimit = async (req, res, next) => {
  try {
    const { model } = req.body;
    const userId = req.user?.id;

    // Skip if no model specified or no user
    if (!model || !userId) {
      return next();
    }

    // Initialize services if needed
    await modelConfigService.initialize();
    await rateLimitQueueService.initialize();

    // Skip if rate limiting is disabled globally
    if (!modelConfigService.isRateLimitingEnabled()) {
      return next();
    }

    // Check if model exists in configuration
    const modelConfig = modelConfigService.getModelConfig(model);
    
    // For custom models, handle legacy way for backward compatibility
    if (model.startsWith('custom/')) {
      const { CustomModelService } = await import('../services/customModelService.js');
      const customModel = await CustomModelService.getCustomModel(model);
      
      if (!customModel) {
        return res.status(404).json({
          error: {
            message: 'Custom model not found',
            type: 'invalid_request_error'
          }
        });
      }

      // Use legacy rate limiting for custom models
      const rateLimitResult = await RateLimitingService.checkRateLimit(
        userId, 
        model, 
        customModel.rate_limits
      );

      if (!rateLimitResult.allowed) {
        res.set({
          'X-RateLimit-Limit': rateLimitResult.limit,
          'X-RateLimit-Remaining': Math.max(0, rateLimitResult.limit - rateLimitResult.current),
          'X-RateLimit-Reset': new Date(Date.now() + rateLimitResult.retryAfter * 1000).toISOString(),
          'Retry-After': rateLimitResult.retryAfter
        });

        return res.status(429).json({
          error: {
            message: rateLimitResult.error,
            type: 'rate_limit_exceeded',
            code: 'rate_limit_exceeded',
            details: {
              limitType: rateLimitResult.limitType,
              limit: rateLimitResult.limit,
              current: rateLimitResult.current,
              retryAfter: rateLimitResult.retryAfter
            }
          }
        });
      }

      req.customModel = customModel;
      return next();
    }

    // Use new rate limiting system for configured models
    const rateLimitResult = await rateLimitQueueService.checkRateLimit(userId, model);

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.queued) {
        // Request is queued, wait for it to be processed
        try {
          const queueResult = await rateLimitResult;
          req.queueInfo = {
            queued: true,
            queueTime: queueResult.queueTime
          };
          return next();
        } catch (error) {
          return res.status(429).json({
            error: {
              message: error.message,
              type: 'rate_limit_exceeded',
              code: 'queue_timeout'
            }
          });
        }
      } else {
        // Rate limit exceeded and not queued
        const headers = {};
        if (rateLimitResult.retryAfter) {
          headers['Retry-After'] = rateLimitResult.retryAfter;
          headers['X-RateLimit-Reset'] = new Date(Date.now() + rateLimitResult.retryAfter * 1000).toISOString();
        }
        
        res.set(headers);

        return res.status(429).json({
          error: {
            message: rateLimitResult.error || 'Rate limit exceeded. Please try again later.',
            type: 'rate_limit_exceeded',
            code: 'rate_limit_exceeded',
            details: {
              retryAfter: rateLimitResult.retryAfter,
              userLimitResetIn: rateLimitResult.userLimitResetIn,
              globalLimitResetIn: rateLimitResult.globalLimitResetIn
            }
          }
        });
      }
    }

    // Request allowed, proceed
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to check rate limits',
        type: 'internal_error'
      }
    });
  }
};

export const recordModelUsage = async (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to record usage on successful responses
  res.json = function(data) {
    // Only record usage for successful responses and custom models
    if (res.statusCode < 400 && req.body.model && req.body.model.startsWith('custom/')) {
      // Record usage asynchronously (don't wait for it)
      RateLimitingService.recordUsage(req.user.id, req.body.model)
        .catch(error => console.error('Failed to record usage:', error));
    }

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};