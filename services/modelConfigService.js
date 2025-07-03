import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';
import toolsService from './toolsService.js';

class ModelConfigService {
    constructor() {
        this.configPath = path.join(process.cwd(), 'model_config');
        this.globalConfig = null;
        this.modelConfigs = new Map();
        this.watcher = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.loadGlobalConfig();
        await this.loadAllModelConfigs();
        
        if (this.globalConfig?.hotReload) {
            this.setupFileWatcher();
        }
        
        this.initialized = true;
        console.log(`✅ Model configuration service initialized with ${this.modelConfigs.size} models`);
    }

    async loadGlobalConfig() {
        try {
            const configPath = path.join(this.configPath, 'config.json');
            const configData = await fs.readFile(configPath, 'utf-8');
            this.globalConfig = JSON.parse(configData);
        } catch (error) {
            console.error('❌ Failed to load global config:', error.message);
            // Use default configuration
            this.globalConfig = {
                rateLimitingEnabled: true,
                defaultGlobalRateLimit: { requests: 1000, window: { amount: 1, unit: 'hour' } },
                defaultUserRateLimit: { requests: 50, window: { amount: 6, unit: 'hours' } },
                queueConfig: { enabled: true, maxQueueSize: 1000, processingTimeout: 30000, retryAttempts: 3 },
                hotReload: false
            };
        }
    }

    async loadAllModelConfigs() {
        const modelsPath = path.join(this.configPath, 'models');
        
        try {
            const providers = await fs.readdir(modelsPath);
            
            for (const provider of providers) {
                const providerPath = path.join(modelsPath, provider);
                const stat = await fs.stat(providerPath);
                
                if (stat.isDirectory()) {
                    await this.loadProviderModels(provider, providerPath);
                }
            }
        } catch (error) {
            console.error('❌ Failed to load model configs:', error.message);
        }
    }

    async loadProviderModels(provider, providerPath) {
        try {
            const files = await fs.readdir(providerPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(providerPath, file);
                    const configData = await fs.readFile(filePath, 'utf-8');
                    const config = JSON.parse(configData);
                    
                    // Validate and enhance config
                    this.validateModelConfig(config);
                    this.enhanceModelConfig(config, provider);
                    
                    // Store with full ID (provider/modelId)
                    const fullId = `${provider}/${config.id}`;
                    this.modelConfigs.set(fullId, config);
                    console.log(`📁 Loaded model: ${fullId} (${config.displayName})`);
                }
            }
        } catch (error) {
            console.error(`❌ Failed to load ${provider} models:`, error.message);
        }
    }

    validateModelConfig(config) {
        const required = ['id', 'displayName', 'provider', 'apiModel', 'enabled'];
        for (const field of required) {
            if (!config[field] && field !== 'enabled') {
                throw new Error(`Missing required field: ${field}`);
            }
        }
    }

    enhanceModelConfig(config, provider) {
        // Apply defaults from global config
        if (!config.globalRateLimit) {
            config.globalRateLimit = { ...this.globalConfig.defaultGlobalRateLimit };
        }
        
        if (!config.userRateLimit) {
            config.userRateLimit = { ...this.globalConfig.defaultUserRateLimit };
        }
        
        // Ensure provider matches directory
        config.provider = provider;
        
        // Store the original ID and the full ID
        config.originalId = config.id;
        config.fullId = `${provider}/${config.id}`;
        
        // Add timestamp for cache invalidation
        config._loadedAt = Date.now();
    }

    setupFileWatcher() {
        this.watcher = chokidar.watch(this.configPath, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        this.watcher
            .on('change', async (filePath) => {
                console.log(`🔄 Config file changed: ${filePath}`);
                if (filePath.includes('config.json')) {
                    await this.loadGlobalConfig();
                } else if (filePath.endsWith('.json')) {
                    await this.reloadModelConfig(filePath);
                }
            })
            .on('add', async (filePath) => {
                if (filePath.endsWith('.json')) {
                    console.log(`➕ New config file: ${filePath}`);
                    await this.reloadModelConfig(filePath);
                }
            })
            .on('unlink', (filePath) => {
                if (filePath.endsWith('.json')) {
                    console.log(`➖ Config file removed: ${filePath}`);
                    const modelId = this.getModelIdFromPath(filePath);
                    if (modelId) {
                        this.modelConfigs.delete(modelId);
                    }
                }
            });
    }

    async reloadModelConfig(filePath) {
        try {
            const configData = await fs.readFile(filePath, 'utf-8');
            const config = JSON.parse(configData);
            const provider = this.getProviderFromPath(filePath);
            
            this.validateModelConfig(config);
            this.enhanceModelConfig(config, provider);
            
            // Use full ID for storage
            const fullId = `${provider}/${config.id}`;
            this.modelConfigs.set(fullId, config);
            console.log(`🔄 Reloaded model: ${fullId}`);
        } catch (error) {
            console.error(`❌ Failed to reload config ${filePath}:`, error.message);
        }
    }

    getProviderFromPath(filePath) {
        const parts = filePath.split(path.sep);
        const modelsIndex = parts.findIndex(part => part === 'models');
        return modelsIndex >= 0 && modelsIndex < parts.length - 1 ? parts[modelsIndex + 1] : 'unknown';
    }

    getModelIdFromPath(filePath) {
        // Extract provider and model name from path
        const provider = this.getProviderFromPath(filePath);
        const fileName = path.basename(filePath, '.json');
        
        // Construct the full ID that would be used
        const fullId = `${provider}/${fileName}`;
        
        // Check if this model exists in our configs
        if (this.modelConfigs.has(fullId)) {
            return fullId;
        }
        
        // Fallback: search through all configs
        for (const [id, config] of this.modelConfigs) {
            if (filePath.includes(config.provider) && filePath.includes(config.originalId || config.id)) {
                return id;
            }
        }
        return null;
    }

    // Public API methods
    getAllModels() {
        return Array.from(this.modelConfigs.values())
            .filter(config => config.enabled)
            .map(config => ({
                id: config.fullId || config.id,
                displayName: config.displayName,
                provider: config.provider,
                capabilities: config.capabilities || {}
            }));
    }

    getModelConfig(modelId) {
        // First try direct lookup with the provided ID
        let config = this.modelConfigs.get(modelId);
        
        // If not found and modelId doesn't contain a slash, try adding provider prefixes
        if (!config && !modelId.includes('/')) {
            // Try to find a model with this ID in any provider
            for (const [fullId, modelConfig] of this.modelConfigs) {
                if (modelConfig.originalId === modelId || modelConfig.id === modelId) {
                    config = modelConfig;
                    break;
                }
            }
        }
        
        return config;
    }

    isRateLimitingEnabled() {
        return this.globalConfig?.rateLimitingEnabled !== false;
    }

    getGlobalConfig() {
        return this.globalConfig;
    }

    getQueueConfig() {
        return this.globalConfig?.queueConfig || {};
    }

    // Rate limit helpers
    getModelGlobalRateLimit(modelId) {
        const config = this.getModelConfig(modelId);
        return config?.globalRateLimit || this.globalConfig?.defaultGlobalRateLimit;
    }

    getModelUserRateLimit(modelId) {
        const config = this.getModelConfig(modelId);
        return config?.userRateLimit || this.globalConfig?.defaultUserRateLimit;
    }

    // Convert time window to milliseconds
    getWindowDurationMs(window) {
        const { amount, unit } = window;
        const multipliers = {
            'second': 1000,
            'seconds': 1000,
            'minute': 60 * 1000,
            'minutes': 60 * 1000,
            'hour': 60 * 60 * 1000,
            'hours': 60 * 60 * 1000,
            'day': 24 * 60 * 60 * 1000,
            'days': 24 * 60 * 60 * 1000
        };
        
        return amount * (multipliers[unit] || multipliers['hour']);
    }

    // Tools integration methods
    getToolsForModel(modelId) {
        const config = this.getModelConfig(modelId);
        
        if (!config || !config.capabilities?.tools || !config.tools?.enabled) {
            return [];
        }

        // Get tools from the tools service
        const availableTools = toolsService.getToolsForModel(modelId);
        
        // Filter by model's allowed tools if specified
        if (config.tools.allowedTools && config.tools.allowedTools.length > 0) {
            return availableTools.filter(tool => 
                config.tools.allowedTools.includes(tool.id)
            );
        }
        
        return availableTools;
    }

    isToolsEnabledForModel(modelId) {
        const config = this.getModelConfig(modelId);
        return config?.capabilities?.tools === true && config?.tools?.enabled === true;
    }

    getModelToolsConfig(modelId) {
        const config = this.getModelConfig(modelId);
        return config?.tools || null;
    }

    // Admin methods for model management
    async getModelById(modelId) {
        return this.getModelConfig(modelId);
    }

    async getAllModelsAdmin() {
        return Array.from(this.modelConfigs.values()).map(config => ({
            id: config.fullId || config.id,
            originalId: config.originalId || config.id,
            displayName: config.displayName,
            provider: config.provider,
            apiModel: config.apiModel,
            enabled: config.enabled,
            capabilities: config.capabilities || {},
            globalRateLimit: config.globalRateLimit,
            userRateLimit: config.userRateLimit,
            _loadedAt: config._loadedAt
        }));
    }

    async createModel(modelConfig) {
        this.validateModelConfig(modelConfig);
        
        const provider = modelConfig.provider;
        const providerPath = path.join(this.configPath, 'models', provider);
        
        // Ensure provider directory exists
        try {
            await fs.mkdir(providerPath, { recursive: true });
        } catch (error) {
            // Directory already exists
        }
        
        const filePath = path.join(providerPath, `${modelConfig.id}.json`);
        
        // Check if model already exists
        try {
            await fs.access(filePath);
            throw new Error('Model already exists');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        
        // Enhance the config
        this.enhanceModelConfig(modelConfig, provider);
        
        // Write to file
        await fs.writeFile(filePath, JSON.stringify(modelConfig, null, 2));
        
        // Add to memory
        const fullId = `${provider}/${modelConfig.id}`;
        this.modelConfigs.set(fullId, modelConfig);
        
        console.log(`➕ Created model: ${fullId}`);
        return fullId;
    }

    async updateModel(modelId, updates) {
        const config = this.getModelConfig(modelId);
        if (!config) {
            throw new Error('Model not found');
        }
        
        // Merge updates
        const updatedConfig = { ...config, ...updates };
        this.validateModelConfig(updatedConfig);
        this.enhanceModelConfig(updatedConfig, config.provider);
        
        // Write to file
        const filePath = path.join(this.configPath, 'models', config.provider, `${config.originalId || config.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(updatedConfig, null, 2));
        
        // Update in memory
        this.modelConfigs.set(modelId, updatedConfig);
        
        console.log(`🔄 Updated model: ${modelId}`);
    }

    async deleteModel(modelId) {
        const config = this.getModelConfig(modelId);
        if (!config) {
            throw new Error('Model not found');
        }
        
        // Remove file
        const filePath = path.join(this.configPath, 'models', config.provider, `${config.originalId || config.id}.json`);
        await fs.unlink(filePath);
        
        // Remove from memory
        this.modelConfigs.delete(modelId);
        
        console.log(`🗑️ Deleted model: ${modelId}`);
    }

    async shutdown() {
        if (this.watcher) {
            await this.watcher.close();
        }
        console.log('🔽 Model configuration service shutdown');
    }
}

// Export singleton instance
export default new ModelConfigService();