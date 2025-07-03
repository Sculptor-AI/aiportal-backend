import { AuthService } from '../utils/auth.js';

export const protect = async (req, res, next) => {
  try {
    let token;
    let isApiKey = false;

    // Check for API key first (permanent keys for development)
    if (req.headers['x-api-key']) {
      token = req.headers['x-api-key'];
      isApiKey = true;
    } 
    // Check for Bearer token
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    let user;

    if (isApiKey) {
      // Verify API key
      const apiKeyResult = await AuthService.verifyApiKey(token);
      if (!apiKeyResult) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key'
        });
      }
      user = {
        id: apiKeyResult.user_id,
        username: apiKeyResult.username,
        authMethod: 'api_key'
      };
    } else {
      // Verify JWT token
      const decoded = await AuthService.verifyAccessToken(token);
      user = {
        id: decoded.userId,
        username: decoded.username,
        authMethod: 'jwt'
      };
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    let isApiKey = false;

    if (req.headers['x-api-key']) {
      token = req.headers['x-api-key'];
      isApiKey = true;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      let user;

      if (isApiKey) {
        const apiKeyResult = await AuthService.verifyApiKey(token);
        if (apiKeyResult) {
          user = {
            id: apiKeyResult.user_id,
            username: apiKeyResult.username,
            authMethod: 'api_key'
          };
        }
      } else {
        try {
          const decoded = await AuthService.verifyAccessToken(token);
          user = {
            id: decoded.userId,
            username: decoded.username,
            authMethod: 'jwt'
          };
        } catch (error) {
          // Invalid token, but we continue without user
        }
      }

      req.user = user;
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail the request
    next();
  }
};

export const requireAdmin = async (req, res, next) => {
  try {
    // For now, treat all authenticated users as admins
    // In a production system, you'd check user.role or similar
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // TODO: Add proper admin role checking when user roles are implemented
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({
    //     success: false,
    //     error: 'Admin access required'
    //   });
    // }
    
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authorization error'
    });
  }
};