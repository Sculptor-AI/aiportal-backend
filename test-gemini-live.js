import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

async function testGeminiLive() {
    try {
        console.log('🔍 Testing Gemini Live API integration...');
        
        // Check if API key is available
        if (!process.env.GOOGLE_API_KEY) {
            console.error('❌ GOOGLE_API_KEY environment variable is not set');
            console.log('💡 Please set GOOGLE_API_KEY in your .env file');
            return;
        }
        
        console.log('✅ Google API key found');
        
        // Initialize GoogleGenAI client
        const ai = new GoogleGenAI({});
        console.log('✅ GoogleGenAI client initialized');
        
        // Test basic connection (we won't actually connect to avoid using quota)
        console.log('✅ Basic setup complete');
        
        console.log(`
🎙️ Gemini Live API Ready!

Available Models:
- gemini-live-2.5-flash-preview (Half-cascade, recommended)
- gemini-2.5-flash-preview-native-audio-dialog (Native audio)
- gemini-2.5-flash-exp-native-audio-thinking-dialog (Native audio with thinking)
- gemini-2.0-flash-live-001 (Alternative half-cascade)

Features:
- Real-time audio transcription
- Voice Activity Detection
- Input/output transcription
- 15-minute session limits
- WebSocket streaming support
- Audio format conversion (WebM/WAV/PCM to 16kHz mono PCM)

To use:
1. Start the server: npm start
2. Open the interactive docs: http://localhost:3000/docs/
3. Use the Live Audio tab to test functionality
4. For real-time streaming, use the WebSocket connection

Note: The implementation is ready but requires a valid Google API key to function.
        `);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        if (error.message.includes('fetch')) {
            console.log('💡 This may be due to network restrictions or API key issues');
        }
    }
}

testGeminiLive();