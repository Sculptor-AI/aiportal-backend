import ephemeralTokenService from '../services/ephemeralTokenService.js';
import { createErrorResponse, logError } from '../utils/errorHandler.js';

/**
 * Controller for ephemeral token management
 * 
 * Handles the generation and management of ephemeral tokens for Gemini Live API access.
 * This replaces the complex WebSocket-based system with a simple token-based approach.
 */

/**
 * Generate an ephemeral token for Live API access
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const generateToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const options = req.body || {};

    // Validate request
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Generate token
    const result = await ephemeralTokenService.generateToken(userId, options);

    // Log token generation (without sensitive data)
    console.log(`🎫 Ephemeral token generated for user ${req.user.username}, expires at ${result.expiresAt}`);

    res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    logError(error, 'Generate ephemeral token', { userId: req.user?.id });
    
    // Handle specific error types
    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json(createErrorResponse(error, 'Rate limit exceeded'));
    }
    
    if (error.message.includes('not allowed') || error.message.includes('Invalid')) {
      return res.status(400).json(createErrorResponse(error, 'Invalid request'));
    }

    res.status(500).json(createErrorResponse(error, 'Failed to generate ephemeral token'));
  }
};

/**
 * Get user's token usage statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getTokenUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    const usage = ephemeralTokenService.getUserTokenUsage(userId);

    res.status(200).json({
      success: true,
      data: usage
    });

  } catch (error) {
    logError(error, 'Get token usage', { userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to get token usage'));
  }
};

/**
 * Get service configuration (for client applications)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getConfiguration = async (req, res) => {
  try {
    const config = ephemeralTokenService.getConfiguration();

    res.status(200).json({
      success: true,
      data: config
    });

  } catch (error) {
    logError(error, 'Get configuration', { userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to get configuration'));
  }
};

/**
 * Get service statistics (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getStatistics = async (req, res) => {
  try {
    // Check if user is admin (you'll need to implement this check)
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const stats = ephemeralTokenService.getStatistics();

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    logError(error, 'Get statistics', { userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to get statistics'));
  }
};

/**
 * Health check endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const healthCheck = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Ephemeral token service is healthy',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logError(error, 'Health check', { userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Service health check failed'));
  }
};