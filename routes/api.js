import express from 'express';
import { completeChat, streamChat } from '../controllers/chatController.js';
import { getModels } from '../controllers/modelController.js';
import { searchWeb, scrapeUrl, searchAndProcess } from '../controllers/searchController.js';
import { validateChatRequest, validateSearchRequest, validateScrapeRequest, validateSearchProcessRequest } from '../middleware/validation.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get available models
router.get('/models', optionalAuth, getModels);

// All chat endpoints now use streaming by default
router.post('/chat', protect, validateChatRequest, streamChat);
router.post('/chat/stream', protect, validateChatRequest, streamChat);

// Search endpoints
router.post('/search', protect, validateSearchRequest, searchWeb);
router.post('/scrape', protect, validateScrapeRequest, scrapeUrl);
router.post('/search-process', protect, validateSearchProcessRequest, searchAndProcess);

export { router }; 