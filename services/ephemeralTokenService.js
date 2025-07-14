import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';

/**
 * Ephemeral Token Service for Gemini Live API
 * 
 * This service provides a secure, simplified approach to Live API access by:
 * - Generating short-lived ephemeral tokens
 * - Implementing strict rate limiting
 * - Enforcing security constraints
 * - Preventing abuse through multiple layers of protection
 */
class EphemeralTokenService {
  constructor() {
    this.client = new GoogleGenAI({});
    
    // User token tracking for rate limiting
    this.userTokens = new Map(); // userId -> { tokens: [], lastCleanup: timestamp }
    
    // Configuration from environment variables
    this.config = {
      // Token duration limits
      DEFAULT_TOKEN_DURATION_MINUTES: parseInt(process.env.LIVE_API_TOKEN_DURATION_MINUTES) || 30,
      MAX_TOKEN_DURATION_MINUTES: parseInt(process.env.LIVE_API_MAX_TOKEN_DURATION_MINUTES) || 60,
      SESSION_START_WINDOW_MINUTES: parseInt(process.env.LIVE_API_SESSION_START_WINDOW_MINUTES) || 2,
      
      // Rate limiting
      MAX_TOKENS_PER_HOUR: parseInt(process.env.LIVE_API_MAX_TOKENS_PER_HOUR) || 10,
      MAX_TOKENS_PER_DAY: parseInt(process.env.LIVE_API_MAX_TOKENS_PER_DAY) || 100,
      
      // Security constraints
      DEFAULT_MODEL: process.env.LIVE_API_DEFAULT_MODEL || 'gemini-2.0-flash-live-001',
      ALLOWED_MODELS: (process.env.LIVE_API_ALLOWED_MODELS || 'gemini-2.0-flash-live-001,gemini-live-2.5-flash-preview').split(','),
      
      // Abuse prevention
      MAX_CONCURRENT_SESSIONS: parseInt(process.env.LIVE_API_MAX_CONCURRENT_SESSIONS) || 3,
      COOLDOWN_PERIOD_MINUTES: parseInt(process.env.LIVE_API_COOLDOWN_PERIOD_MINUTES) || 5,
      
      // System instructions
      DEFAULT_SYSTEM_INSTRUCTION: process.env.LIVE_API_DEFAULT_SYSTEM_INSTRUCTION || 
        "You are a helpful assistant. Be concise, accurate, and respectful in your responses.",
      ALLOW_CUSTOM_INSTRUCTIONS: process.env.LIVE_API_ALLOW_CUSTOM_INSTRUCTIONS === 'true'
    };
    
    // Cleanup expired tokens every 5 minutes
    setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
  }

  /**
   * Generate an ephemeral token for a user
   * @param {string} userId - User ID
   * @param {Object} options - Token generation options
   * @returns {Promise<Object>} Token response
   */
  async generateToken(userId, options = {}) {
    try {
      // Validate user
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Check rate limits
      await this.checkRateLimit(userId);

      // Validate and sanitize options
      const validatedOptions = this.validateTokenOptions(options);

      // Calculate token expiration
      const durationMinutes = Math.min(
        validatedOptions.duration || this.config.DEFAULT_TOKEN_DURATION_MINUTES,
        this.config.MAX_TOKEN_DURATION_MINUTES
      );
      
      const expireTime = new Date(Date.now() + durationMinutes * 60 * 1000);
      const newSessionExpireTime = new Date(Date.now() + this.config.SESSION_START_WINDOW_MINUTES * 60 * 1000);

      // Create token constraints
      const tokenConstraints = this.buildTokenConstraints(validatedOptions, userId);

      // Generate ephemeral token using Gemini API
      const tokenResponse = await this.client.authTokens.create({
        config: {
          uses: 1, // Single use for security
          expireTime: expireTime.toISOString(),
          newSessionExpireTime: newSessionExpireTime.toISOString(),
          liveConnectConstraints: tokenConstraints,
          httpOptions: {
            apiVersion: 'v1alpha'
          }
        }
      });

      // Track token for rate limiting
      this.trackUserToken(userId, {
        tokenId: this.hashToken(tokenResponse.name),
        createdAt: new Date(),
        expiresAt: expireTime,
        model: tokenConstraints.model,
        constraints: tokenConstraints.config
      });

      return {
        success: true,
        token: tokenResponse.name,
        expiresAt: expireTime.toISOString(),
        sessionStartWindow: newSessionExpireTime.toISOString(),
        constraints: {
          model: tokenConstraints.model,
          maxDuration: durationMinutes,
          responseModality: tokenConstraints.config.responseModalities?.[0] || 'TEXT'
        },
        usage: this.getUserTokenUsage(userId)
      };

    } catch (error) {
      console.error('Error generating ephemeral token:', error);
      throw new Error(`Failed to generate token: ${error.message}`);
    }
  }

  /**
   * Validate and sanitize token generation options
   * @param {Object} options - Raw options
   * @returns {Object} Validated options
   */
  validateTokenOptions(options) {
    const validated = {};

    // Validate model
    if (options.model) {
      if (!this.config.ALLOWED_MODELS.includes(options.model)) {
        throw new Error(`Model not allowed: ${options.model}. Allowed models: ${this.config.ALLOWED_MODELS.join(', ')}`);
      }
      validated.model = options.model;
    }

    // Validate response modality
    if (options.responseModality) {
      const allowed = ['TEXT', 'AUDIO'];
      if (!allowed.includes(options.responseModality.toUpperCase())) {
        throw new Error(`Invalid response modality: ${options.responseModality}. Allowed: ${allowed.join(', ')}`);
      }
      validated.responseModality = options.responseModality.toUpperCase();
    }

    // Validate duration
    if (options.duration) {
      const duration = parseInt(options.duration);
      if (isNaN(duration) || duration < 1 || duration > this.config.MAX_TOKEN_DURATION_MINUTES) {
        throw new Error(`Invalid duration: ${options.duration}. Must be 1-${this.config.MAX_TOKEN_DURATION_MINUTES} minutes`);
      }
      validated.duration = duration;
    }

    // Validate system instruction
    if (options.systemInstruction) {
      if (!this.config.ALLOW_CUSTOM_INSTRUCTIONS) {
        throw new Error('Custom system instructions are not allowed');
      }
      if (options.systemInstruction.length > 1000) {
        throw new Error('System instruction too long (max 1000 characters)');
      }
      validated.systemInstruction = options.systemInstruction;
    }

    // Validate temperature
    if (options.temperature !== undefined) {
      const temp = parseFloat(options.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        throw new Error('Temperature must be between 0 and 2');
      }
      validated.temperature = temp;
    }

    return validated;
  }

  /**
   * Build token constraints for Gemini API
   * @param {Object} options - Validated options
   * @param {string} userId - User ID
   * @returns {Object} Token constraints
   */
  buildTokenConstraints(options, userId) {
    const constraints = {
      model: options.model || this.config.DEFAULT_MODEL,
      config: {
        sessionResumption: {}, // Enable session resumption
        responseModalities: [options.responseModality || 'TEXT'],
        systemInstruction: options.systemInstruction || this.config.DEFAULT_SYSTEM_INSTRUCTION,
        
        // Security settings
        contextWindowCompression: {
          slidingWindow: {}
        }
      }
    };

    // Add temperature if specified
    if (options.temperature !== undefined) {
      constraints.config.temperature = options.temperature;
    }

    // Add user context for tracking
    constraints.config.metadata = {
      userId: userId,
      generatedAt: new Date().toISOString()
    };

    return constraints;
  }

  /**
   * Check rate limits for user
   * @param {string} userId - User ID
   * @throws {Error} If rate limit exceeded
   */
  async checkRateLimit(userId) {
    const now = new Date();
    const userTokens = this.userTokens.get(userId) || { tokens: [], lastCleanup: now };

    // Clean up old tokens
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    userTokens.tokens = userTokens.tokens.filter(token => 
      token.createdAt > oneDayAgo && token.expiresAt > now
    );

    // Check hourly limit
    const tokensLastHour = userTokens.tokens.filter(token => 
      token.createdAt > oneHourAgo
    );

    if (tokensLastHour.length >= this.config.MAX_TOKENS_PER_HOUR) {
      throw new Error(`Rate limit exceeded: ${this.config.MAX_TOKENS_PER_HOUR} tokens per hour`);
    }

    // Check daily limit
    const tokensLastDay = userTokens.tokens.filter(token => 
      token.createdAt > oneDayAgo
    );

    if (tokensLastDay.length >= this.config.MAX_TOKENS_PER_DAY) {
      throw new Error(`Rate limit exceeded: ${this.config.MAX_TOKENS_PER_DAY} tokens per day`);
    }

    // Check for cooldown period (prevent rapid token generation)
    const lastToken = userTokens.tokens[userTokens.tokens.length - 1];
    if (lastToken) {
      const cooldownEnd = new Date(lastToken.createdAt.getTime() + this.config.COOLDOWN_PERIOD_MINUTES * 60 * 1000);
      if (now < cooldownEnd) {
        const remainingMs = cooldownEnd.getTime() - now.getTime();
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        throw new Error(`Cooldown period active. Try again in ${remainingSeconds} seconds`);
      }
    }

    this.userTokens.set(userId, userTokens);
  }

  /**
   * Track user token for rate limiting
   * @param {string} userId - User ID
   * @param {Object} tokenInfo - Token information
   */
  trackUserToken(userId, tokenInfo) {
    const userTokens = this.userTokens.get(userId) || { tokens: [], lastCleanup: new Date() };
    userTokens.tokens.push(tokenInfo);
    userTokens.lastCleanup = new Date();
    this.userTokens.set(userId, userTokens);
  }

  /**
   * Get user token usage statistics
   * @param {string} userId - User ID
   * @returns {Object} Usage statistics
   */
  getUserTokenUsage(userId) {
    const userTokens = this.userTokens.get(userId) || { tokens: [] };
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activeTokens = userTokens.tokens.filter(token => 
      token.expiresAt > now
    );

    const tokensLastHour = userTokens.tokens.filter(token => 
      token.createdAt > oneHourAgo
    );

    const tokensLastDay = userTokens.tokens.filter(token => 
      token.createdAt > oneDayAgo
    );

    return {
      activeTokens: activeTokens.length,
      tokensLastHour: tokensLastHour.length,
      tokensLastDay: tokensLastDay.length,
      limits: {
        tokensPerHour: this.config.MAX_TOKENS_PER_HOUR,
        tokensPerDay: this.config.MAX_TOKENS_PER_DAY
      }
    };
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const [userId, userTokens] of this.userTokens) {
      userTokens.tokens = userTokens.tokens.filter(token => 
        token.createdAt > oneDayAgo && token.expiresAt > now
      );

      if (userTokens.tokens.length === 0) {
        this.userTokens.delete(userId);
      }
    }
  }

  /**
   * Hash token for tracking (security)
   * @param {string} token - Token to hash
   * @returns {string} Hashed token
   */
  hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get service configuration (for admin endpoints)
   * @returns {Object} Configuration
   */
  getConfiguration() {
    return {
      tokenDuration: this.config.DEFAULT_TOKEN_DURATION_MINUTES,
      maxTokenDuration: this.config.MAX_TOKEN_DURATION_MINUTES,
      sessionStartWindow: this.config.SESSION_START_WINDOW_MINUTES,
      rateLimits: {
        tokensPerHour: this.config.MAX_TOKENS_PER_HOUR,
        tokensPerDay: this.config.MAX_TOKENS_PER_DAY
      },
      allowedModels: this.config.ALLOWED_MODELS,
      defaultModel: this.config.DEFAULT_MODEL,
      allowCustomInstructions: this.config.ALLOW_CUSTOM_INSTRUCTIONS
    };
  }

  /**
   * Get service statistics (for monitoring)
   * @returns {Object} Statistics
   */
  getStatistics() {
    let totalActiveTokens = 0;
    let totalUsers = 0;
    
    for (const [userId, userTokens] of this.userTokens) {
      totalUsers++;
      const now = new Date();
      const activeTokens = userTokens.tokens.filter(token => 
        token.expiresAt > now
      );
      totalActiveTokens += activeTokens.length;
    }

    return {
      totalUsers,
      totalActiveTokens,
      averageTokensPerUser: totalUsers > 0 ? (totalActiveTokens / totalUsers).toFixed(2) : 0,
      serviceUptime: process.uptime()
    };
  }
}

export default new EphemeralTokenService();