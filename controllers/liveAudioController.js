import liveAudioService from '../services/liveAudioService.js';
import { WSAuthMiddleware } from '../middleware/wsAuthMiddleware.js';
import { wsRateLimit } from '../middleware/wsRateLimitMiddleware.js';
import { createErrorResponse, logError, handleWebSocketError } from '../utils/errorHandler.js';

export const startSession = async (req, res) => {
  try {
    // DEPRECATED WARNING
    console.warn('⚠️  DEPRECATED: /api/v1/live-audio/session/start is deprecated. Use /api/v1/live-token for ephemeral token access.');
    const { 
      session_id, 
      model = 'gemini-live-2.5-flash-preview',
      response_modality = 'text',
      input_transcription = true,
      output_transcription = true
    } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: session_id'
      });
    }

    const options = {
      model,
      responseModality: response_modality,
      inputTranscription: input_transcription,
      outputTranscription: output_transcription
    };

    // Add user ID to options for session scoping
    const sessionOptions = {
      ...options,
      userId: req.user.id
    };
    
    const result = await liveAudioService.startSession(session_id, sessionOptions);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logError(error, 'Start session', { sessionId: req.body.session_id, userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to start audio session'));
  }
};

export const handleTranscription = async (req, res) => {
  try {
    const { 
      audio_data, 
      format, 
      sample_rate, 
      channels, 
      session_id 
    } = req.body;

    // Validate required fields
    if (!audio_data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: audio_data'
      });
    }

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: session_id'
      });
    }

    const options = {
      format: format || 'webm',
      sampleRate: sample_rate || 16000,
      channels: channels || 1
    };

    const result = await liveAudioService.processAudioChunk(session_id, audio_data, options, req.user.id);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logError(error, 'Audio transcription', { sessionId: req.body.session_id, userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to process audio'));
  }
};

export const endSession = async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: session_id'
      });
    }

    const result = await liveAudioService.endSession(session_id, req.user.id);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logError(error, 'End session', { sessionId: req.body.session_id, userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to end audio session'));
  }
};

export const getSessionStatus = async (req, res) => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: session_id'
      });
    }

    const result = await liveAudioService.getSessionStatus(session_id, req.user.id);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logError(error, 'Get session status', { sessionId: req.params.session_id, userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to get session status'));
  }
};

export const getActiveSessions = async (req, res) => {
  try {
    const sessions = liveAudioService.getActiveSessions(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        sessions,
        count: sessions.length
      }
    });

  } catch (error) {
    logError(error, 'Get active sessions', { userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to get active sessions'));
  }
};

export const createStreamingSession = async (req, res) => {
  try {
    const { 
      session_id, 
      model = 'gemini-live-2.5-flash-preview',
      response_modality = 'text',
      input_transcription = true,
      output_transcription = true
    } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: session_id'
      });
    }

    const options = {
      model,
      responseModality: response_modality,
      inputTranscription: input_transcription,
      outputTranscription: output_transcription
    };

    // Add user ID to options for session scoping
    const sessionOptions = {
      ...options,
      userId: req.user.id
    };
    
    const result = await liveAudioService.createStreamingSession(session_id, sessionOptions);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logError(error, 'Create streaming session', { sessionId: req.body.session_id, userId: req.user?.id });
    res.status(500).json(createErrorResponse(error, 'Failed to create streaming session'));
  }
};

// Global session store to track user sessions (user_id -> Set of session_ids)
const userSessionStore = new Map();

// Connection tracking for rate limiting
const connectionCounts = new Map(); // user_id -> count
const MAX_CONNECTIONS_PER_USER = parseInt(process.env.LIVE_AUDIO_MAX_CONNECTIONS_PER_USER) || 5;
const AUTH_TIMEOUT_MS = parseInt(process.env.LIVE_AUDIO_AUTH_TIMEOUT_MS) || 30000;
const INACTIVITY_TIMEOUT_MS = parseInt(process.env.LIVE_AUDIO_INACTIVITY_TIMEOUT_MS) || 300000; // 5 minutes

// WebSocket handler for real-time streaming with authentication
export const handleWebSocketConnection = (ws, req) => {
  console.log('🔗 WebSocket connection attempt for live audio');
  
  // Check IP-based rate limiting first
  const clientIP = wsRateLimit.getClientIP(req);
  if (wsRateLimit.checkIPConnectionLimit(clientIP)) {
    console.log(`🚫 IP rate limit exceeded for ${clientIP}`);
    ws.send(JSON.stringify({
      type: 'rate_limit_exceeded',
      error: 'Too many connection attempts from this IP. Please try again later.'
    }));
    ws.close(1008, 'Rate limit exceeded');
    return;
  }
  
  let sessionId = null;
  let streamingSession = null;
  let authenticatedUser = null;
  let isAuthenticated = false;
  let inactivityTimeout = null;

  // Function to reset inactivity timeout
  const resetInactivityTimeout = () => {
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
    }
    
    if (isAuthenticated) {
      inactivityTimeout = setTimeout(() => {
        console.log(`🕒 WebSocket inactivity timeout for user: ${authenticatedUser?.username}`);
        ws.send(JSON.stringify({
          type: 'inactivity_timeout',
          error: 'Connection closed due to inactivity'
        }));
        ws.close(1000, 'Inactivity timeout');
      }, INACTIVITY_TIMEOUT_MS);
    }
  };
  
  // Try to authenticate from headers first (optional)
  const headerAuth = WSAuthMiddleware.extractAuthFromHeaders(req);
  if (headerAuth) {
    WSAuthMiddleware.authenticate(headerAuth).then(user => {
      if (user) {
        authenticatedUser = user;
        isAuthenticated = true;
        console.log(`🔐 WebSocket pre-authenticated for user: ${user.username}`);
      }
    }).catch(error => {
      console.error('Header auth failed:', error);
    });
  }

  // Set authentication timeout
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.log('🚫 WebSocket authentication timeout');
      ws.send(JSON.stringify({
        type: 'auth_timeout',
        error: `Authentication required within ${AUTH_TIMEOUT_MS / 1000} seconds`
      }));
      ws.close(1008, 'Authentication timeout');
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle authentication message
      if (data.type === 'auth') {
        try {
          const user = await WSAuthMiddleware.authenticate(data);
          if (!user) {
            ws.send(JSON.stringify({
              type: 'auth_failed',
              error: 'Invalid authentication credentials'
            }));
            ws.close(1008, 'Authentication failed');
            return;
          }

          // Check connection limits
          const currentConnections = connectionCounts.get(user.id) || 0;
          if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
            ws.send(JSON.stringify({
              type: 'auth_failed',
              error: `Maximum ${MAX_CONNECTIONS_PER_USER} connections per user exceeded`
            }));
            ws.close(1008, 'Connection limit exceeded');
            return;
          }

          authenticatedUser = user;
          isAuthenticated = true;
          clearTimeout(authTimeout);
          
          // Track connection count
          connectionCounts.set(user.id, currentConnections + 1);
          
          // Start inactivity timeout
          resetInactivityTimeout();
          
          console.log(`🔐 WebSocket authenticated for user: ${user.username}`);
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'Authentication successful',
            user: { id: user.id, username: user.username }
          }));
        } catch (error) {
          handleWebSocketError(ws, error, 'auth_failed', 'Authentication failed');
          ws.close(1008, 'Authentication error');
        }
        return;
      }

      // All other operations require authentication
      if (!isAuthenticated || !authenticatedUser) {
        ws.send(JSON.stringify({
          type: 'auth_required',
          error: 'Please authenticate first using auth message type'
        }));
        return;
      }

      // Check user message rate limit
      if (wsRateLimit.checkUserMessageLimit(authenticatedUser.id)) {
        ws.send(JSON.stringify({
          type: 'rate_limit_exceeded',
          error: 'Message rate limit exceeded. Please slow down.'
        }));
        return;
      }

      // Reset inactivity timeout on each message
      resetInactivityTimeout();
      
      switch (data.type) {
        case 'start_session':
          sessionId = data.session_id || `ws_${authenticatedUser.id}_${Date.now()}`;
          
          // Add session to user's session list
          WSAuthMiddleware.addUserSession(authenticatedUser, sessionId, userSessionStore);
          
          const options = {
            model: data.model || 'gemini-live-2.5-flash-preview',
            responseModality: data.response_modality || 'text',
            inputTranscription: data.input_transcription !== false,
            outputTranscription: data.output_transcription !== false,
            userId: authenticatedUser.id // Add user ID to session
          };
          
          streamingSession = await liveAudioService.createStreamingSession(sessionId, options);
          
          ws.send(JSON.stringify({
            type: 'session_started',
            session_id: sessionId,
            data: streamingSession
          }));
          break;

        case 'audio_chunk':
          if (!streamingSession) {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'No active session. Please start a session first.'
            }));
            return;
          }

          // Validate session ownership
          if (!WSAuthMiddleware.validateSessionAccess(authenticatedUser, sessionId, userSessionStore)) {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Unauthorized access to session'
            }));
            return;
          }

          // Check audio data rate limit
          const audioSize = wsRateLimit.calculateAudioSize(data.audio_data);
          if (wsRateLimit.checkUserAudioLimit(authenticatedUser.id, audioSize)) {
            ws.send(JSON.stringify({
              type: 'rate_limit_exceeded',
              error: 'Audio data rate limit exceeded. Please reduce audio frequency.'
            }));
            return;
          }

          const audioOptions = {
            format: data.format || 'webm',
            sampleRate: data.sample_rate || 16000,
            channels: data.channels || 1
          };

          const result = await streamingSession.sendAudioChunk(data.audio_data, audioOptions);
          
          ws.send(JSON.stringify({
            type: 'transcription_result',
            session_id: sessionId,
            data: result
          }));
          break;

        case 'end_session':
          if (streamingSession) {
            // Validate session ownership
            if (!WSAuthMiddleware.validateSessionAccess(authenticatedUser, sessionId, userSessionStore)) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Unauthorized access to session'
              }));
              return;
            }

            const endResult = await streamingSession.endSession();
            
            // Remove session from user's session list
            WSAuthMiddleware.removeUserSession(authenticatedUser, sessionId, userSessionStore);
            
            ws.send(JSON.stringify({
              type: 'session_ended',
              session_id: sessionId,
              data: endResult
            }));
            streamingSession = null;
            sessionId = null;
          }
          break;

        case 'get_status':
          if (streamingSession) {
            // Validate session ownership
            if (!WSAuthMiddleware.validateSessionAccess(authenticatedUser, sessionId, userSessionStore)) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Unauthorized access to session'
              }));
              return;
            }

            const status = await streamingSession.getStatus();
            const rateLimitStatus = wsRateLimit.getRateLimitStatus(authenticatedUser.id);
            
            ws.send(JSON.stringify({
              type: 'session_status',
              session_id: sessionId,
              data: {
                ...status,
                rateLimits: rateLimitStatus
              }
            }));
          } else {
            const rateLimitStatus = wsRateLimit.getRateLimitStatus(authenticatedUser.id);
            ws.send(JSON.stringify({
              type: 'session_status',
              session_id: sessionId,
              data: { 
                status: 'not_found',
                rateLimits: rateLimitStatus
              }
            }));
          }
          break;

        case 'get_rate_limits':
          const rateLimitStatus = wsRateLimit.getRateLimitStatus(authenticatedUser.id);
          ws.send(JSON.stringify({
            type: 'rate_limit_status',
            data: rateLimitStatus
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${data.type}`
          }));
      }

    } catch (error) {
      handleWebSocketError(ws, error, 'error', 'Failed to process WebSocket message');
    }
  });

  ws.on('close', async () => {
    console.log('🔗 WebSocket connection closed');
    
    // Clean up timeouts
    clearTimeout(authTimeout);
    clearTimeout(inactivityTimeout);
    
    // Decrement connection count
    if (authenticatedUser) {
      const currentConnections = connectionCounts.get(authenticatedUser.id) || 0;
      if (currentConnections <= 1) {
        connectionCounts.delete(authenticatedUser.id);
      } else {
        connectionCounts.set(authenticatedUser.id, currentConnections - 1);
      }
    }
    
    if (streamingSession && sessionId && authenticatedUser) {
      try {
        await streamingSession.endSession();
        // Remove session from user's session list
        WSAuthMiddleware.removeUserSession(authenticatedUser, sessionId, userSessionStore);
      } catch (error) {
        console.error('Error ending session on WebSocket close:', error);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send initial connection message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established. Send auth message to authenticate.',
    required_auth: true
  }));
};

// Cleanup function to be called periodically
export const cleanupExpiredSessions = () => {
  liveAudioService.cleanupExpiredSessions();
};