import { AdminService } from './adminService.js';

export const requireAdmin = async (req, res, next) => {
  try {
    let token;

    // Check for admin token in headers
    if (req.headers['x-admin-token']) {
      token = req.headers['x-admin-token'];
    } 
    // Check for Bearer token specifically marked as admin
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Admin token required'
      });
    }

    // Verify admin token
    const adminResult = await AdminService.verifyAdminToken(token);
    if (!adminResult) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired admin token'
      });
    }

    // Set admin user in request
    req.admin = {
      id: adminResult.user_id,
      username: adminResult.username,
      tokenId: adminResult.token_id
    };

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

export const requireAdminWithFallback = async (req, res, next) => {
  try {
    let token;
    let isAdminToken = false;

    // Check for admin token first
    if (req.headers['x-admin-token']) {
      token = req.headers['x-admin-token'];
      isAdminToken = true;
    } 
    // Check for Bearer token
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (isAdminToken) {
      // Verify admin token
      const adminResult = await AdminService.verifyAdminToken(token);
      if (!adminResult) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired admin token'
        });
      }

      req.admin = {
        id: adminResult.user_id,
        username: adminResult.username,
        tokenId: adminResult.token_id
      };
      req.isAdmin = true;
    } else {
      // This would be a regular user token - not allowed for admin endpoints
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};