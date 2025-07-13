import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware specifically for Live Audio API endpoints
 */

// General rate limit for all Live Audio endpoints
export const liveAudioRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.LIVE_AUDIO_MAX_REQUESTS_PER_MINUTE) || 60, // limit each IP to 60 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests to Live Audio API. Please try again later.',
    retryAfter: 60
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise fall back to IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    console.log(`Rate limit exceeded for Live Audio API: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests to Live Audio API. Please try again later.',
      retryAfter: Math.ceil(60 - (Date.now() - req.rateLimit.resetTime) / 1000)
    });
  }
});

// Stricter rate limit for session creation (more resource intensive)
export const sessionCreationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.LIVE_AUDIO_MAX_SESSION_CREATES_PER_MINUTE) || 10, // limit to 10 session creations per minute
  message: {
    success: false,
    error: 'Too many session creation requests. Please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    console.log(`Session creation rate limit exceeded: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many session creation requests. Please try again later.',
      retryAfter: Math.ceil(60 - (Date.now() - req.rateLimit.resetTime) / 1000)
    });
  }
});

// Rate limit for audio transcription (high bandwidth operation)
export const transcriptionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.LIVE_AUDIO_MAX_TRANSCRIPTIONS_PER_MINUTE) || 30, // limit to 30 transcriptions per minute
  message: {
    success: false,
    error: 'Too many transcription requests. Please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    console.log(`Transcription rate limit exceeded: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many transcription requests. Please try again later.',
      retryAfter: Math.ceil(60 - (Date.now() - req.rateLimit.resetTime) / 1000)
    });
  }
});