import toolsService from './toolsService.js';
import modelConfigService from './modelConfigService.js';

class SystemPromptService {
    constructor() {
        this.basePrompts = new Map();
        this.toolInstructions = `

## Tool Usage Instructions

You have access to tools that can help you perform various tasks. When you need to use a tool:

1. **Identify the appropriate tool** from the available tools for your current task
2. **Call the tool** using the proper function calling format
3. **Wait for the tool result** before proceeding
4. **Use the tool result** to continue your response or take further action

### Important Tool Usage Guidelines:

- **Always use tools when they can help** - Don't perform tasks manually that tools can do better
- **One tool call at a time** - Wait for results before making additional tool calls
- **Handle errors gracefully** - If a tool call fails, acknowledge the error and try alternatives
- **Explain tool usage** - Briefly explain what you're doing when using tools
- **Tool results are authoritative** - Trust and use the actual results from tools

Available tools and their purposes:
{{TOOL_DESCRIPTIONS}}

Remember: Tools are provided to enhance your capabilities. Use them effectively to provide better assistance.`;
    }

    /**
     * Generate a system prompt enhanced with tool instructions
     * @param {string} basePrompt - Original system prompt
     * @param {string} modelId - Model ID to get tools for
     * @returns {string} Enhanced system prompt
     */
    generateSystemPrompt(basePrompt = '', modelId = null) {
        let enhancedPrompt = basePrompt;

        // Add tool instructions if tools are available for this model
        if (modelId && modelConfigService.isToolsEnabledForModel(modelId)) {
            const availableTools = modelConfigService.getToolsForModel(modelId);
            
            if (availableTools && availableTools.length > 0) {
                const toolDescriptions = this.generateToolDescriptions(availableTools);
                const toolInstructions = this.toolInstructions.replace(
                    '{{TOOL_DESCRIPTIONS}}',
                    toolDescriptions
                );

                // Add tool instructions to the prompt
                if (enhancedPrompt) {
                    enhancedPrompt += '\n\n' + toolInstructions;
                } else {
                    enhancedPrompt = toolInstructions;
                }
            }
        }

        return enhancedPrompt;
    }

    /**
     * Generate descriptions for available tools
     * @param {Array} tools - Array of available tools
     * @returns {string} Formatted tool descriptions
     */
    generateToolDescriptions(tools) {
        if (!tools || tools.length === 0) {
            return 'No tools are currently available.';
        }

        const descriptions = tools.map(tool => {
            const params = this.formatParameters(tool.parameters);
            return `• **${tool.name}** (${tool.id}): ${tool.description}${params ? '\n  Parameters: ' + params : ''}`;
        });

        return descriptions.join('\n');
    }

    /**
     * Format tool parameters for display
     * @param {Object} parameters - Tool parameters schema
     * @returns {string} Formatted parameters
     */
    formatParameters(parameters) {
        if (!parameters || !parameters.properties) {
            return '';
        }

        const props = Object.entries(parameters.properties).map(([name, schema]) => {
            const required = parameters.required && parameters.required.includes(name) ? ' (required)' : '';
            return `${name}: ${schema.description || schema.type}${required}`;
        });

        return props.join(', ');
    }

    /**
     * Set a base prompt for a specific context
     * @param {string} context - Context identifier
     * @param {string} prompt - Base prompt
     */
    setBasePrompt(context, prompt) {
        this.basePrompts.set(context, prompt);
    }

    /**
     * Get base prompt for a context
     * @param {string} context - Context identifier
     * @returns {string} Base prompt
     */
    getBasePrompt(context) {
        return this.basePrompts.get(context) || '';
    }

    /**
     * Update tool instructions template
     * @param {string} instructions - New tool instructions template
     */
    updateToolInstructions(instructions) {
        this.toolInstructions = instructions;
    }

    /**
     * Get current tool instructions template
     * @returns {string} Tool instructions template
     */
    getToolInstructions() {
        return this.toolInstructions;
    }
}

// Export singleton instance
export default new SystemPromptService();