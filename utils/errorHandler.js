/**
 * Error handling utilities for secure error responses
 */

/**
 * Sanitize error messages for client responses in production
 * @param {Error} error - The original error
 * @param {string} fallbackMessage - Generic message to show in production
 * @returns {string} Safe error message for client
 */
export function sanitizeErrorMessage(error, fallbackMessage = 'An error occurred while processing your request') {
  // In development, show detailed error messages
  if (process.env.NODE_ENV === 'development') {
    return error.message || fallbackMessage;
  }
  
  // In production, use generic messages for most errors
  // Only show specific messages for known user errors
  const userFriendlyErrors = [
    'Session not found',
    'Session has ended',
    'Unauthorized access to session',
    'Invalid session ID',
    'Missing required field',
    'Authentication required',
    'Invalid API key',
    'Rate limit exceeded',
    'Too many concurrent sessions',
    'Audio data too large',
    'Invalid audio format',
    'Connection limit exceeded',
    'Authentication timeout'
  ];
  
  // Check if error message starts with any user-friendly pattern
  const isUserFriendly = userFriendlyErrors.some(pattern => 
    error.message && error.message.includes(pattern)
  );
  
  if (isUserFriendly) {
    return error.message;
  }
  
  // For all other errors, return generic message
  return fallbackMessage;
}

/**
 * Create standardized error response object
 * @param {Error} error - The original error
 * @param {string} fallbackMessage - Generic message for production
 * @param {Object} additionalData - Additional data to include in response
 * @returns {Object} Standardized error response
 */
export function createErrorResponse(error, fallbackMessage = 'An error occurred while processing your request', additionalData = {}) {
  const message = sanitizeErrorMessage(error, fallbackMessage);
  
  const response = {
    success: false,
    error: message,
    ...additionalData
  };
  
  // In development, include error details
  if (process.env.NODE_ENV === 'development') {
    response.errorDetails = {
      stack: error.stack,
      originalMessage: error.message
    };
  }
  
  return response;
}

/**
 * Log error with appropriate level based on severity
 * @param {Error} error - The error to log
 * @param {string} context - Context where error occurred
 * @param {Object} metadata - Additional metadata to log
 */
export function logError(error, context = 'Unknown', metadata = {}) {
  const errorInfo = {
    context,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...metadata
  };
  
  // In production, you might want to send this to a logging service
  if (process.env.NODE_ENV === 'production') {
    console.error(`[ERROR] ${context}:`, JSON.stringify(errorInfo));
  } else {
    console.error(`[ERROR] ${context}:`, errorInfo);
  }
}

/**
 * WebSocket error handler for consistent error responses
 * @param {WebSocket} ws - WebSocket connection
 * @param {Error} error - The error that occurred
 * @param {string} type - Error type for client
 * @param {string} fallbackMessage - Generic message for production
 */
export function handleWebSocketError(ws, error, type = 'error', fallbackMessage = 'An error occurred') {
  const message = sanitizeErrorMessage(error, fallbackMessage);
  
  try {
    ws.send(JSON.stringify({
      type,
      error: message
    }));
  } catch (sendError) {
    // If we can't send the error, log it
    logError(sendError, 'WebSocket error sending', { originalError: error.message });
  }
  
  // Log the original error for debugging
  logError(error, 'WebSocket operation', { errorType: type });
}