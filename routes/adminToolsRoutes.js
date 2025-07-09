import express from 'express';
import toolsService from '../services/toolsService.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get all tools with detailed information
router.get('/tools', requireAdmin, async (req, res) => {
    try {
        const tools = toolsService.getAllTools();
        const toolsStatus = {
            enabled: toolsService.isToolsEnabled(),
            toolCount: tools.length,
            tools: tools.map(tool => ({
                ...tool,
                config: toolsService.getToolConfig(tool.id)
            }))
        };
        
        res.json({
            success: true,
            ...toolsStatus
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get detailed tool configuration
router.get('/tools/:toolId', requireAdmin, async (req, res) => {
    try {
        const { toolId } = req.params;
        const config = toolsService.getToolConfig(toolId);
        
        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Tool not found'
            });
        }
        
        res.json({
            success: true,
            tool: config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update tool configuration
router.put('/tools/:toolId', requireAdmin, async (req, res) => {
    try {
        const { toolId } = req.params;
        const updates = req.body;
        
        const config = toolsService.getToolConfig(toolId);
        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Tool not found'
            });
        }
        
        // Update configuration
        const updatedConfig = { ...config, ...updates };
        await toolsService.saveToolConfig(toolId, updatedConfig);
        
        res.json({
            success: true,
            message: 'Tool configuration updated',
            tool: updatedConfig
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enable/disable tool
router.post('/tools/:toolId/toggle', requireAdmin, async (req, res) => {
    try {
        const { toolId } = req.params;
        const { enabled } = req.body;
        
        if (enabled) {
            await toolsService.enableTool(toolId);
        } else {
            await toolsService.disableTool(toolId);
        }
        
        res.json({
            success: true,
            message: `Tool ${enabled ? 'enabled' : 'disabled'}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get global tools configuration
router.get('/config', requireAdmin, async (req, res) => {
    try {
        const config = toolsService.globalConfig;
        res.json({
            success: true,
            config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update global tools configuration
router.put('/config', requireAdmin, async (req, res) => {
    try {
        const updates = req.body;
        
        // Update global config
        Object.assign(toolsService.globalConfig, updates);
        await toolsService.saveGlobalConfig();
        
        res.json({
            success: true,
            message: 'Global configuration updated',
            config: toolsService.globalConfig
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Toggle global tools system
router.post('/toggle', requireAdmin, async (req, res) => {
    try {
        const { enabled } = req.body;
        await toolsService.setGlobalToolsEnabled(enabled);
        
        res.json({
            success: true,
            message: `Tools system ${enabled ? 'enabled' : 'disabled'}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all active and paused executions
router.get('/executions', requireAdmin, async (req, res) => {
    try {
        const executions = toolsService.getAllExecutions();
        res.json({
            success: true,
            executions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cancel all running executions
router.post('/executions/cancel-all', requireAdmin, async (req, res) => {
    try {
        const executions = toolsService.getAllExecutions();
        const cancelledIds = [];
        
        // Cancel all active executions
        for (const execution of executions.active) {
            await toolsService.cancelExecution(execution.id);
            cancelledIds.push(execution.id);
        }
        
        // Cancel all paused executions
        for (const execution of executions.paused) {
            await toolsService.cancelExecution(execution.id);
            cancelledIds.push(execution.id);
        }
        
        res.json({
            success: true,
            message: `Cancelled ${cancelledIds.length} executions`,
            cancelledIds
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get tool analytics and metrics
router.get('/analytics', requireAdmin, async (req, res) => {
    try {
        const tools = toolsService.getAllTools();
        const executions = toolsService.getAllExecutions();
        
        const analytics = {
            totalTools: tools.length,
            enabledTools: tools.filter(t => t.enabled).length,
            disabledTools: tools.filter(t => !t.enabled).length,
            activeExecutions: executions.active.length,
            pausedExecutions: executions.paused.length,
            toolsEnabled: toolsService.isToolsEnabled(),
            toolsByType: tools.reduce((acc, tool) => {
                const type = tool.id.split('-')[0];
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {}),
            executionsByTool: executions.active.concat(executions.paused).reduce((acc, exec) => {
                acc[exec.toolId] = (acc[exec.toolId] || 0) + 1;
                return acc;
            }, {})
        };
        
        res.json({
            success: true,
            analytics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test tool functionality
router.post('/tools/:toolId/test', requireAdmin, async (req, res) => {
    try {
        const { toolId } = req.params;
        const { parameters } = req.body;
        
        const testParameters = parameters || {};
        
        // Add test parameters based on tool type
        if (toolId === 'code-execution') {
            testParameters.code = testParameters.code || 'print("Hello, World!")\nresult = 2 + 2';
        } else if (toolId === 'test-tool') {
            testParameters.message = testParameters.message || 'Admin test message';
        }
        
        const result = await toolsService.executeTool(toolId, testParameters);
        
        res.json({
            success: true,
            testResult: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create new tool
router.post('/create', requireAdmin, async (req, res) => {
    try {
        const { toolId, toolName, options } = req.body;
        
        if (!toolId || !toolName) {
            return res.status(400).json({
                success: false,
                error: 'toolId and toolName are required'
            });
        }
        
        const result = await toolsService.createNewTool(toolId, toolName, options);
        
        res.json({
            success: true,
            message: 'Tool created successfully',
            tool: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Validate all tools
router.get('/validate', requireAdmin, async (req, res) => {
    try {
        const validationResults = await toolsService.validateAllTools();
        
        const summary = {
            totalTools: Object.keys(validationResults).length,
            validTools: Object.values(validationResults).filter(r => r.overall).length,
            invalidTools: Object.values(validationResults).filter(r => !r.overall).length
        };
        
        res.json({
            success: true,
            summary,
            validationResults
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get tool template for creation
router.get('/template/:toolId', requireAdmin, async (req, res) => {
    try {
        const { toolId } = req.params;
        const { toolName = 'New Tool' } = req.query;
        
        const toolConfigValidator = (await import('../utils/toolConfigValidator.js')).default;
        const template = toolConfigValidator.generateConfigTemplate(toolId, toolName);
        
        res.json({
            success: true,
            template
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;