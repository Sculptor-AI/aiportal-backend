import { decryptPacket } from '../utils/encryption.js';

/**
 * Validate chat completion request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateChatRequest = (req, res, next) => {
  const { modelType, prompt, imageData } = req.body;
  
  if (!modelType) {
    return res.status(400).json({ error: 'Missing required field: modelType' });
  }
  
  if (!prompt) {
    return res.status(400).json({ error: 'Missing required field: prompt' });
  }

  // Fix prompt structure when imageData is present
  if (imageData && typeof req.body.prompt !== 'string') {
    if (req.body.prompt && typeof req.body.prompt === 'object' && req.body.prompt.text) {
      req.body.prompt = req.body.prompt.text;
    } else {
      req.body.prompt = String(req.body.prompt);
    }
  }
  
  // If request is encrypted, decrypt it first
  if (req.body.encrypted) {
    try {
      const decrypted = decryptPacket(req.body.data);
      req.body = { ...req.body, ...decrypted };
    } catch (error) {
      return res.status(400).json({ error: 'Failed to decrypt request data' });
    }
  }
  
  // Validate boolean fields
  if (req.body.search !== undefined && typeof req.body.search !== 'boolean') {
    req.body.search = req.body.search === 'true';
  }
  
  if (req.body.deepResearch !== undefined && typeof req.body.deepResearch !== 'boolean') {
    req.body.deepResearch = req.body.deepResearch === 'true';
  }
  
  if (req.body.imageGen !== undefined && typeof req.body.imageGen !== 'boolean') {
    req.body.imageGen = req.body.imageGen === 'true';
  }
  
  next();
};

/**
 * Validate search request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateSearchRequest = (req, res, next) => {
  const { query } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required and must be a string' });
  }
  
  // If max_results is provided, ensure it's a number
  if (req.body.max_results !== undefined) {
    const maxResults = parseInt(req.body.max_results, 10);
    if (isNaN(maxResults) || maxResults < 1) {
      return res.status(400).json({ error: 'max_results must be a positive number' });
    }
    req.body.max_results = maxResults;
  }
  
  next();
};

/**
 * Validate URL scraping request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateScrapeRequest = (req, res, next) => {
  const { url } = req.body;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required and must be a string' });
  }
  
  // Simple URL validation
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  next();
};

/**
 * Validate search and process request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateSearchProcessRequest = (req, res, next) => {
  const { query, model_prompt } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required and must be a string' });
  }
  
  if (!model_prompt || typeof model_prompt !== 'string') {
    return res.status(400).json({ error: 'Model prompt is required and must be a string' });
  }
  
  // If max_results is provided, ensure it's a number
  if (req.body.max_results !== undefined) {
    const maxResults = parseInt(req.body.max_results, 10);
    if (isNaN(maxResults) || maxResults < 1) {
      return res.status(400).json({ error: 'max_results must be a positive number' });
    }
    req.body.max_results = maxResults;
  }
  
  next();
};

/**
 * Validate deep research request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateDeepResearchRequest = (req, res, next) => {
  const { query, model } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required and must be a string' });
  }
  
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'Model is required and must be a string' });
  }
  
  // Validate maxAgents if provided
  if (req.body.maxAgents !== undefined) {
    const maxAgents = parseInt(req.body.maxAgents, 10);
    if (isNaN(maxAgents) || maxAgents < 2 || maxAgents > 12) {
      return res.status(400).json({ error: 'maxAgents must be a number between 2 and 12' });
    }
    req.body.maxAgents = maxAgents;
  }
  
  next();
};