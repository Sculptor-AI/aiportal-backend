import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import chokidar from 'chokidar';

class ToolsService {
    constructor() {
        this.toolsPath = path.join(process.cwd(), 'tools');
        this.globalConfig = null;
        this.toolConfigs = new Map();
        this.watcher = null;
        this.initialized = false;
        this.activeExecutions = new Map();
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
        const required = ['id', 'name', 'description', 'version', 'parameters'];
        for (const field of required) {
            if (!config[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
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
                parameters
            });

            const result = await this.executeToolController(config, parameters);
            
            return {
                success: true,
                toolId,
                executionId,
                result,
                executionTime: Date.now() - this.activeExecutions.get(executionId).startTime
            };
        } catch (error) {
            return {
                success: false,
                toolId,
                executionId,
                error: error.message,
                executionTime: Date.now() - this.activeExecutions.get(executionId).startTime
            };
        } finally {
            this.activeExecutions.delete(executionId);
        }
    }

    async executeToolController(config, parameters) {
        return new Promise((resolve, reject) => {
            const timeout = config.maxExecutionTime || this.globalConfig.globalSettings.toolExecutionTimeout;
            
            const child = spawn('python3', [config.controllerPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: timeout
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
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