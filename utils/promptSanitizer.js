/**
 * Utility functions for sanitizing prompts against injection attacks
 */

/**
 * Sanitize user input to prevent prompt injection attacks
 * @param {string} input - User input to sanitize
 * @returns {string} - Sanitized input
 */
export function sanitizePrompt(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove common prompt injection patterns
  let sanitized = input
    // Remove system prompt hijacking attempts
    .replace(/\bsystem\s*:\s*/gi, '')
    .replace(/\bassistant\s*:\s*/gi, '')
    .replace(/\buser\s*:\s*/gi, '')
    .replace(/\bhuman\s*:\s*/gi, '')
    
    // Remove role manipulation attempts
    .replace(/\b(you are|act as|pretend to be|roleplay as|ignore previous|forget everything|new instructions|override)\b/gi, '')
    
    // Remove instruction overrides
    .replace(/\b(ignore all previous instructions|disregard previous|new task|updated instructions|system override)\b/gi, '')
    
    // Remove prompt delimiters and special tokens
    .replace(/\[SYSTEM\]/gi, '')
    .replace(/\[\/SYSTEM\]/gi, '')
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')
    .replace(/\<\|system\|\>/gi, '')
    .replace(/\<\|user\|\>/gi, '')
    .replace(/\<\|assistant\|\>/gi, '')
    .replace(/\<\|endoftext\|\>/gi, '')
    
    // Remove markdown code blocks that might contain injection
    .replace(/```[\s\S]*?```/g, '[code block removed]')
    
    // Remove excessive repetition that might be used for injection
    .replace(/(.)\1{20,}/g, '$1$1$1')
    
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    
    // Limit length to prevent resource exhaustion
    .substring(0, 50000);

  return sanitized.trim();
}

/**
 * Sanitize system prompt to prevent injection
 * @param {string} systemPrompt - System prompt to sanitize
 * @returns {string} - Sanitized system prompt
 */
export function sanitizeSystemPrompt(systemPrompt) {
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return '';
  }

  // More restrictive sanitization for system prompts
  let sanitized = systemPrompt
    // Remove any user input markers
    .replace(/\b(user said|user input|user prompt|user asked)\b/gi, '')
    
    // Remove instruction overrides
    .replace(/\b(ignore|disregard|override|forget|new instructions|updated instructions)\b/gi, '')
    
    // Remove role confusion attempts
    .replace(/\b(you are now|act as|pretend to be|roleplay)\b/gi, '')
    
    // Remove prompt delimiters
    .replace(/\[SYSTEM\]/gi, '')
    .replace(/\[\/SYSTEM\]/gi, '')
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')
    .replace(/\<\|system\|\>/gi, '')
    .replace(/\<\|user\|\>/gi, '')
    .replace(/\<\|assistant\|\>/gi, '')
    
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    
    // Limit length
    .substring(0, 10000);

  return sanitized.trim();
}

/**
 * Validate that a prompt doesn't contain obvious injection attempts
 * @param {string} prompt - Prompt to validate
 * @returns {boolean} - True if prompt appears safe
 */
export function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return true;
  }

  // Check for common injection patterns
  const dangerousPatterns = [
    /system\s*:\s*ignore/gi,
    /assistant\s*:\s*ignore/gi,
    /\bignore\s+all\s+previous\s+instructions\b/gi,
    /\bforget\s+everything\b/gi,
    /\bnew\s+instructions\b/gi,
    /\boverride\s+instructions\b/gi,
    /\bact\s+as\s+if\b/gi,
    /\broleplay\s+as\b/gi,
    /\bpretend\s+to\s+be\b/gi,
    /\byou\s+are\s+now\b/gi,
    /\[SYSTEM\]/gi,
    /\<\|system\|\>/gi,
    /\<\|endoftext\|\>/gi
  ];

  return !dangerousPatterns.some(pattern => pattern.test(prompt));
}

/**
 * Sanitize messages array to prevent injection
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Sanitized messages array
 */
export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map(message => {
    if (typeof message !== 'object' || message === null) {
      return message;
    }

    const sanitizedMessage = { ...message };

    // Sanitize content field
    if (sanitizedMessage.content && typeof sanitizedMessage.content === 'string') {
      sanitizedMessage.content = sanitizePrompt(sanitizedMessage.content);
    }

    // Ensure role is valid
    if (sanitizedMessage.role && typeof sanitizedMessage.role === 'string') {
      const validRoles = ['user', 'assistant', 'system', 'tool'];
      if (!validRoles.includes(sanitizedMessage.role.toLowerCase())) {
        sanitizedMessage.role = 'user'; // Default to user role for safety
      }
    }

    return sanitizedMessage;
  });
}