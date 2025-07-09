import express from 'express';
import toolsService from '../services/toolsService.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

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