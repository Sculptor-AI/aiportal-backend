import { GoogleGenAI, Modality } from '@google/genai';
import { WaveFile } from 'wavefile';
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
  }

  ensureAudioDirectory() {
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
  }

  async startSession(sessionId, options = {}) {
    try {
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

  async processAudioChunk(sessionId, audioData, options = {}) {
    try {
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found or expired`);
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
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
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
      wav.toMono();
      
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

  async saveAudioChunk(audioData, sessionId, format) {
    try {
      const timestamp = Date.now();
      const filename = `audio_${sessionId}_${timestamp}.${format}`;
      const filepath = path.join(this.audioDir, filename);

      // Convert base64 to buffer and save
      const buffer = Buffer.from(audioData, 'base64');
      fs.writeFileSync(filepath, buffer);

      return filepath;
    } catch (error) {
      console.error('Error saving audio chunk:', error);
      // Don't throw here - saving is optional
    }
  }

  async endSession(sessionId) {
    try {
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found`);
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

  async getSessionStatus(sessionId) {
    try {
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData) {
        return {
          sessionId,
          status: 'not_found',
          message: 'Session not found or expired'
        };
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
          return this.processAudioChunk(sessionId, audioData, audioOptions);
        },
        endSession: async () => {
          return this.endSession(sessionId);
        },
        getStatus: async () => {
          return this.getSessionStatus(sessionId);
        },
        ...sessionData
      };

    } catch (error) {
      console.error('Error creating streaming session:', error);
      throw new Error(`Failed to create streaming session: ${error.message}`);
    }
  }

  // Get list of active sessions
  getActiveSessions() {
    const sessions = [];
    for (const [sessionId, sessionData] of this.activeSessions) {
      sessions.push({
        sessionId,
        status: sessionData.ended ? 'ended' : 'active',
        startTime: sessionData.startTime,
        model: sessionData.model,
        responseModality: sessionData.responseModality
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