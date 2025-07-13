/**
 * WebSocket Rate Limiting Middleware
 * Provides advanced rate limiting for WebSocket connections
 */
export class WSRateLimitMiddleware {
  constructor() {
    // Per-user message rate limiting (messages per minute)
    this.userMessageLimits = new Map(); // userId -> { count, lastReset }
    
    // Per-IP connection rate limiting 
    this.ipConnectionLimits = new Map(); // ip -> { count, lastReset }
    
    // Per-user audio chunk size tracking
    this.userAudioLimits = new Map(); // userId -> { totalBytes, lastReset }
    
    // Configuration from environment variables
    this.MAX_MESSAGES_PER_MINUTE = parseInt(process.env.LIVE_AUDIO_MAX_MESSAGES_PER_MINUTE) || 120;
    this.MAX_CONNECTIONS_PER_IP_PER_MINUTE = parseInt(process.env.LIVE_AUDIO_MAX_CONNECTIONS_PER_IP_PER_MINUTE) || 10;
    this.MAX_AUDIO_BYTES_PER_MINUTE = parseInt(process.env.LIVE_AUDIO_MAX_AUDIO_BYTES_PER_MINUTE) || 50 * 1024 * 1024; // 50MB
    
    // Cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Check if user has exceeded message rate limit
   * @param {string} userId - User ID
   * @returns {boolean} True if rate limit exceeded
   */
  checkUserMessageLimit(userId) {
    if (!userId) return false;

    const now = Date.now();
    const userLimit = this.userMessageLimits.get(userId) || { count: 0, lastReset: now };

    // Reset if a minute has passed
    if (now - userLimit.lastReset > 60000) {
      userLimit.count = 0;
      userLimit.lastReset = now;
    }

    // Check if limit exceeded
    if (userLimit.count >= this.MAX_MESSAGES_PER_MINUTE) {
      return true;
    }

    // Increment counter
    userLimit.count++;
    this.userMessageLimits.set(userId, userLimit);
    return false;
  }

  /**
   * Check if IP has exceeded connection rate limit
   * @param {string} ip - Client IP address
   * @returns {boolean} True if rate limit exceeded
   */
  checkIPConnectionLimit(ip) {
    if (!ip) return false;

    const now = Date.now();
    const ipLimit = this.ipConnectionLimits.get(ip) || { count: 0, lastReset: now };

    // Reset if a minute has passed
    if (now - ipLimit.lastReset > 60000) {
      ipLimit.count = 0;
      ipLimit.lastReset = now;
    }

    // Check if limit exceeded
    if (ipLimit.count >= this.MAX_CONNECTIONS_PER_IP_PER_MINUTE) {
      return true;
    }

    // Increment counter
    ipLimit.count++;
    this.ipConnectionLimits.set(ip, ipLimit);
    return false;
  }

  /**
   * Check if user has exceeded audio data rate limit
   * @param {string} userId - User ID
   * @param {number} audioBytes - Size of audio data in bytes
   * @returns {boolean} True if rate limit exceeded
   */
  checkUserAudioLimit(userId, audioBytes) {
    if (!userId || !audioBytes) return false;

    const now = Date.now();
    const userAudioLimit = this.userAudioLimits.get(userId) || { totalBytes: 0, lastReset: now };

    // Reset if a minute has passed
    if (now - userAudioLimit.lastReset > 60000) {
      userAudioLimit.totalBytes = 0;
      userAudioLimit.lastReset = now;
    }

    // Check if limit would be exceeded
    if (userAudioLimit.totalBytes + audioBytes > this.MAX_AUDIO_BYTES_PER_MINUTE) {
      return true;
    }

    // Add to counter
    userAudioLimit.totalBytes += audioBytes;
    this.userAudioLimits.set(userId, userAudioLimit);
    return false;
  }

  /**
   * Get client IP from WebSocket request
   * @param {Object} req - WebSocket upgrade request
   * @returns {string} Client IP address
   */
  getClientIP(req) {
    // Check for forwarded headers (behind proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return forwarded.split(',')[0].trim();
    }

    // Check for real IP header (some proxies use this)
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      return realIP.trim();
    }

    // Fallback to remote address
    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * Calculate audio data size from base64 string
   * @param {string} audioData - Base64 encoded audio data
   * @returns {number} Size in bytes
   */
  calculateAudioSize(audioData) {
    if (!audioData || typeof audioData !== 'string') {
      return 0;
    }
    
    // Base64 encoding increases size by ~33%, so reverse calculate
    return Math.floor((audioData.length * 3) / 4);
  }

  /**
   * Periodic cleanup of old rate limit entries
   */
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes

      // Clean up user message limits
      for (const [userId, data] of this.userMessageLimits) {
        if (now - data.lastReset > maxAge) {
          this.userMessageLimits.delete(userId);
        }
      }

      // Clean up IP connection limits
      for (const [ip, data] of this.ipConnectionLimits) {
        if (now - data.lastReset > maxAge) {
          this.ipConnectionLimits.delete(ip);
        }
      }

      // Clean up user audio limits
      for (const [userId, data] of this.userAudioLimits) {
        if (now - data.lastReset > maxAge) {
          this.userAudioLimits.delete(userId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Get rate limit status for a user
   * @param {string} userId - User ID
   * @returns {Object} Rate limit status
   */
  getRateLimitStatus(userId) {
    const messageLimit = this.userMessageLimits.get(userId);
    const audioLimit = this.userAudioLimits.get(userId);

    return {
      messages: {
        count: messageLimit?.count || 0,
        limit: this.MAX_MESSAGES_PER_MINUTE,
        remaining: Math.max(0, this.MAX_MESSAGES_PER_MINUTE - (messageLimit?.count || 0))
      },
      audioBytes: {
        totalBytes: audioLimit?.totalBytes || 0,
        limit: this.MAX_AUDIO_BYTES_PER_MINUTE,
        remaining: Math.max(0, this.MAX_AUDIO_BYTES_PER_MINUTE - (audioLimit?.totalBytes || 0))
      }
    };
  }
}

// Create singleton instance
export const wsRateLimit = new WSRateLimitMiddleware();