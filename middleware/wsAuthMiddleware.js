import { AuthService } from '../utils/auth.js';

/**
 * WebSocket authentication middleware
 * Handles authentication for WebSocket connections by requiring an auth message
 */
export class WSAuthMiddleware {
  /**
   * Authenticate a WebSocket connection using auth message
   * @param {Object} authData - Authentication data from WebSocket message
   * @param {string} authData.token - Bearer token or API key
   * @param {string} authData.type - 'bearer' or 'api_key'
   * @returns {Object|null} User object if authenticated, null otherwise
   */
  static async authenticate(authData) {
    try {
      if (!authData || !authData.token) {
        return null;
      }

      let user;
      const { token, type } = authData;

      if (type === 'api_key') {
        // Verify API key
        const apiKeyResult = await AuthService.verifyApiKey(token);
        if (!apiKeyResult) {
          return null;
        }
        user = {
          id: apiKeyResult.user_id,
          username: apiKeyResult.username,
          authMethod: 'api_key'
        };
      } else if (type === 'bearer') {
        // Verify JWT token
        const decoded = await AuthService.verifyAccessToken(token);
        user = {
          id: decoded.userId,
          username: decoded.username,
          authMethod: 'jwt'
        };
      } else {
        return null;
      }

      return user;
    } catch (error) {
      console.error('WebSocket auth error:', error);
      return null;
    }
  }

  /**
   * Extract authentication data from WebSocket upgrade request headers
   * @param {Object} req - HTTP upgrade request
   * @returns {Object|null} Authentication data or null
   */
  static extractAuthFromHeaders(req) {
    try {
      // Check for API key in headers
      if (req.headers['x-api-key']) {
        return {
          token: req.headers['x-api-key'],
          type: 'api_key'
        };
      }

      // Check for Bearer token in Authorization header
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return {
          token: req.headers.authorization.split(' ')[1],
          type: 'bearer'
        };
      }

      // Check for token in URL query parameters (less secure, use as fallback)
      if (req.url) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        const authType = url.searchParams.get('auth_type') || 'bearer';
        
        if (token) {
          return {
            token,
            type: authType
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error extracting auth from headers:', error);
      return null;
    }
  }

  /**
   * Validate session access for authenticated user
   * @param {Object} user - Authenticated user object
   * @param {string} sessionId - Session ID to validate
   * @param {Map} sessionStore - Session storage (user_id -> Set of session_ids)
   * @returns {boolean} True if user has access to session
   */
  static validateSessionAccess(user, sessionId, sessionStore) {
    try {
      if (!user || !user.id || !sessionId) {
        return false;
      }

      const userSessions = sessionStore.get(user.id);
      return userSessions && userSessions.has(sessionId);
    } catch (error) {
      console.error('Error validating session access:', error);
      return false;
    }
  }

  /**
   * Add session to user's session list
   * @param {Object} user - Authenticated user object
   * @param {string} sessionId - Session ID to add
   * @param {Map} sessionStore - Session storage (user_id -> Set of session_ids)
   */
  static addUserSession(user, sessionId, sessionStore) {
    try {
      if (!user || !user.id || !sessionId) {
        return;
      }

      if (!sessionStore.has(user.id)) {
        sessionStore.set(user.id, new Set());
      }
      
      sessionStore.get(user.id).add(sessionId);
    } catch (error) {
      console.error('Error adding user session:', error);
    }
  }

  /**
   * Remove session from user's session list
   * @param {Object} user - Authenticated user object
   * @param {string} sessionId - Session ID to remove
   * @param {Map} sessionStore - Session storage (user_id -> Set of session_ids)
   */
  static removeUserSession(user, sessionId, sessionStore) {
    try {
      if (!user || !user.id || !sessionId) {
        return;
      }

      const userSessions = sessionStore.get(user.id);
      if (userSessions) {
        userSessions.delete(sessionId);
        
        // Clean up empty session sets
        if (userSessions.size === 0) {
          sessionStore.delete(user.id);
        }
      }
    } catch (error) {
      console.error('Error removing user session:', error);
    }
  }
}