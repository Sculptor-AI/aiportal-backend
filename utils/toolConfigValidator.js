/**
 * Tool Configuration Validator
 * Validates tool configurations for security and correctness
 */

import fs from 'fs/promises';
import path from 'path';

class ToolConfigValidator {
    constructor() {
        this.requiredFields = ['id', 'name', 'description', 'version', 'parameters'];
        this.optionalFields = [
            'enabled', 'allowedModels', 'maxExecutionTime', 'requiresAuth',
            'rateLimit', 'returns', 'security', 'metadata'
        ];
        this.validParameterTypes = ['string', 'number', 'boolean', 'object', 'array'];
    }

    /**
     * Validate a tool configuration object
     */
    validateConfig(config) {
        const errors = [];
        const warnings = [];

        // Check required fields
        for (const field of this.requiredFields) {
            if (!config[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Validate specific fields
        if (config.id) {
            if (!this.isValidId(config.id)) {
                errors.push('Tool ID must be alphanumeric with hyphens only');
            }
        }

        if (config.name) {
            if (typeof config.name !== 'string' || config.name.length < 1) {
                errors.push('Tool name must be a non-empty string');
            }
        }

        if (config.description) {
            if (typeof config.description !== 'string' || config.description.length < 10) {
                errors.push('Tool description must be at least 10 characters');
            }
        }

        if (config.version) {
            if (!this.isValidVersion(config.version)) {
                errors.push('Tool version must be in semantic versioning format (e.g., 1.0.0)');
            }
        }

        if (config.parameters) {
            const paramErrors = this.validateParameters(config.parameters);
            errors.push(...paramErrors);
        }

        if (config.allowedModels) {
            if (!Array.isArray(config.allowedModels)) {
                errors.push('allowedModels must be an array');
            }
        }

        if (config.maxExecutionTime) {
            if (typeof config.maxExecutionTime !== 'number' || config.maxExecutionTime < 1000) {
                errors.push('maxExecutionTime must be a number >= 1000 (milliseconds)');
            }
        }

        if (config.rateLimit) {
            const rateLimitErrors = this.validateRateLimit(config.rateLimit);
            errors.push(...rateLimitErrors);
        }

        if (config.security) {
            const securityWarnings = this.validateSecurity(config.security);
            warnings.push(...securityWarnings);
        }

        // Check for unknown fields
        const allValidFields = [...this.requiredFields, ...this.optionalFields];
        for (const field in config) {
            if (!allValidFields.includes(field) && !field.startsWith('_')) {
                warnings.push(`Unknown field: ${field}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate tool parameters schema
     */
    validateParameters(parameters) {
        const errors = [];

        if (!parameters || typeof parameters !== 'object') {
            return ['Parameters must be an object'];
        }

        if (!parameters.type || parameters.type !== 'object') {
            errors.push('Parameters must have type: "object"');
        }

        if (!parameters.properties || typeof parameters.properties !== 'object') {
            errors.push('Parameters must have a properties object');
        }

        if (parameters.properties) {
            for (const [propName, propSchema] of Object.entries(parameters.properties)) {
                if (!propSchema.type || !this.validParameterTypes.includes(propSchema.type)) {
                    errors.push(`Property ${propName} must have a valid type`);
                }

                if (propSchema.type === 'string') {
                    if (propSchema.minLength !== undefined && typeof propSchema.minLength !== 'number') {
                        errors.push(`Property ${propName} minLength must be a number`);
                    }
                    if (propSchema.maxLength !== undefined && typeof propSchema.maxLength !== 'number') {
                        errors.push(`Property ${propName} maxLength must be a number`);
                    }
                }

                if (propSchema.type === 'array') {
                    if (!propSchema.items) {
                        errors.push(`Property ${propName} must define items schema for array type`);
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Validate rate limit configuration
     */
    validateRateLimit(rateLimit) {
        const errors = [];

        if (!rateLimit || typeof rateLimit !== 'object') {
            return ['Rate limit must be an object'];
        }

        if (!rateLimit.requests || typeof rateLimit.requests !== 'number') {
            errors.push('Rate limit requests must be a number');
        }

        if (!rateLimit.window || typeof rateLimit.window !== 'string') {
            errors.push('Rate limit window must be a string (e.g., "1m", "1h")');
        }

        if (rateLimit.window && !this.isValidTimeWindow(rateLimit.window)) {
            errors.push('Rate limit window must be valid format (e.g., "1m", "5m", "1h")');
        }

        return errors;
    }

    /**
     * Validate security configuration
     */
    validateSecurity(security) {
        const warnings = [];

        if (!security.sandboxed) {
            warnings.push('Tool is not sandboxed - consider enabling sandboxing for security');
        }

        if (!security.no_file_access) {
            warnings.push('Tool has file access - consider restricting file access');
        }

        if (!security.no_network_access) {
            warnings.push('Tool has network access - consider restricting network access');
        }

        if (!security.memory_limit) {
            warnings.push('No memory limit specified - consider adding memory constraints');
        }

        if (!security.timeout) {
            warnings.push('No timeout specified - consider adding execution timeout');
        }

        return warnings;
    }

    /**
     * Validate tool directory structure
     */
    async validateToolDirectory(toolPath) {
        const errors = [];
        const warnings = [];

        try {
            // Check if config.json exists
            const configPath = path.join(toolPath, 'config.json');
            try {
                await fs.access(configPath);
            } catch {
                errors.push('config.json file is missing');
            }

            // Check if controller.py exists
            const controllerPath = path.join(toolPath, 'controller.py');
            try {
                await fs.access(controllerPath);
            } catch {
                errors.push('controller.py file is missing');
            }

            // Check if controller.py is executable
            try {
                const stats = await fs.stat(controllerPath);
                if (!(stats.mode & 0o111)) {
                    warnings.push('controller.py is not executable');
                }
            } catch {
                // File doesn't exist, already reported above
            }

            // Check for README or documentation
            const readmePath = path.join(toolPath, 'README.md');
            try {
                await fs.access(readmePath);
            } catch {
                warnings.push('Consider adding README.md for documentation');
            }

            // Check for test files
            const testPath = path.join(toolPath, 'test.py');
            try {
                await fs.access(testPath);
            } catch {
                warnings.push('Consider adding test.py for testing');
            }

        } catch (error) {
            errors.push(`Error validating tool directory: ${error.message}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate tool ID format
     */
    isValidId(id) {
        return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
    }

    /**
     * Validate semantic version format
     */
    isValidVersion(version) {
        return /^\d+\.\d+\.\d+$/.test(version);
    }

    /**
     * Validate time window format
     */
    isValidTimeWindow(window) {
        return /^\d+[smhd]$/.test(window);
    }

    /**
     * Generate tool configuration template
     */
    generateConfigTemplate(toolId, toolName) {
        return {
            id: toolId,
            name: toolName,
            description: "Tool description (minimum 10 characters)",
            version: "1.0.0",
            enabled: true,
            allowedModels: [],
            maxExecutionTime: 30000,
            requiresAuth: false,
            rateLimit: {
                requests: 10,
                window: "1m"
            },
            parameters: {
                type: "object",
                properties: {
                    // Define your parameters here
                },
                required: [],
                additionalProperties: false
            },
            returns: {
                type: "object",
                properties: {
                    success: {
                        type: "boolean",
                        description: "Whether the operation was successful"
                    },
                    result: {
                        description: "The result of the operation"
                    },
                    error: {
                        type: "string",
                        description: "Error message if operation failed"
                    }
                }
            },
            security: {
                sandboxed: true,
                no_file_access: true,
                no_network_access: true,
                memory_limit: "128MB",
                timeout: 30
            },
            metadata: {
                author: "Your Name",
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            }
        };
    }
}

export default new ToolConfigValidator();