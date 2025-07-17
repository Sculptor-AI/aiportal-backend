import express from 'express';
import { AdminService } from './adminService.js';
import { requireAdmin } from './adminMiddleware.js';
import { AuthService } from '../utils/auth.js';
import rateLimit from 'express-rate-limit';
import modelConfigService from '../services/modelConfigService.js';
import toolsService from '../services/toolsService.js';
import adminToolsRoutes from '../routes/adminToolsRoutes.js';
import bcrypt from 'bcrypt';

// Input validation middleware
const validateInput = {
  userId: (req, res, next) => {
    const { userId } = req.params;
    if (!userId || !/^\d+$/.test(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }
    req.params.userId = parseInt(userId);
    next();
  },

  userStatus: (req, res, next) => {
    const { status } = req.body;
    const validStatuses = ['pending', 'active', 'admin'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    next();
  },

  userDetails: (req, res, next) => {
    const { username, email, password } = req.body;
    
    if (username !== undefined) {
      if (typeof username !== 'string' || username.length < 3 || username.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Username must be a string between 3 and 50 characters'
        });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({
          success: false,
          error: 'Username can only contain letters, numbers, underscores, and hyphens'
        });
      }
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters long'
        });
      }
    }
    
    next();
  },

  modelId: (req, res, next) => {
    const { modelId } = req.params;
    if (!modelId || typeof modelId !== 'string' || modelId.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid model ID format'
      });
    }
    // Sanitize model ID to prevent injection
    if (!/^[a-zA-Z0-9._/-]+$/.test(modelId)) {
      return res.status(400).json({
        success: false,
        error: 'Model ID contains invalid characters'
      });
    }
    next();
  },

  modelConfig: (req, res, next) => {
    const config = req.body;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid model configuration'
      });
    }

    // Validate required fields for new models
    if (req.method === 'POST') {
      const requiredFields = ['id', 'displayName', 'provider', 'apiModel'];
      for (const field of requiredFields) {
        if (!config[field] || typeof config[field] !== 'string') {
          return res.status(400).json({
            success: false,
            error: `Missing or invalid required field: ${field}`
          });
        }
      }
    }

    // Validate optional fields
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled field must be a boolean'
      });
    }

    next();
  },

  toolId: (req, res, next) => {
    const { toolId } = req.params;
    if (!toolId || typeof toolId !== 'string' || toolId.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tool ID format'
      });
    }
    // Sanitize tool ID
    if (!/^[a-zA-Z0-9._-]+$/.test(toolId)) {
      return res.status(400).json({
        success: false,
        error: 'Tool ID contains invalid characters'
      });
    }
    next();
  },

  loginCredentials: (req, res, next) => {
    const { username, password } = req.body;
    
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format'
      });
    }
    
    if (!password || typeof password !== 'string' || password.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
      });
    }
    
    next();
  }
};

const router = express.Router();

// Rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Higher limit for admin operations
  message: {
    success: false,
    error: 'Too many admin requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// Apply rate limiting to all admin routes
router.use(adminLimiter);

// Admin login endpoint - generate admin token
router.post('/auth/login', validateInput.loginCredentials, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // First authenticate the user normally
    const user = await AuthService.authenticateUser(username, password);
    
    // Then check if user is admin
    const isAdmin = await AdminService.isUserAdmin(user.id);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Generate admin token
    const adminToken = await AdminService.generateAdminToken(user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: 'admin'
        },
        adminToken
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// Admin logout endpoint
router.post('/auth/logout', requireAdmin, async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.headers.authorization?.split(' ')[1];
    if (token) {
      await AdminService.revokeAdminToken(token);
    }

    res.json({
      success: true,
      message: 'Admin logged out successfully'
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout'
    });
  }
});

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await AdminService.getAllUsers();
    
    res.json({
      success: true,
      data: {
        users
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

// Get user by ID
router.get('/users/:userId', requireAdmin, validateInput.userId, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await AdminService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

// Update user status
router.put('/users/:userId/status', requireAdmin, validateInput.userId, validateInput.userStatus, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    await AdminService.updateUserStatus(userId, status, req.adminUser.user_id);

    res.json({
      success: true,
      message: 'User status updated successfully'
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update user details
router.put('/users/:userId', requireAdmin, validateInput.userId, validateInput.userDetails, async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, password } = req.body;

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;

    // Handle password update separately for security
    if (password) {
      const passwordValidation = AuthService.validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          success: false,
          error: passwordValidation.message
        });
      }
      
      const passwordHash = await AuthService.hashPassword(password);
      updates.password_hash = passwordHash;
    }

    if (Object.keys(updates).length > 0) {
      await AdminService.updateUserDetails(userId, updates);
    }

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all model configurations
router.get('/models', requireAdmin, async (req, res) => {
  try {
    const models = await modelConfigService.getAllModelsAdmin();
    
    res.json({
      success: true,
      data: {
        models
      }
    });
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get models'
    });
  }
});

// Get model configuration by ID
router.get('/models/:modelId', requireAdmin, validateInput.modelId, async (req, res) => {
  try {
    const { modelId } = req.params;
    const model = await modelConfigService.getModelById(modelId);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    res.json({
      success: true,
      data: {
        model
      }
    });
  } catch (error) {
    console.error('Get model error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model'
    });
  }
});

// Create new model configuration
router.post('/models', requireAdmin, validateInput.modelConfig, async (req, res) => {
  try {
    const modelConfig = req.body;
    
    const modelId = await modelConfigService.createModel(modelConfig);
    
    res.status(201).json({
      success: true,
      data: {
        modelId
      },
      message: 'Model created successfully'
    });
  } catch (error) {
    console.error('Create model error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update model configuration
router.put('/models/:modelId', requireAdmin, validateInput.modelId, validateInput.modelConfig, async (req, res) => {
  try {
    const { modelId } = req.params;
    const modelConfig = req.body;
    
    await modelConfigService.updateModel(modelId, modelConfig);
    
    res.json({
      success: true,
      message: 'Model updated successfully'
    });
  } catch (error) {
    console.error('Update model error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete model configuration
router.delete('/models/:modelId', requireAdmin, validateInput.modelId, async (req, res) => {
  try {
    const { modelId } = req.params;
    
    await modelConfigService.deleteModel(modelId);
    
    res.json({
      success: true,
      message: 'Model deleted successfully'
    });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get admin dashboard statistics
router.get('/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await AdminService.getDashboardStats();
    
    res.json({
      success: true,
      data: {
        stats
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard stats'
    });
  }
});

// Tools management endpoints

// Get all tools
router.get('/tools', requireAdmin, async (req, res) => {
  try {
    const tools = Array.from(toolsService.toolConfigs.values()).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      version: tool.version,
      enabled: tool.enabled,
      allowedModels: tool.allowedModels || [],
      maxExecutionTime: tool.maxExecutionTime,
      requiresAuth: tool.requiresAuth,
      rateLimit: tool.rateLimit,
      _loadedAt: tool._loadedAt
    }));
    
    res.json({
      success: true,
      data: {
        tools,
        globalSettings: toolsService.globalConfig?.globalSettings || {}
      }
    });
  } catch (error) {
    console.error('Get tools error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tools'
    });
  }
});

// Get tool by ID
router.get('/tools/:toolId', requireAdmin, validateInput.toolId, async (req, res) => {
  try {
    const { toolId } = req.params;
    const tool = toolsService.getToolConfig(toolId);
    
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found'
      });
    }

    res.json({
      success: true,
      data: {
        tool: {
          id: tool.id,
          name: tool.name,
          description: tool.description,
          version: tool.version,
          enabled: tool.enabled,
          allowedModels: tool.allowedModels || [],
          maxExecutionTime: tool.maxExecutionTime,
          requiresAuth: tool.requiresAuth,
          rateLimit: tool.rateLimit,
          parameters: tool.parameters,
          returns: tool.returns,
          _loadedAt: tool._loadedAt
        }
      }
    });
  } catch (error) {
    console.error('Get tool error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tool'
    });
  }
});

// Enable/disable tool
router.put('/tools/:toolId/enabled', requireAdmin, validateInput.toolId, async (req, res) => {
  try {
    const { toolId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      });
    }

    if (enabled) {
      await toolsService.enableTool(toolId);
    } else {
      await toolsService.disableTool(toolId);
    }

    res.json({
      success: true,
      message: `Tool ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Update tool enabled error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update tool configuration
router.put('/tools/:toolId', requireAdmin, validateInput.toolId, async (req, res) => {
  try {
    const { toolId } = req.params;
    const updates = req.body;
    
    const tool = toolsService.getToolConfig(toolId);
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found'
      });
    }

    // Merge updates with existing config
    const updatedConfig = { ...tool, ...updates };
    
    // Validate and save
    toolsService.validateToolConfig(updatedConfig);
    await toolsService.saveToolConfig(toolId, updatedConfig);
    
    // Update in memory
    toolsService.toolConfigs.set(toolId, updatedConfig);

    res.json({
      success: true,
      message: 'Tool updated successfully'
    });
  } catch (error) {
    console.error('Update tool error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Global tools settings
router.get('/tools/global/settings', requireAdmin, async (req, res) => {
  try {
    const settings = toolsService.globalConfig?.globalSettings || {};
    
    res.json({
      success: true,
      data: {
        settings
      }
    });
  } catch (error) {
    console.error('Get global tools settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get global tools settings'
    });
  }
});

// Update global tools settings
router.put('/tools/global/settings', requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    
    // Update global settings
    toolsService.globalConfig.globalSettings = {
      ...toolsService.globalConfig.globalSettings,
      ...updates
    };
    
    await toolsService.saveGlobalConfig();

    res.json({
      success: true,
      message: 'Global tools settings updated successfully'
    });
  } catch (error) {
    console.error('Update global tools settings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get active tool executions
router.get('/tools/executions', requireAdmin, async (req, res) => {
  try {
    const executions = toolsService.getActiveExecutions();
    
    res.json({
      success: true,
      data: {
        executions,
        count: executions.length
      }
    });
  } catch (error) {
    console.error('Get tool executions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tool executions'
    });
  }
});

// Mount admin tools routes
router.use('/tools', adminToolsRoutes);

export default router;