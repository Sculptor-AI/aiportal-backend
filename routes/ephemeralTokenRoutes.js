import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';
import liveApiSecurityMiddleware from '../middleware/liveApiSecurityMiddleware.js';
import {
  generateToken,
  getTokenUsage,
  getConfiguration,
  getStatistics,
  healthCheck
} from '../controllers/ephemeralTokenController.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Apply security middleware
router.use(liveApiSecurityMiddleware.securityCheck);

// Rate limiting middleware for token generation
const tokenRateLimit = rateLimitMiddleware({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15, // 15 requests per hour per user
  message: 'Too many token requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

/**
 * @swagger
 * /api/v1/live-token:
 *   post:
 *     summary: Generate ephemeral token for Live API
 *     description: Generate a short-lived token for direct client access to Gemini Live API
 *     tags: [Live API]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *                 description: Model to use for Live API
 *                 enum: [gemini-2.0-flash-live-001, gemini-live-2.5-flash-preview]
 *                 default: gemini-2.0-flash-live-001
 *               responseModality:
 *                 type: string
 *                 description: Response modality
 *                 enum: [TEXT, AUDIO]
 *                 default: TEXT
 *               duration:
 *                 type: integer
 *                 description: Token duration in minutes
 *                 minimum: 1
 *                 maximum: 60
 *                 default: 30
 *               systemInstruction:
 *                 type: string
 *                 description: Custom system instruction (if allowed)
 *                 maxLength: 1000
 *               temperature:
 *                 type: number
 *                 description: Sampling temperature
 *                 minimum: 0
 *                 maximum: 2
 *                 default: 1
 *     responses:
 *       200:
 *         description: Token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   description: Ephemeral token for Live API
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: Token expiration time
 *                 sessionStartWindow:
 *                   type: string
 *                   format: date-time
 *                   description: Window for starting new sessions
 *                 constraints:
 *                   type: object
 *                   properties:
 *                     model:
 *                       type: string
 *                     maxDuration:
 *                       type: integer
 *                     responseModality:
 *                       type: string
 *                 usage:
 *                   type: object
 *                   properties:
 *                     activeTokens:
 *                       type: integer
 *                     tokensLastHour:
 *                       type: integer
 *                     tokensLastDay:
 *                       type: integer
 *                     limits:
 *                       type: object
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/', tokenRateLimit, generateToken);

/**
 * @swagger
 * /api/v1/live-token/usage:
 *   get:
 *     summary: Get token usage statistics
 *     description: Get current user's token usage and rate limit status
 *     tags: [Live API]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Usage statistics retrieved successfully
 */
router.get('/usage', getTokenUsage);

export default router;