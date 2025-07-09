import toolsService from './toolsService.js';
import modelConfigService from './modelConfigService.js';

class SystemPromptService {
    constructor() {
        this.basePrompts = new Map();
        this.toolInstructions = `

## 🛠️ TOOL USAGE INSTRUCTIONS - CRITICAL

You have access to powerful tools that significantly enhance your capabilities. You MUST use these tools proactively to provide better assistance.

### WHEN TO USE TOOLS (Be Proactive):

**ALWAYS use tools when the user's request involves:**
- Mathematical calculations, data analysis, or computations
- Code execution, testing, or debugging
- Information lookups or searches
- File processing or manipulation
- Complex problem-solving that tools can assist with

**DO NOT ask permission** - use tools immediately when they're relevant to the task.

### HOW TO USE TOOLS:

1. **Identify relevant tools** from the list below for the current task
2. **Call the tool immediately** using proper function calling format
3. **Wait for the tool result** before proceeding
4. **Use the tool result** to provide accurate, enhanced responses

### CRITICAL TOOL USAGE GUIDELINES:

- ✅ **PROACTIVE USAGE**: Use tools without being explicitly asked
- ✅ **IMMEDIATE ACTION**: Don't hesitate - if a tool can help, use it
- ✅ **TRUST RESULTS**: Tool outputs are authoritative and accurate
- ✅ **EXPLAIN BRIEFLY**: Mention what you're doing with tools
- ✅ **HANDLE ERRORS**: If a tool fails, try alternatives or explain the issue
- ❌ **NEVER SKIP**: Don't perform manual calculations if tools can do it
- ❌ **NO PERMISSION**: Don't ask "Would you like me to..." - just use tools

### 📋 AVAILABLE TOOLS:

{{TOOL_DESCRIPTIONS}}

### 🎯 EXAMPLES OF PROACTIVE TOOL USAGE:

- User asks "What's 2^100?" → Immediately use code-execution tool
- User mentions math problem → Use calculator or code-execution tool
- User asks about complex calculations → Use appropriate computational tool
- User wants to test code → Use code-execution tool

**REMEMBER: Tools are your superpowers. Use them actively and confidently to provide exceptional assistance!**`;
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
            
            console.log(`🔧 SystemPromptService: Model ${modelId} has tools enabled. Available tools:`, availableTools?.length || 0);
            
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
                
                console.log(`🔧 SystemPromptService: Enhanced system prompt with tools for model ${modelId}`);
            }
        } else {
            console.log(`🔧 SystemPromptService: No tools available for model ${modelId}`);
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
            const usage = this.getToolUsageExamples(tool.id);
            
            return `🔧 **${tool.name}** (\`${tool.id}\`)
   📝 **Purpose**: ${tool.description}
   ${params ? `📋 **Parameters**: ${params}` : ''}
   ${usage ? `💡 **Use for**: ${usage}` : ''}`;
        });

        return descriptions.join('\n\n');
    }

    /**
     * Get usage examples for specific tools
     * @param {string} toolId - Tool ID
     * @returns {string} Usage examples
     */
    getToolUsageExamples(toolId) {
        const examples = {
            'code-execution': 'Mathematical calculations, data analysis, algorithm testing, code debugging, complex computations',
            'test-calculator': 'Basic arithmetic, mathematical operations, formula calculations',
            'wolfram-alpha': 'Complex mathematical queries, scientific calculations, data analysis, factual lookups',
            'test-tool': 'System testing and validation'
        };
        return examples[toolId] || 'General purpose tool usage';
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