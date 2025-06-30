import { RateLimitingService } from '../services/rateLimitingService.js';

export const checkModelRateLimit = async (req, res, next) => {
  try {
    const { model } = req.body;
    const userId = req.user.id;

    // Only apply custom rate limiting to custom models
    if (!model || !model.startsWith('custom/')) {
      return next();
    }

    // Load the custom model to get its rate limits
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

    // Check rate limits
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

    // Attach custom model to request for use in route handler
    req.customModel = customModel;
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