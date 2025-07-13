import express from 'express';
import { 
  handleTranscription, 
  startSession, 
  endSession, 
  getSessionStatus,
  getActiveSessions,
  createStreamingSession
} from '../controllers/liveAudioController.js';
import { protect } from '../middleware/authMiddleware.js';
import { 
  liveAudioRateLimit, 
  sessionCreationRateLimit, 
  transcriptionRateLimit 
} from '../middleware/liveAudioRateLimit.js';

const router = express.Router();

// Apply general rate limiting to all Live Audio routes
router.use(liveAudioRateLimit);

// POST /api/v1/live-audio/session/start
router.post('/session/start', protect, sessionCreationRateLimit, startSession);

// POST /api/v1/live-audio/session/end
router.post('/session/end', protect, endSession);

// GET /api/v1/live-audio/session/:session_id/status
router.get('/session/:session_id/status', protect, getSessionStatus);

// GET /api/v1/live-audio/sessions
router.get('/sessions', protect, getActiveSessions);

// POST /api/v1/live-audio/transcribe
router.post('/transcribe', protect, transcriptionRateLimit, handleTranscription);

// POST /api/v1/live-audio/streaming/start
router.post('/streaming/start', protect, sessionCreationRateLimit, createStreamingSession);

export default router;