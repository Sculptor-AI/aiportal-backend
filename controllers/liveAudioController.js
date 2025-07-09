import liveAudioService from '../services/liveAudioService.js';

export const startSession = async (req, res) => {
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

    const result = await liveAudioService.startSession(session_id, options);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
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

    const result = await liveAudioService.processAudioChunk(session_id, audio_data, options);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Live audio transcription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
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

    const result = await liveAudioService.endSession(session_id);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
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

    const result = await liveAudioService.getSessionStatus(session_id);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

export const getActiveSessions = async (req, res) => {
  try {
    const sessions = liveAudioService.getActiveSessions();

    res.status(200).json({
      success: true,
      data: {
        sessions,
        count: sessions.length
      }
    });

  } catch (error) {
    console.error('Get active sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
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

    const result = await liveAudioService.createStreamingSession(session_id, options);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Create streaming session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

// WebSocket handler for real-time streaming
export const handleWebSocketConnection = (ws, req) => {
  console.log('🔗 WebSocket connection established for live audio');
  
  let sessionId = null;
  let streamingSession = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'start_session':
          sessionId = data.session_id || `ws_${Date.now()}`;
          const options = {
            model: data.model || 'gemini-live-2.5-flash-preview',
            responseModality: data.response_modality || 'text',
            inputTranscription: data.input_transcription !== false,
            outputTranscription: data.output_transcription !== false
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
            const endResult = await streamingSession.endSession();
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
            const status = await streamingSession.getStatus();
            ws.send(JSON.stringify({
              type: 'session_status',
              session_id: sessionId,
              data: status
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'session_status',
              session_id: sessionId,
              data: { status: 'not_found' }
            }));
          }
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${data.type}`
          }));
      }

    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message || 'Internal server error'
      }));
    }
  });

  ws.on('close', async () => {
    console.log('🔗 WebSocket connection closed');
    if (streamingSession) {
      try {
        await streamingSession.endSession();
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
    message: 'WebSocket connection established. Send start_session to begin.'
  }));
};

// Cleanup function to be called periodically
export const cleanupExpiredSessions = () => {
  liveAudioService.cleanupExpiredSessions();
};