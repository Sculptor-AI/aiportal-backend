import express from 'express';
import toolsService from '../services/toolsService.js';
import externalCodeExecutionService from '../services/externalCodeExecutionService.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Serverless code execution endpoint for frontend integration
// This endpoint allows code execution without authentication for AI-generated code blocks
router.post('/execute-code', async (req, res) => {
    try {
        const { code, language, variables, execution_id } = req.body;
        
        // Validate required parameters
        if (!code || typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Code parameter is required and must be a string'
            });
        }

        // Validate code length
        if (code.length > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Code length exceeds maximum limit of 10,000 characters'
            });
        }

        // Generate execution ID if not provided
        const finalExecutionId = execution_id || `serverless_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Execute the code using external API
        const result = await externalCodeExecutionService.executeCode(code, language, variables || {});
        
        // Return the result with the execution ID
        res.json({
            success: true,
            execution_id: finalExecutionId,
            result: result,
            execution_time: result.execution_time,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Serverless code execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Streaming serverless code execution endpoint for real-time progress
router.post('/execute-code/stream', async (req, res) => {
    try {
        const { code, language, variables, execution_id } = req.body;
        
        // Validate required parameters
        if (!code || typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Code parameter is required and must be a string'
            });
        }

        // Validate code length
        if (code.length > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Code length exceeds maximum limit of 10,000 characters'
            });
        }

        // Generate execution ID if not provided
        const finalExecutionId = execution_id || `serverless_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial connection message
        res.write(`data: ${JSON.stringify({ 
            type: 'connected', 
            execution_id: finalExecutionId,
            message: 'Serverless code execution stream connected' 
        })}\n\n`);

        // Send execution started event
        res.write(`data: ${JSON.stringify({
            type: 'execution_started',
            execution_id: finalExecutionId,
            message: 'Code execution started'
        })}\n\n`);

        try {
            // Execute the code using external API
            const result = await externalCodeExecutionService.executeCode(code, language, variables || {});
            
            // Send final completion event
            res.write(`data: ${JSON.stringify({
                type: 'execution_completed',
                execution_id: finalExecutionId,
                result: result,
                execution_time: result.execution_time,
                timestamp: new Date().toISOString()
            })}\n\n`);
            
        } catch (error) {
            // Send error event
            res.write(`data: ${JSON.stringify({
                type: 'execution_failed',
                execution_id: finalExecutionId,
                error: error.message,
                timestamp: new Date().toISOString()
            })}\n\n`);
        }

        // Keep connection alive
        const keepAlive = setInterval(() => {
            res.write(`data: ${JSON.stringify({ 
                type: 'ping', 
                execution_id: finalExecutionId,
                timestamp: Date.now() 
            })}\n\n`);
        }, 30000);

        req.on('close', () => {
            clearInterval(keepAlive);
        });

    } catch (error) {
        console.error('Streaming serverless code execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get supported programming languages for code execution
router.get('/languages', async (req, res) => {
    try {
        const languages = externalCodeExecutionService.getSupportedLanguages();
        res.json({
            success: true,
            languages,
            count: languages.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all available tools
router.get('/tools', protect, async (req, res) => {
    try {
        const tools = toolsService.getAllTools();
        res.json({
            success: true,
            tools,
            toolsEnabled: toolsService.isToolsEnabled()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get tools for a specific model
router.get('/tools/:modelId', protect, async (req, res) => {
    try {
        const { modelId } = req.params;
        const tools = toolsService.getToolsForModel(modelId);
        res.json({
            success: true,
            tools,
            modelId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Execute a tool directly
router.post('/tools/:toolId/execute', protect, async (req, res) => {
    try {
        const { toolId } = req.params;
        const { parameters, modelId } = req.body;
        
        const result = await toolsService.executeTool(toolId, parameters, modelId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Pause a tool execution
router.post('/executions/:executionId/pause', protect, async (req, res) => {
    try {
        const { executionId } = req.params;
        const result = await toolsService.pauseExecution(executionId);
        res.json(result);
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

// Resume a tool execution
router.post('/executions/:executionId/resume', protect, async (req, res) => {
    try {
        const { executionId } = req.params;
        const result = await toolsService.resumeExecution(executionId);
        res.json(result);
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

// Cancel a tool execution
router.post('/executions/:executionId/cancel', protect, async (req, res) => {
    try {
        const { executionId } = req.params;
        const result = await toolsService.cancelExecution(executionId);
        res.json(result);
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
});

// Get execution status
router.get('/executions/:executionId/status', protect, async (req, res) => {
    try {
        const { executionId } = req.params;
        const status = toolsService.getExecutionStatus(executionId);
        
        if (!status.found) {
            return res.status(404).json({
                success: false,
                error: 'Execution not found'
            });
        }
        
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all executions
router.get('/executions', protect, async (req, res) => {
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

// WebSocket endpoint for real-time execution updates
router.get('/executions/stream', protect, async (req, res) => {
    // Set up SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Tool execution stream connected' })}\n\n`);

    // Set up event listeners
    const onExecutionEvent = (eventType, data) => {
        res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
    };

    // Listen to all execution events
    toolsService.executionEventEmitter.on('execution_started', (data) => onExecutionEvent('execution_started', data));
    toolsService.executionEventEmitter.on('execution_completed', (data) => onExecutionEvent('execution_completed', data));
    toolsService.executionEventEmitter.on('execution_failed', (data) => onExecutionEvent('execution_failed', data));
    toolsService.executionEventEmitter.on('execution_paused', (data) => onExecutionEvent('execution_paused', data));
    toolsService.executionEventEmitter.on('execution_resumed', (data) => onExecutionEvent('execution_resumed', data));
    toolsService.executionEventEmitter.on('execution_cancelled', (data) => onExecutionEvent('execution_cancelled', data));
    toolsService.executionEventEmitter.on('execution_progress', (data) => onExecutionEvent('execution_progress', data));
    toolsService.executionEventEmitter.on('execution_progress_structured', (data) => onExecutionEvent('execution_progress_structured', data));
    toolsService.executionEventEmitter.on('execution_status', (data) => onExecutionEvent('execution_status', data));

    // Handle client disconnect
    req.on('close', () => {
        toolsService.executionEventEmitter.removeAllListeners();
        res.end();
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
    }, 30000);

    req.on('close', () => {
        clearInterval(keepAlive);
    });
});

export default router;