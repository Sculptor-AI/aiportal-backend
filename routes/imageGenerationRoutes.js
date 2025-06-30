import express from 'express';
import { generateImage } from '../controllers/imageGenerationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/v1/images/generate
router.post('/generate', protect, generateImage);

export default router; 