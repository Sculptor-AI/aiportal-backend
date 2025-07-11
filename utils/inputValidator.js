/**
 * Input validation utilities for API endpoints
 */

/**
 * Validate model type
 * @param {string} modelType - Model type to validate
 * @returns {Object} - Validation result
 */
export function validateModelType(modelType) {
  if (!modelType || typeof modelType !== 'string') {
    return { valid: false, message: 'Model type is required and must be a string' };
  }
  
  if (modelType.length > 200) {
    return { valid: false, message: 'Model type must be less than 200 characters' };
  }
  
  // Allow alphanumeric, hyphens, underscores, slashes, and dots
  const validPattern = /^[a-zA-Z0-9\-_/.]+$/;
  if (!validPattern.test(modelType)) {
    return { valid: false, message: 'Model type contains invalid characters' };
  }
  
  return { valid: true };
}

/**
 * Validate prompt length and content
 * @param {string} prompt - Prompt to validate
 * @returns {Object} - Validation result
 */
export function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, message: 'Prompt is required and must be a string' };
  }
  
  if (prompt.length > 100000) {
    return { valid: false, message: 'Prompt must be less than 100,000 characters' };
  }
  
  if (prompt.trim().length === 0) {
    return { valid: false, message: 'Prompt cannot be empty' };
  }
  
  return { valid: true };
}

/**
 * Validate system prompt
 * @param {string} systemPrompt - System prompt to validate
 * @returns {Object} - Validation result
 */
export function validateSystemPrompt(systemPrompt) {
  if (!systemPrompt) {
    return { valid: true }; // System prompt is optional
  }
  
  if (typeof systemPrompt !== 'string') {
    return { valid: false, message: 'System prompt must be a string' };
  }
  
  if (systemPrompt.length > 50000) {
    return { valid: false, message: 'System prompt must be less than 50,000 characters' };
  }
  
  return { valid: true };
}

/**
 * Validate image data
 * @param {Object} imageData - Image data to validate
 * @returns {Object} - Validation result
 */
export function validateImageData(imageData) {
  if (!imageData) {
    return { valid: true }; // Image data is optional
  }
  
  if (typeof imageData !== 'object' || imageData === null) {
    return { valid: false, message: 'Image data must be an object' };
  }
  
  if (!imageData.data || typeof imageData.data !== 'string') {
    return { valid: false, message: 'Image data must contain a data field with base64 string' };
  }
  
  if (!imageData.mediaType || typeof imageData.mediaType !== 'string') {
    return { valid: false, message: 'Image data must contain a mediaType field' };
  }
  
  // Validate media type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(imageData.mediaType)) {
    return { valid: false, message: 'Invalid image media type' };
  }
  
  // Validate base64 data (basic check)
  try {
    const base64Data = imageData.data.replace(/^data:image\/[a-z]+;base64,/, '');
    if (base64Data.length > 20 * 1024 * 1024) { // 20MB limit
      return { valid: false, message: 'Image data too large (max 20MB)' };
    }
    
    // Basic base64 validation
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Data)) {
      return { valid: false, message: 'Invalid base64 image data' };
    }
  } catch (error) {
    return { valid: false, message: 'Invalid image data format' };
  }
  
  return { valid: true };
}

/**
 * Validate messages array
 * @param {Array} messages - Messages array to validate
 * @returns {Object} - Validation result
 */
export function validateMessages(messages) {
  if (!messages) {
    return { valid: true }; // Messages is optional
  }
  
  if (!Array.isArray(messages)) {
    return { valid: false, message: 'Messages must be an array' };
  }
  
  if (messages.length > 100) {
    return { valid: false, message: 'Too many messages (max 100)' };
  }
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    if (!message || typeof message !== 'object') {
      return { valid: false, message: `Message at index ${i} must be an object` };
    }
    
    if (!message.role || typeof message.role !== 'string') {
      return { valid: false, message: `Message at index ${i} must have a role field` };
    }
    
    const validRoles = ['user', 'assistant', 'system', 'tool'];
    if (!validRoles.includes(message.role)) {
      return { valid: false, message: `Message at index ${i} has invalid role` };
    }
    
    if (!message.content || typeof message.content !== 'string') {
      return { valid: false, message: `Message at index ${i} must have content field` };
    }
    
    if (message.content.length > 50000) {
      return { valid: false, message: `Message at index ${i} content too long (max 50,000 chars)` };
    }
  }
  
  return { valid: true };
}

/**
 * Validate boolean parameters
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Object} - Validation result
 */
export function validateBoolean(value, fieldName) {
  if (value === undefined || value === null) {
    return { valid: true }; // Optional field
  }
  
  if (typeof value !== 'boolean') {
    return { valid: false, message: `${fieldName} must be a boolean` };
  }
  
  return { valid: true };
}

/**
 * Validate mode parameter
 * @param {string} mode - Mode to validate
 * @returns {Object} - Validation result
 */
export function validateMode(mode) {
  if (!mode) {
    return { valid: true }; // Mode is optional
  }
  
  if (typeof mode !== 'string') {
    return { valid: false, message: 'Mode must be a string' };
  }
  
  const validModes = ['standard', 'instant', 'creative', 'precise'];
  if (!validModes.includes(mode)) {
    return { valid: false, message: 'Invalid mode' };
  }
  
  return { valid: true };
}

/**
 * Validate chat request body
 * @param {Object} body - Request body to validate
 * @returns {Object} - Validation result
 */
export function validateChatRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, message: 'Request body must be an object' };
  }
  
  // Validate required fields
  const modelValidation = validateModelType(body.modelType);
  if (!modelValidation.valid) {
    return modelValidation;
  }
  
  const promptValidation = validatePrompt(body.prompt);
  if (!promptValidation.valid) {
    return promptValidation;
  }
  
  // Validate optional fields
  const systemPromptValidation = validateSystemPrompt(body.systemPrompt);
  if (!systemPromptValidation.valid) {
    return systemPromptValidation;
  }
  
  const imageValidation = validateImageData(body.imageData);
  if (!imageValidation.valid) {
    return imageValidation;
  }
  
  const messagesValidation = validateMessages(body.messages);
  if (!messagesValidation.valid) {
    return messagesValidation;
  }
  
  const modeValidation = validateMode(body.mode);
  if (!modeValidation.valid) {
    return modeValidation;
  }
  
  // Validate boolean fields
  const booleanFields = ['search', 'deepResearch', 'imageGen'];
  for (const field of booleanFields) {
    const validation = validateBoolean(body[field], field);
    if (!validation.valid) {
      return validation;
    }
  }
  
  return { valid: true };
}