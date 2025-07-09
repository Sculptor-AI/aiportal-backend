import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import toolConfigValidator from '../utils/toolConfigValidator.js';

class ToolsService {
    constructor() {
        this.toolsPath = path.join(process.cwd(), 'tools');
        this.globalConfig = null;
        this.toolConfigs = new Map();
        this.watcher = null;
        this.initialized = false;
        this.activeExecutions = new Map();
        this.pausedExecutions = new Map();
        this.executionEventEmitter = new EventEmitter();
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.loadGlobalConfig();
        await this.loadAllToolConfigs();
        
        if (this.globalConfig?.hotReload) {
            this.setupFileWatcher();
        }
        
        this.initialized = true;
        console.log(`🔧 Tools service initialized with ${this.toolConfigs.size} tools`);
    }

    async loadGlobalConfig() {
        try {
            const configPath = path.join(this.toolsPath, 'config.json');
            const configData = await fs.readFile(configPath, 'utf-8');
            this.globalConfig = JSON.parse(configData);
        } catch (error) {
            console.error('❌ Failed to load global tools config:', error.message);
            // Use default configuration
            this.globalConfig = {
                globalSettings: {
                    enabled: false,
                    maxConcurrentToolCalls: 5,
                    toolExecutionTimeout: 30000,
                    allowedModels: [],
                    blockedModels: []
                },
                availableTools: {}
            };
        }
    }

    async loadAllToolConfigs() {
        try {
            const entries = await fs.readdir(this.toolsPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const toolPath = path.join(this.toolsPath, entry.name);
                    await this.loadToolConfig(entry.name, toolPath);
                }
            }
        } catch (error) {
            console.error('❌ Failed to load tool configs:', error.message);
        }
    }

    async loadToolConfig(toolId, toolPath) {
        try {
            const configPath = path.join(toolPath, 'config.json');
            const controllerPath = path.join(toolPath, 'controller.py');
            
            // Check if required files exist
            await fs.access(configPath);
            await fs.access(controllerPath);
            
            const configData = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(configData);
            
            // Validate and enhance config
            this.validateToolConfig(config);
            config.controllerPath = controllerPath;
            config._loadedAt = Date.now();
            
            this.toolConfigs.set(toolId, config);
            console.log(`🔧 Loaded tool: ${toolId} (${config.name})`);
        } catch (error) {
            console.error(`❌ Failed to load tool ${toolId}:`, error.message);
        }
    }

    validateToolConfig(config) {
        const validation = toolConfigValidator.validateConfig(config);
        
        if (!validation.isValid) {
            throw new Error(`Tool configuration validation failed: ${validation.errors.join(', ')}`);
        }
        
        // Log warnings
        if (validation.warnings.length > 0) {
            console.warn(`⚠️ Tool configuration warnings: ${validation.warnings.join(', ')}`);
        }
        
        return validation;
    }

    setupFileWatcher() {
        this.watcher = chokidar.watch(this.toolsPath, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        this.watcher
            .on('change', async (filePath) => {
                console.log(`🔄 Tool file changed: ${filePath}`);
                if (filePath.includes('config.json')) {
                    if (path.basename(path.dirname(filePath)) === 'tools') {
                        // Global config changed
                        await this.loadGlobalConfig();
                    } else {
                        // Tool config changed
                        const toolId = path.basename(path.dirname(filePath));
                        const toolPath = path.dirname(filePath);
                        await this.loadToolConfig(toolId, toolPath);
                    }
                }
            })
            .on('add', async (filePath) => {
                if (filePath.includes('config.json')) {
                    const toolId = path.basename(path.dirname(filePath));
                    const toolPath = path.dirname(filePath);
                    console.log(`➕ New tool config: ${toolId}`);
                    await this.loadToolConfig(toolId, toolPath);
                }
            })
            .on('unlink', (filePath) => {
                if (filePath.includes('config.json')) {
                    const toolId = path.basename(path.dirname(filePath));
                    console.log(`➖ Tool config removed: ${toolId}`);
                    this.toolConfigs.delete(toolId);
                }
            });
    }

    // Public API methods
    isToolsEnabled() {
        return this.globalConfig?.globalSettings?.enabled === true;
    }

    getAllTools() {
        return Array.from(this.toolConfigs.values())
            .filter(config => config.enabled)
            .map(config => ({
                id: config.id,
                name: config.name,
                description: config.description,
                version: config.version,
                parameters: config.parameters,
                returns: config.returns
            }));
    }

    getToolConfig(toolId) {
        return this.toolConfigs.get(toolId);
    }

    getToolsForModel(modelId) {
        if (!this.isToolsEnabled()) {
            return [];
        }

        const globalSettings = this.globalConfig.globalSettings;
        
        // Check if model is blocked
        if (globalSettings.blockedModels.includes(modelId)) {
            return [];
        }

        // Check if model is allowed (if allowedModels is not empty)
        if (globalSettings.allowedModels.length > 0 && !globalSettings.allowedModels.includes(modelId)) {
            return [];
        }

        return Array.from(this.toolConfigs.values())
            .filter(config => {
                if (!config.enabled) return false;
                
                // Check tool-specific model restrictions
                if (config.allowedModels && config.allowedModels.length > 0) {
                    return config.allowedModels.includes(modelId);
                }
                
                return true;
            })
            .map(config => ({
                id: config.id,
                name: config.name,
                description: config.description,
                parameters: config.parameters
            }));
    }

    // Pause/Resume functionality
    async pauseExecution(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (!execution) {
            throw new Error(`Execution not found: ${executionId}`);
        }

        if (execution.status === 'paused') {
            return { success: true, message: 'Execution already paused' };
        }

        // Move to paused state
        execution.status = 'paused';
        execution.pausedAt = Date.now();
        
        // Send pause signal to the process if it exists
        if (execution.process && !execution.process.killed) {
            execution.process.kill('SIGSTOP');
        }

        this.pausedExecutions.set(executionId, execution);
        this.executionEventEmitter.emit('execution_paused', { executionId, toolId: execution.toolId });
        
        console.log(`⏸️ Paused tool execution: ${executionId} (${execution.toolId})`);
        return { success: true, message: 'Execution paused' };
    }

    async resumeExecution(executionId) {
        const execution = this.pausedExecutions.get(executionId) || this.activeExecutions.get(executionId);
        if (!execution) {
            throw new Error(`Execution not found: ${executionId}`);
        }

        if (execution.status !== 'paused') {
            return { success: true, message: 'Execution is not paused' };
        }

        // Resume the process
        execution.status = 'running';
        execution.resumedAt = Date.now();
        
        // Send resume signal to the process if it exists
        if (execution.process && !execution.process.killed) {
            execution.process.kill('SIGCONT');
        }

        this.pausedExecutions.delete(executionId);
        this.executionEventEmitter.emit('execution_resumed', { executionId, toolId: execution.toolId });
        
        console.log(`▶️ Resumed tool execution: ${executionId} (${execution.toolId})`);
        return { success: true, message: 'Execution resumed' };
    }

    async cancelExecution(executionId) {
        const execution = this.activeExecutions.get(executionId) || this.pausedExecutions.get(executionId);
        if (!execution) {
            throw new Error(`Execution not found: ${executionId}`);
        }

        // Kill the process if it exists
        if (execution.process && !execution.process.killed) {
            execution.process.kill('SIGTERM');
            setTimeout(() => {
                if (!execution.process.killed) {
                    execution.process.kill('SIGKILL');
                }
            }, 5000);
        }

        // Clean up
        this.activeExecutions.delete(executionId);
        this.pausedExecutions.delete(executionId);
        this.executionEventEmitter.emit('execution_cancelled', { executionId, toolId: execution.toolId });
        
        console.log(`🛑 Cancelled tool execution: ${executionId} (${execution.toolId})`);
        return { success: true, message: 'Execution cancelled' };
    }

    getExecutionStatus(executionId) {
        const execution = this.activeExecutions.get(executionId) || this.pausedExecutions.get(executionId);
        if (!execution) {
            return { found: false };
        }

        return {
            found: true,
            executionId,
            toolId: execution.toolId,
            status: execution.status || 'running',
            startTime: execution.startTime,
            pausedAt: execution.pausedAt,
            resumedAt: execution.resumedAt,
            duration: Date.now() - execution.startTime,
            parameters: execution.parameters
        };
    }

    getAllExecutions() {
        const active = Array.from(this.activeExecutions.entries()).map(([id, execution]) => ({
            id,
            ...execution,
            status: execution.status || 'running',
            duration: Date.now() - execution.startTime
        }));

        const paused = Array.from(this.pausedExecutions.entries()).map(([id, execution]) => ({
            id,
            ...execution,
            status: 'paused',
            duration: Date.now() - execution.startTime
        }));

        return { active, paused };
    }

    async executeTool(toolId, parameters, modelId = null) {
        const config = this.getToolConfig(toolId);
        
        if (!config) {
            throw new Error(`Tool not found: ${toolId}`);
        }

        if (!config.enabled) {
            throw new Error(`Tool is disabled: ${toolId}`);
        }

        if (!this.isToolsEnabled()) {
            throw new Error('Tools system is globally disabled');
        }

        // Check model restrictions
        if (modelId && config.allowedModels && config.allowedModels.length > 0) {
            if (!config.allowedModels.includes(modelId)) {
                throw new Error(`Tool ${toolId} is not allowed for model ${modelId}`);
            }
        }

        // Check concurrent execution limits
        const activeCount = this.activeExecutions.size;
        const maxConcurrent = this.globalConfig.globalSettings.maxConcurrentToolCalls;
        
        if (activeCount >= maxConcurrent) {
            throw new Error(`Too many concurrent tool executions (${activeCount}/${maxConcurrent})`);
        }

        const executionId = `${toolId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.activeExecutions.set(executionId, {
                toolId,
                startTime: Date.now(),
                parameters,
                status: 'running'
            });

            // Emit execution started event
            this.executionEventEmitter.emit('execution_started', { executionId, toolId });

            const result = await this.executeToolController(config, parameters, executionId);
            
            // Emit execution completed event
            this.executionEventEmitter.emit('execution_completed', { executionId, toolId, result });
            
            return {
                success: true,
                toolId,
                executionId,
                result,
                executionTime: Date.now() - this.activeExecutions.get(executionId).startTime
            };
        } catch (error) {
            // Emit execution failed event
            this.executionEventEmitter.emit('execution_failed', { executionId, toolId, error: error.message });
            
            return {
                success: false,
                toolId,
                executionId,
                error: error.message,
                executionTime: Date.now() - this.activeExecutions.get(executionId).startTime
            };
        } finally {
            this.activeExecutions.delete(executionId);
            this.pausedExecutions.delete(executionId);
        }
    }

    async executeToolController(config, parameters, executionId) {
        return new Promise((resolve, reject) => {
            const timeout = config.maxExecutionTime || this.globalConfig.globalSettings.toolExecutionTimeout;
            
            const child = spawn('python3', [config.controllerPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: timeout
            });

            // Store process reference for pause/resume functionality
            const execution = this.activeExecutions.get(executionId);
            if (execution) {
                execution.process = child;
            }

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                
                // Try to parse structured progress messages
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.startsWith('PROGRESS:')) {
                        try {
                            const progressData = JSON.parse(line.slice(9));
                            this.executionEventEmitter.emit('execution_progress_structured', {
                                executionId,
                                toolId: execution.toolId,
                                ...progressData
                            });
                        } catch (e) {
                            // Fall back to regular progress event
                            this.executionEventEmitter.emit('execution_progress', { 
                                executionId, 
                                type: 'stdout', 
                                data: line 
                            });
                        }
                    } else if (line.startsWith('STATUS:')) {
                        try {
                            const statusData = JSON.parse(line.slice(7));
                            this.executionEventEmitter.emit('execution_status', {
                                executionId,
                                toolId: execution.toolId,
                                ...statusData
                            });
                        } catch (e) {
                            // Fall back to regular progress event
                            this.executionEventEmitter.emit('execution_progress', { 
                                executionId, 
                                type: 'stdout', 
                                data: line 
                            });
                        }
                    } else if (line.trim() && !line.startsWith('{')) {
                        // Regular output line
                        this.executionEventEmitter.emit('execution_progress', { 
                            executionId, 
                            type: 'stdout', 
                            data: line 
                        });
                    }
                }
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
                // Emit progress event for real-time feedback
                this.executionEventEmitter.emit('execution_progress', { 
                    executionId, 
                    type: 'stderr', 
                    data: data.toString() 
                });
            });

            child.on('close', (code) => {
                // Clean up process reference
                if (execution) {
                    execution.process = null;
                }
                
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (error) {
                        reject(new Error(`Invalid JSON output: ${stdout}`));
                    }
                } else {
                    reject(new Error(`Tool execution failed with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                // Clean up process reference
                if (execution) {
                    execution.process = null;
                }
                reject(new Error(`Failed to execute tool: ${error.message}`));
            });

            // Send parameters to the tool
            child.stdin.write(JSON.stringify(parameters));
            child.stdin.end();
        });
    }

    // Admin methods
    async enableTool(toolId) {
        const config = this.getToolConfig(toolId);
        if (!config) {
            throw new Error(`Tool not found: ${toolId}`);
        }

        config.enabled = true;
        await this.saveToolConfig(toolId, config);
        console.log(`✅ Enabled tool: ${toolId}`);
    }

    async disableTool(toolId) {
        const config = this.getToolConfig(toolId);
        if (!config) {
            throw new Error(`Tool not found: ${toolId}`);
        }

        config.enabled = false;
        await this.saveToolConfig(toolId, config);
        console.log(`❌ Disabled tool: ${toolId}`);
    }

    async saveToolConfig(toolId, config) {
        const toolPath = path.join(this.toolsPath, toolId);
        const configPath = path.join(toolPath, 'config.json');
        
        // Remove internal fields before saving
        const saveConfig = { ...config };
        delete saveConfig.controllerPath;
        delete saveConfig._loadedAt;
        
        await fs.writeFile(configPath, JSON.stringify(saveConfig, null, 2));
    }

    async setGlobalToolsEnabled(enabled) {
        this.globalConfig.globalSettings.enabled = enabled;
        await this.saveGlobalConfig();
        console.log(`🔧 Tools system globally ${enabled ? 'enabled' : 'disabled'}`);
    }

    async saveGlobalConfig() {
        const configPath = path.join(this.toolsPath, 'config.json');
        await fs.writeFile(configPath, JSON.stringify(this.globalConfig, null, 2));
    }

    async createNewTool(toolId, toolName, options = {}) {
        // Validate tool ID
        if (!toolConfigValidator.isValidId(toolId)) {
            throw new Error('Invalid tool ID. Must be alphanumeric with hyphens only.');
        }

        const toolPath = path.join(this.toolsPath, toolId);
        
        // Check if tool already exists
        try {
            await fs.access(toolPath);
            throw new Error(`Tool ${toolId} already exists`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        // Create tool directory
        await fs.mkdir(toolPath, { recursive: true });

        // Generate configuration
        const config = toolConfigValidator.generateConfigTemplate(toolId, toolName);
        
        // Apply any custom options
        Object.assign(config, options);

        // Validate the configuration
        this.validateToolConfig(config);

        // Write configuration file
        const configPath = path.join(toolPath, 'config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        // Create basic controller template
        const controllerTemplate = `#!/usr/bin/env python3
"""
${toolName} Tool Controller
${config.description}
"""

import json
import sys
from datetime import datetime

def main():
    """Main entry point for the tool"""
    try:
        # Read parameters from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            result = {'success': False, 'error': 'No input data provided'}
        else:
            parameters = json.loads(input_data)
            
            # TODO: Implement your tool logic here
            result = {
                'success': True,
                'message': f'${toolName} executed successfully',
                'parameters': parameters,
                'timestamp': datetime.now().isoformat()
            }
        
        # Output result as JSON
        print(json.dumps(result, default=str))
        
    except json.JSONDecodeError:
        result = {'success': False, 'error': 'Invalid JSON input'}
        print(json.dumps(result))
    except Exception as e:
        result = {'success': False, 'error': f'Unexpected error: {str(e)}'}
        print(json.dumps(result))

if __name__ == '__main__':
    main()
`;

        const controllerPath = path.join(toolPath, 'controller.py');
        await fs.writeFile(controllerPath, controllerTemplate);

        // Make controller executable
        await fs.chmod(controllerPath, 0o755);

        // Create README template
        const readmeTemplate = `# ${toolName}

${config.description}

## Parameters

\`\`\`json
${JSON.stringify(config.parameters, null, 2)}
\`\`\`

## Returns

\`\`\`json
${JSON.stringify(config.returns, null, 2)}
\`\`\`

## Usage

This tool can be executed through the AI Portal's tools system.

## Development

To test this tool locally:

\`\`\`bash
echo '{"parameter": "value"}' | python3 controller.py
\`\`\`

## Security

${config.security.sandboxed ? '✅' : '❌'} Sandboxed execution
${config.security.no_file_access ? '✅' : '❌'} No file system access
${config.security.no_network_access ? '✅' : '❌'} No network access
${config.security.memory_limit ? '✅' : '❌'} Memory limited to ${config.security.memory_limit}
${config.security.timeout ? '✅' : '❌'} Execution timeout: ${config.security.timeout}s
`;

        const readmePath = path.join(toolPath, 'README.md');
        await fs.writeFile(readmePath, readmeTemplate);

        // Load the new tool
        await this.loadToolConfig(toolId, toolPath);

        console.log(`🔧 Created new tool: ${toolId} (${toolName})`);
        
        return {
            success: true,
            toolId,
            toolPath,
            config
        };
    }

    async validateAllTools() {
        const validationResults = {};
        
        for (const [toolId, config] of this.toolConfigs.entries()) {
            try {
                // Validate configuration
                const configValidation = toolConfigValidator.validateConfig(config);
                
                // Validate directory structure
                const toolPath = path.join(this.toolsPath, toolId);
                const directoryValidation = await toolConfigValidator.validateToolDirectory(toolPath);
                
                validationResults[toolId] = {
                    config: configValidation,
                    directory: directoryValidation,
                    overall: configValidation.isValid && directoryValidation.isValid
                };
            } catch (error) {
                validationResults[toolId] = {
                    config: { isValid: false, errors: [error.message], warnings: [] },
                    directory: { isValid: false, errors: [], warnings: [] },
                    overall: false
                };
            }
        }
        
        return validationResults;
    }

    getActiveExecutions() {
        return Array.from(this.activeExecutions.entries()).map(([id, execution]) => ({
            id,
            ...execution,
            duration: Date.now() - execution.startTime
        }));
    }

    async shutdown() {
        if (this.watcher) {
            await this.watcher.close();
        }
        
        // Cancel any active executions
        this.activeExecutions.clear();
        
        console.log('🔧 Tools service shutdown');
    }
}

// Export singleton instance
export default new ToolsService();