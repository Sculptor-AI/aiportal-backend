/**
 * Utility functions for sanitizing error messages to prevent sensitive information exposure
 */

/**
 * Sanitize error message to remove sensitive information
 * @param {Error|string} error - Error object or message to sanitize
 * @returns {string} - Sanitized error message
 */
export function sanitizeErrorMessage(error) {
  let errorMessage = '';
  
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (error && typeof error === 'object' && error.message) {
    errorMessage = error.message;
  } else {
    errorMessage = 'Unknown error occurred';
  }
  
  // Remove potential API keys and sensitive information
  const sensitivePatterns = [
    // API keys (various patterns)
    /[aA][pP][iI][_-]?[kK][eE][yY][\s]*[=:]\s*[a-zA-Z0-9\-_]{10,}/g,
    /[sS][eE][cC][rR][eE][tT][\s]*[=:]\s*[a-zA-Z0-9\-_]{10,}/g,
    /[tT][oO][kK][eE][nN][\s]*[=:]\s*[a-zA-Z0-9\-_]{10,}/g,
    
    // Specific API key patterns
    /sk-[a-zA-Z0-9]{20,}/g, // OpenAI API keys
    /AIza[0-9A-Za-z\-_]{35}/g, // Google API keys
    /xoxb-[0-9]{11}-[0-9]{11}-[0-9A-Za-z]{24}/g, // Slack tokens
    /ghp_[0-9a-zA-Z]{36}/g, // GitHub personal access tokens
    
    // Database connection strings
    /mongodb:\/\/[^:]+:[^@]+@[^\/]+/g,
    /mysql:\/\/[^:]+:[^@]+@[^\/]+/g,
    /postgres:\/\/[^:]+:[^@]+@[^\/]+/g,
    
    // Authorization headers
    /[aA]uthorization:\s*[bB]earer\s+[a-zA-Z0-9\-_\.]+/g,
    /[aA]uthorization:\s*[bB]asic\s+[a-zA-Z0-9\+\/=]+/g,
    
    // Environment variable patterns
    /[A-Z_]+_API_KEY[=:]\s*[a-zA-Z0-9\-_]{10,}/g,
    /[A-Z_]+_SECRET[=:]\s*[a-zA-Z0-9\-_]{10,}/g,
    /[A-Z_]+_TOKEN[=:]\s*[a-zA-Z0-9\-_]{10,}/g,
    
    // Private keys
    /-----BEGIN [A-Z\s]+PRIVATE KEY-----[\s\S]*?-----END [A-Z\s]+PRIVATE KEY-----/g,
    
    // JWT tokens
    /eyJ[a-zA-Z0-9_\-]*\.eyJ[a-zA-Z0-9_\-]*\.[a-zA-Z0-9_\-]*/g,
    
    // File paths that might contain sensitive info
    /\/[a-zA-Z0-9\-_\.\/]*\/(config|env|secret|key|password|credential)[a-zA-Z0-9\-_\.\/]*/gi,
    
    // IP addresses and ports (internal networks)
    /\b(?:10\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?)\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?)\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?)|172\.(?:1[6-9]|2\d|3[01])\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?)\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?)|192\.168\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?)\.(?:2[0-4]\d|25[0-5]|[01]?\d\d?))\b/g,
    
    // URLs with credentials
    /https?:\/\/[^:]+:[^@]+@[^\/]+/g
  ];
  
  // Apply sanitization patterns
  let sanitizedMessage = errorMessage;
  
  sensitivePatterns.forEach(pattern => {
    sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
  });
  
  // Remove stack traces that might contain sensitive information
  sanitizedMessage = sanitizedMessage.replace(/\s+at\s+.*$/gm, '');
  
  return sanitizedMessage;
}

/**
 * Sanitize error object for logging
 * @param {Error|any} error - Error to sanitize
 * @returns {Object} - Sanitized error object safe for logging
 */
export function sanitizeErrorForLogging(error) {
  const sanitizedError = {
    message: sanitizeErrorMessage(error),
    type: error?.constructor?.name || 'Error',
    timestamp: new Date().toISOString()
  };
  
  // Add status code if available
  if (error?.status || error?.statusCode) {
    sanitizedError.status = error.status || error.statusCode;
  }
  
  // Add safe error codes
  if (error?.code && typeof error.code === 'string' && error.code.length < 20) {
    sanitizedError.code = error.code;
  }
  
  return sanitizedError;
}

/**
 * Safe console logging wrapper that sanitizes sensitive information
 * @param {string} level - Log level (log, error, warn, info)
 * @param {string} message - Message to log
 * @param {any} error - Error object or additional data
 */
export function safeConsoleLog(level, message, error = null) {
  const validLevels = ['log', 'error', 'warn', 'info'];
  const logLevel = validLevels.includes(level) ? level : 'log';
  
  if (error) {
    const sanitizedError = sanitizeErrorForLogging(error);
    console[logLevel](message, sanitizedError);
  } else {
    console[logLevel](message);
  }
}