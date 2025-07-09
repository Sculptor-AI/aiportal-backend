import express from 'express';
import { AuthService } from '../utils/auth.js';
import { protect } from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';
import database from '../database/connection.js';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// Register new user
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const userId = await AuthService.createUser(username, password, email);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Login user
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const user = await AuthService.authenticateUser(username, password);
    const accessToken = AuthService.generateAccessToken(user.id, user.username);
    const refreshToken = await AuthService.createRefreshToken(user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, userId } = req.body;

    if (!refreshToken || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token and user ID are required'
      });
    }

    const isValid = await AuthService.verifyRefreshToken(refreshToken, userId);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }

    // Get user info
    const user = await database.get('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new tokens
    const newAccessToken = AuthService.generateAccessToken(userId, user.username);
    const newRefreshToken = await AuthService.createRefreshToken(userId);

    // Revoke old refresh token
    await AuthService.revokeRefreshToken(refreshToken, userId);

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

// Logout (revoke refresh token)
router.post('/logout', protect, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await AuthService.revokeRefreshToken(refreshToken, req.user.id);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout'
    });
  }
});

// Get current user profile
router.get('/profile', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          username: req.user.username,
          authMethod: req.user.authMethod
        }
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
});

// Generate API key
router.post('/api-keys', protect, async (req, res) => {
  try {
    const { keyName } = req.body;

    if (!keyName) {
      return res.status(400).json({
        success: false,
        error: 'Key name is required'
      });
    }

    const apiKey = await AuthService.generateApiKey(req.user.id, keyName);

    res.status(201).json({
      success: true,
      data: {
        apiKey,
        keyName,
        message: 'API key generated successfully. Store it securely - it will not be shown again.'
      }
    });
  } catch (error) {
    console.error('API key generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate API key'
    });
  }
});

// List user's API keys
router.get('/api-keys', protect, async (req, res) => {
  try {
    const apiKeys = await AuthService.getUserApiKeys(req.user.id);

    res.json({
      success: true,
      data: {
        apiKeys
      }
    });
  } catch (error) {
    console.error('API keys list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get API keys'
    });
  }
});

// Revoke API key
router.delete('/api-keys/:keyId', protect, async (req, res) => {
  try {
    const { keyId } = req.params;

    await AuthService.revokeApiKey(req.user.id, keyId);

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    console.error('API key revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key'
    });
  }
});

export default router;