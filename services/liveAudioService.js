import { GoogleGenAI, Modality } from '@google/genai';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LiveAudioService {
  constructor() {
    this.audioDir = path.join(__dirname, '../live-audio');
    this.activeSessions = new Map();
    this.ai = new GoogleGenAI({});
    this.ensureAudioDirectory();
    
    // Rate limiting for DoS protection
    this.rateLimitMap = new Map(); // sessionId -> { count, lastReset }
    this.MAX_REQUESTS_PER_MINUTE = parseInt(process.env.LIVE_AUDIO_MAX_REQUESTS_PER_MINUTE) || 60;
    this.MAX_CONCURRENT_SESSIONS = parseInt(process.env.LIVE_AUDIO_MAX_CONCURRENT_SESSIONS) || 10;
  }

  ensureAudioDirectory() {
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
  }

  checkRateLimit(sessionId) {
    const now = Date.now();
    const rateLimit = this.rateLimitMap.get(sessionId) || { count: 0, lastReset: now };
    
    // Reset counter if a minute has passed
    if (now - rateLimit.lastReset > 60000) {
      rateLimit.count = 0;
      rateLimit.lastReset = now;
    }
    
    // Check if rate limit exceeded
    if (rateLimit.count >= this.MAX_REQUESTS_PER_MINUTE) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.');
    }
    
    // Increment counter
    rateLimit.count++;
    this.rateLimitMap.set(sessionId, rateLimit);
  }

  async startSession(sessionId, options = {}) {
    try {
      // Check for too many concurrent sessions
      if (this.activeSessions.size >= this.MAX_CONCURRENT_SESSIONS) {
        throw new Error('Too many concurrent sessions. Please try again later.');
      }
      
      const {
        model = 'gemini-live-2.5-flash-preview',
        responseModality = 'text', // 'text' or 'audio'
        inputTranscription = true,
        outputTranscription = true
      } = options;

      // Create config based on response modality
      const config = {
        responseModalities: [responseModality === 'audio' ? Modality.AUDIO : Modality.TEXT],
        inputAudioTranscription: inputTranscription ? {} : undefined,
        outputAudioTranscription: outputTranscription ? {} : undefined,
        systemInstruction: "You are a helpful assistant that processes audio input and provides responses. Be concise and natural in your responses."
      };

      // Remove undefined values
      Object.keys(config).forEach(key => {
        if (config[key] === undefined) {
          delete config[key];
        }
      });

      const responseQueue = [];
      let sessionEnded = false;

      const session = await this.ai.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            console.log(`🎙️ Live session ${sessionId} opened`);
          },
          onmessage: (message) => {
            responseQueue.push(message);
          },
          onerror: (error) => {
            console.error(`🎙️ Live session ${sessionId} error:`, error.message);
          },
          onclose: (event) => {
            console.log(`🎙️ Live session ${sessionId} closed:`, event.reason);
            sessionEnded = true;
            // Clean up session immediately on connection close
            this.activeSessions.delete(sessionId);
          }
        },
        config: config
      });

      // Helper function to wait for messages
      const waitMessage = async () => {
        let message;
        while (!message && !sessionEnded) {
          message = responseQueue.shift();
          if (!message) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        return message;
      };

      // Helper function to handle a complete turn
      const handleTurn = async () => {
        const turns = [];
        let done = false;
        
        while (!done && !sessionEnded) {
          const message = await waitMessage();
          if (message) {
            turns.push(message);
            if (message.serverContent && message.serverContent.turnComplete) {
              done = true;
            }
          }
        }
        return turns;
      };

      const sessionData = {
        sessionId,
        session,
        responseQueue,
        waitMessage,
        handleTurn,
        model,
        responseModality,
        userId: options.userId, // Add user ID for session scoping
        startTime: new Date().toISOString(),
        status: 'active',
        ended: false
      };

      this.activeSessions.set(sessionId, sessionData);

      return {
        sessionId,
        status: 'active',
        startTime: sessionData.startTime,
        model,
        responseModality
      };

    } catch (error) {
      console.error('Error starting live session:', error);
      throw new Error(`Failed to start live session: ${error.message}`);
    }
  }

  async processAudioChunk(sessionId, audioData, options = {}, userId = null) {
    try {
      // Apply rate limiting
      this.checkRateLimit(sessionId);
      
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found or expired`);
      }

      // Validate user ownership of session
      if (userId && sessionData.userId !== userId) {
        throw new Error(`Unauthorized access to session ${sessionId}`);
      }

      if (sessionData.ended) {
        throw new Error(`Session ${sessionId} has ended`);
      }

      const {
        format = 'webm',
        sampleRate = 16000,
        channels = 1
      } = options;

      // Convert audio data to the correct format for Gemini Live API
      const processedAudio = await this.processAudioData(audioData, format, sampleRate);

      // Send audio to Gemini Live API
      sessionData.session.sendRealtimeInput({
        audio: {
          data: processedAudio,
          mimeType: `audio/pcm;rate=${sampleRate}`
        }
      });

      // Wait for response
      const turns = await sessionData.handleTurn();
      
      let transcript = '';
      let inputTranscription = '';
      let outputTranscription = '';
      let audioResponse = null;

      // Process the response
      for (const turn of turns) {
        // Handle text responses
        if (turn.text) {
          transcript += turn.text;
        }
        
        // Handle server content
        if (turn.serverContent) {
          if (turn.serverContent.inputTranscription) {
            inputTranscription = turn.serverContent.inputTranscription.text;
          }
          if (turn.serverContent.outputTranscription) {
            outputTranscription = turn.serverContent.outputTranscription.text;
          }
          if (turn.serverContent.modelTurn && turn.serverContent.modelTurn.parts) {
            for (const part of turn.serverContent.modelTurn.parts) {
              if (part.text) {
                transcript += part.text;
              }
            }
          }
        }
        
        // Handle audio data
        if (turn.data) {
          if (!audioResponse) {
            audioResponse = [];
          }
          audioResponse.push(turn.data);
        }
      }

      // Process audio response if present
      let audioBuffer = null;
      if (audioResponse && audioResponse.length > 0) {
        audioBuffer = this.combineAudioChunks(audioResponse);
      }

      // Save audio chunk for debugging/analysis
      await this.saveAudioChunk(audioData, sessionId, format);

      return {
        success: true,
        sessionId,
        inputTranscription,
        outputTranscription,
        transcript,
        audioBuffer,
        confidence: 0.95, // Gemini doesn't provide confidence scores
        timestamp: new Date().toISOString(),
        model: sessionData.model,
        responseModality: sessionData.responseModality
      };

    } catch (error) {
      console.error('Live audio processing error:', error);
      throw new Error(`Audio processing failed: ${error.message}`);
    }
  }

  async processAudioData(audioData, format, sampleRate) {
    try {
      // Security: Validate input size to prevent DoS attacks
      if (!audioData || audioData.length === 0) {
        throw new Error('Invalid audio data');
      }
      
      // Limit base64 string size to prevent memory exhaustion (5MB limit)
      if (audioData.length > 5 * 1024 * 1024 * 4/3) { // Base64 is ~4/3 original size
        throw new Error('Audio data too large (max 5MB)');
      }
      
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Additional security: limit buffer size
      if (audioBuffer.length > 5 * 1024 * 1024) { // 5MB limit
        throw new Error('Audio buffer too large (max 5MB)');
      }
      
      // Use wavefile to convert to the correct format
      const wav = new WaveFile();
      
      if (format === 'webm' || format === 'wav') {
        wav.fromBuffer(audioBuffer);
      } else if (format === 'pcm') {
        // If it's already PCM, create a wave file from it
        wav.fromScratch(1, sampleRate, '16', audioBuffer);
      } else {
        throw new Error(`Unsupported audio format: ${format}`);
      }
      
      // Convert to 16-bit PCM, 16kHz, mono (required by Gemini Live API)
      wav.toSampleRate(16000);
      wav.toBitDepth('16');
      
      // Convert to mono manually (wavefile doesn't have toMono method)
      if (wav.fmt.numChannels > 1) {
        const samples = wav.getSamples(false); // Get de-interleaved samples
        const monoSamples = [];
        
        // Average channels to create mono
        for (let i = 0; i < samples[0].length; i++) {
          let sum = 0;
          for (let channel = 0; channel < samples.length; channel++) {
            sum += samples[channel][i];
          }
          monoSamples.push(sum / samples.length);
        }
        
        // Create new mono wav file
        wav.fromScratch(1, wav.fmt.sampleRate, wav.bitDepth, monoSamples);
      }
      
      // Return as base64 string
      return wav.toBase64();
    } catch (error) {
      console.error('Error processing audio data:', error);
      throw new Error(`Audio processing failed: ${error.message}`);
    }
  }

  combineAudioChunks(audioChunks) {
    try {
      const combinedAudio = audioChunks.reduce((acc, chunk) => {
        const buffer = Buffer.from(chunk, 'base64');
        const intArray = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Int16Array.BYTES_PER_ELEMENT);
        return acc.concat(Array.from(intArray));
      }, []);

      const audioBuffer = new Int16Array(combinedAudio);
      const wf = new WaveFile();
      wf.fromScratch(1, 24000, '16', audioBuffer); // Gemini output is 24kHz
      
      return wf.toBuffer().toString('base64');
    } catch (error) {
      console.error('Error combining audio chunks:', error);
      return null;
    }
  }

  // Sanitize filename to prevent path traversal
  sanitizeFilename(filename) {
    // Remove all characters except alphanumeric, hyphens, underscores, and dots
    // Also limit length to prevent extremely long filenames
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    return sanitized.substring(0, 100); // Limit to 100 characters
  }

  async saveAudioChunk(audioData, sessionId, format) {
    try {
      // Input validation
      if (!audioData || !sessionId || !format) {
        throw new Error('Missing required parameters for audio saving');
      }

      const timestamp = Date.now();
      const sanitizedSessionId = this.sanitizeFilename(sessionId);
      const sanitizedFormat = this.sanitizeFilename(format);
      
      // Ensure sanitized values aren't empty
      if (!sanitizedSessionId || !sanitizedFormat) {
        throw new Error('Invalid session ID or format after sanitization');
      }
      
      const filename = `audio_${sanitizedSessionId}_${timestamp}.${sanitizedFormat}`;
      const filepath = path.join(this.audioDir, filename);

      // Additional security check: ensure the final path is still within audioDir
      const resolvedPath = path.resolve(filepath);
      const resolvedAudioDir = path.resolve(this.audioDir);
      
      if (!resolvedPath.startsWith(resolvedAudioDir)) {
        throw new Error('Invalid file path detected');
      }

      // Validate filename doesn't contain any remaining path characters
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename detected after sanitization');
      }

      // Convert base64 to buffer and save
      const buffer = Buffer.from(audioData, 'base64');
      
      // Additional size check for file system protection
      if (buffer.length > 10 * 1024 * 1024) { // 10MB limit for individual files
        throw new Error('Audio file too large to save (max 10MB)');
      }
      
      fs.writeFileSync(filepath, buffer);

      return filepath;
    } catch (error) {
      console.error('Error saving audio chunk:', error);
      // Don't throw here - saving is optional for debugging purposes
    }
  }

  async endSession(sessionId, userId = null) {
    try {
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Validate user ownership of session
      if (userId && sessionData.userId !== userId) {
        throw new Error(`Unauthorized access to session ${sessionId}`);
      }

      // Close the Gemini Live session
      sessionData.session.close();
      sessionData.ended = true;

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      return {
        sessionId,
        status: 'ended',
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(sessionData.startTime).getTime()
      };

    } catch (error) {
      console.error('Error ending session:', error);
      throw new Error(`Failed to end session: ${error.message}`);
    }
  }

  async getSessionStatus(sessionId, userId = null) {
    try {
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData) {
        return {
          sessionId,
          status: 'not_found',
          message: 'Session not found or expired'
        };
      }

      // Validate user ownership of session
      if (userId && sessionData.userId !== userId) {
        throw new Error(`Unauthorized access to session ${sessionId}`);
      }

      return {
        sessionId,
        status: sessionData.ended ? 'ended' : 'active',
        startTime: sessionData.startTime,
        model: sessionData.model,
        responseModality: sessionData.responseModality,
        lastActivity: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error getting session status:', error);
      throw new Error(`Failed to get session status: ${error.message}`);
    }
  }

  // Stream-based transcription for real-time streaming
  async createStreamingSession(sessionId, options = {}) {
    try {
      const sessionData = await this.startSession(sessionId, options);
      
      // Return a streaming interface
      return {
        sessionId,
        sendAudioChunk: async (audioData, audioOptions) => {
          return this.processAudioChunk(sessionId, audioData, audioOptions, options.userId);
        },
        endSession: async () => {
          return this.endSession(sessionId, options.userId);
        },
        getStatus: async () => {
          return this.getSessionStatus(sessionId, options.userId);
        },
        ...sessionData
      };

    } catch (error) {
      console.error('Error creating streaming session:', error);
      throw new Error(`Failed to create streaming session: ${error.message}`);
    }
  }

  // Get list of active sessions (filtered by user ID)
  getActiveSessions(userId = null) {
    const sessions = [];
    for (const [sessionId, sessionData] of this.activeSessions) {
      // If userId is provided, only return sessions for that user
      if (userId && sessionData.userId !== userId) {
        continue;
      }
      
      sessions.push({
        sessionId,
        status: sessionData.ended ? 'ended' : 'active',
        startTime: sessionData.startTime,
        model: sessionData.model,
        responseModality: sessionData.responseModality,
        userId: sessionData.userId
      });
    }
    return sessions;
  }

  // Clean up expired sessions (call this periodically)
  cleanupExpiredSessions() {
    const now = Date.now();
    const maxAge = 15 * 60 * 1000; // 15 minutes (Gemini Live API session limit)

    for (const [sessionId, sessionData] of this.activeSessions) {
      const age = now - new Date(sessionData.startTime).getTime();
      if (age > maxAge || sessionData.ended) {
        try {
          if (!sessionData.ended) {
            sessionData.session.close();
          }
          this.activeSessions.delete(sessionId);
          console.log(`🧹 Cleaned up expired session: ${sessionId}`);
        } catch (error) {
          console.error(`Error cleaning up session ${sessionId}:`, error);
        }
      }
    }
  }
}

export default new LiveAudioService();