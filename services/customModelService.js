import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RouterboxService } from './routerboxService.js';
import { RateLimitingService } from './rateLimitingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CustomModelService {
  static customModelsPath = path.join(__dirname, '..', 'custom-models');

  static async loadCustomModels() {
    try {
      const files = fs.readdirSync(this.customModelsPath);
      const models = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.customModelsPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const model = JSON.parse(content);
            
            // Validate model structure
            if (this.validateModel(model)) {
              models.push(model);
            } else {
              console.warn(`Invalid custom model structure in ${file}`);
            }
          } catch (error) {
            console.error(`Error loading custom model ${file}:`, error);
          }
        }
      }

      return models;
    } catch (error) {
      console.error('Error loading custom models:', error);
      return [];
    }
  }

  static validateModel(model) {
    const requiredFields = [
      'name', 'id', 'base_model', 'system_prompt', 
      'rate_limits', 'provider', 'provider_config'
    ];

    return requiredFields.every(field => model[field] !== undefined);
  }

  static async getCustomModel(modelId) {
    const models = await this.loadCustomModels();
    return models.find(model => model.id === modelId);
  }

  static async getAllCustomModels() {
    const models = await this.loadCustomModels();
    return models.filter(model => model.is_active !== false);
  }

  static isCustomModel(modelId) {
    return modelId.startsWith('custom/');
  }

  static async routeCustomModel(params) {
    const { model, messages, temperature, user, streaming } = params;
    
    // Load the custom model definition
    const customModel = await this.getCustomModel(model);
    if (!customModel) {
      throw new Error(`Custom model ${model} not found`);
    }

    // Check rate limits
    const rateLimitResult = await RateLimitingService.checkRateLimit(user, model, customModel.rate_limits);
    if (!rateLimitResult.allowed) {
      const error = new Error(rateLimitResult.error);
      error.status = 429;
      error.retryAfter = rateLimitResult.retryAfter;
      error.rateLimitInfo = {
        limitType: rateLimitResult.limitType,
        limit: rateLimitResult.limit,
        current: rateLimitResult.current,
        retryAfter: rateLimitResult.retryAfter
      };
      throw error;
    }

    // Route to the base model with custom configuration
    const baseModelParams = {
      model: customModel.base_model,
      messages: messages, // Don't modify messages, let RouterboxService handle system prompt
      temperature: customModel.provider_config.temperature || temperature,
      user,
      streaming,
      systemPrompt: customModel.system_prompt,
      ...customModel.provider_config
    };

    // Route through RouterboxService
    if (streaming) {
      throw new Error('Streaming not supported in this context for custom models');
    } else {
      const response = await RouterboxService.routeChat(baseModelParams);
      
      // Record usage after successful response
      await RateLimitingService.recordUsage(user, model);
      
      return response;
    }
  }

  static async streamCustomModel(params, writeCallback) {
    const { model, messages, temperature, user } = params;
    
    // Load the custom model definition
    const customModel = await this.getCustomModel(model);
    if (!customModel) {
      throw new Error(`Custom model ${model} not found`);
    }

    // Check rate limits
    const rateLimitResult = await RateLimitingService.checkRateLimit(user, model, customModel.rate_limits);
    if (!rateLimitResult.allowed) {
      const error = new Error(rateLimitResult.error);
      error.status = 429;
      error.retryAfter = rateLimitResult.retryAfter;
      error.rateLimitInfo = {
        limitType: rateLimitResult.limitType,
        limit: rateLimitResult.limit,
        current: rateLimitResult.current,
        retryAfter: rateLimitResult.retryAfter
      };
      throw error;
    }

    // Route to the base model with custom configuration
    const baseModelParams = {
      model: customModel.base_model,
      messages: messages, // Don't modify messages, let RouterboxService handle system prompt
      temperature: customModel.provider_config.temperature || temperature,
      user,
      systemPrompt: customModel.system_prompt,
      ...customModel.provider_config
    };

    // Route through RouterboxService
    const result = await RouterboxService.streamChat(baseModelParams, writeCallback);
    
    // Record usage after successful response
    await RateLimitingService.recordUsage(user, model);
    
    return result;
  }

  static async createCustomModel(modelData, userId) {
    // Validate the model data
    if (!this.validateModel(modelData)) {
      throw new Error('Invalid model structure');
    }

    // Generate a unique ID if not provided
    if (!modelData.id) {
      const slug = modelData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      modelData.id = `custom/${slug}`;
    }

    // Set timestamps
    modelData.created_at = new Date().toISOString();
    modelData.updated_at = new Date().toISOString();
    modelData.created_by = userId;
    modelData.is_active = true;

    // Save to file with path traversal protection
    const filename = this.sanitizeFilename(modelData.id.replace('custom/', '')) + '.json';
    const filePath = path.join(this.customModelsPath, filename);
    
    // Ensure the resolved path is still within the custom models directory
    if (!this.isPathSafe(filePath)) {
      throw new Error('Invalid model ID: path traversal detected');
    }
    
    fs.writeFileSync(filePath, JSON.stringify(modelData, null, 2));
    
    return modelData;
  }

  static async updateCustomModel(modelId, updates, userId) {
    const existingModel = await this.getCustomModel(modelId);
    if (!existingModel) {
      throw new Error(`Custom model ${modelId} not found`);
    }

    // Merge updates
    const updatedModel = {
      ...existingModel,
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: userId
    };

    // Validate the updated model
    if (!this.validateModel(updatedModel)) {
      throw new Error('Invalid model structure after update');
    }

    // Save to file with path traversal protection
    const filename = this.sanitizeFilename(modelId.replace('custom/', '')) + '.json';
    const filePath = path.join(this.customModelsPath, filename);
    
    // Ensure the resolved path is still within the custom models directory
    if (!this.isPathSafe(filePath)) {
      throw new Error('Invalid model ID: path traversal detected');
    }
    
    fs.writeFileSync(filePath, JSON.stringify(updatedModel, null, 2));
    
    return updatedModel;
  }

  static async deleteCustomModel(modelId, userId) {
    const existingModel = await this.getCustomModel(modelId);
    if (!existingModel) {
      throw new Error(`Custom model ${modelId} not found`);
    }

    // Soft delete by setting is_active to false
    await this.updateCustomModel(modelId, { 
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: userId
    }, userId);
  }

  // TODO: Implement rate limiting
  static async checkRateLimit(userId, modelId, rateLimits) {
    // This would check against the database rate_limits table
    // For now, just return true
    return true;
  }

  // Security helper methods
  static sanitizeFilename(filename) {
    // Remove any path traversal characters and other dangerous characters
    return filename.replace(/[^a-zA-Z0-9._-]/g, '');
  }

  static isPathSafe(filePath) {
    // Resolve the path and check if it's within the custom models directory
    const resolvedPath = path.resolve(filePath);
    const resolvedCustomModelsPath = path.resolve(this.customModelsPath);
    
    // Check if the resolved path starts with the custom models directory
    return resolvedPath.startsWith(resolvedCustomModelsPath + path.sep) || 
           resolvedPath === resolvedCustomModelsPath;
  }
}