import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { router as apiRouter } from './routes/api.js';
import imageGenerationRoutes from './routes/imageGenerationRoutes.js';
import rssRoutes from './routes/rssRoutes.js';
import authRoutes from './routes/authRoutes.js';
import routerboxRoutes from './routes/routerboxRoutes.js';
import customModelRoutes from './routes/customModelRoutes.js';
import usageRoutes from './routes/usageRoutes.js';
import rateLimitRoutes from './routes/rateLimitRoutes.js';
import liveAudioRoutes from './routes/liveAudioRoutes.js';
import toolsRoutes from './routes/toolsRoutes.js';
import adminRoutes from './admin/adminRoutes.js';
import { setupAdmin } from './admin/setup.js';
import database from './database/connection.js';
import modelConfigService from './services/modelConfigService.js';
import rateLimitQueueService from './services/rateLimitQueueService.js';
import toolsService from './services/toolsService.js';
import { handleWebSocketConnection, cleanupExpiredSessions } from './controllers/liveAudioController.js';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

// Generate a random nonce for CSP
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Cloudflare proxy - must be set before rate limiting middleware
app.set('trust proxy', true);

// CORS disabled - allow all origins
const corsOptions = {
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  allowedHeaders: ['*'], // Allow all headers
  exposedHeaders: ['*'], // Expose all headers
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 200
};

// Middleware
// Security headers with Helmet.js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
      blockAllMixedContent: [],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hidePoweredBy: true,
  ieNoOpen: true,
  originAgentCluster: true,
  dnsPrefetchControl: true,
  permittedCrossDomainPolicies: false
}));

// Enable CORS - this must come before other middleware
app.use(cors(corsOptions));

// Additional CORS middleware to handle any edge cases
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// JSON body size limit - reduced for security (25MB for base64 encoded images)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Log requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Basic CSRF protection for non-API routes
app.use((req, res, next) => {
  // Skip CSRF for API routes (they use token-based auth)
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Check for CSRF token in header or body
  const token = req.headers['x-csrf-token'] || req.body._token;
  const sessionToken = req.session?.csrfToken;
  
  if (!sessionToken || token !== sessionToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token validation failed'
    });
  }
  
  next();
});

// Add a preflight route to handle OPTIONS requests
app.options('*', cors(corsOptions));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // Admin API endpoints
app.use('/api/v1/chat', routerboxRoutes); // Main Routerbox endpoint
app.use('/api/v1/custom-models', customModelRoutes); // Custom model management
app.use('/api/v1/usage', usageRoutes); // Usage statistics
app.use('/api/v1/rate-limits', rateLimitRoutes); // Rate limit management
app.use('/api/v1/live-audio', liveAudioRoutes); // Live audio transcription
app.use('/api/v1/tools', toolsRoutes); // Tools management and execution
app.use('/api', apiRouter);
app.use('/api/v1/images', imageGenerationRoutes);
app.use('/api/rss', rssRoutes);

// Serve admin portal static files
app.use('/admin/portal', express.static(path.join(process.cwd(), 'admin/portal')));

// Serve docs static files
app.use('/docs', express.static(path.join(process.cwd(), 'docs')));
app.use('/', express.static(path.join(process.cwd(), 'docs')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', err.message);
  console.error('Error stack:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    details: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await database.connect();
    
    // Initialize model configuration service
    console.log('🔧 Initializing model configuration service...');
    await modelConfigService.initialize();
    
    // Initialize rate limit queue service
    console.log('🚦 Initializing rate limit queue service...');
    await rateLimitQueueService.initialize();
    
    // Initialize tools service
    console.log('🔧 Initializing tools service...');
    await toolsService.initialize();
    
    // Setup admin system
    console.log('👤 Setting up admin system...');
    await setupAdmin();
    
    // Check for SSL certificates - force HTTP if FORCE_HTTP is set
    let useHTTPS = process.env.FORCE_HTTP ? false : (process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH);
    let server;
    
    if (useHTTPS) {
      try {
        const httpsOptions = {
          key: fs.readFileSync(process.env.SSL_KEY_PATH),
          cert: fs.readFileSync(process.env.SSL_CERT_PATH)
        };
        
        server = https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
          console.log(`🔒 HTTPS Server running on port ${PORT}`);
          console.log(`Local access: https://localhost:${PORT === 443 ? '' : ':' + PORT}`);
          console.log(`WSL access: https://172.24.74.81:${PORT === 443 ? '' : ':' + PORT}`);
          console.log(`Network access: https://192.168.1.85:${PORT === 443 ? '' : ':' + PORT} (if port forwarded)`);
          console.log(`Public access: https://api.sculptorai.org${PORT === 443 ? '' : ':' + PORT}`);
          console.log(`CORS enabled for: local network and specified domains`);
          console.log('Database connected and ready');
          console.log(`Health check: https://localhost:${PORT === 443 ? '' : ':' + PORT}/health`);
          console.log(`🎙️ WebSocket Live Audio: wss://localhost:${PORT === 443 ? '' : ':' + PORT}/ws/live-audio`);
          if (PORT !== 443) {
            console.log(`📖 WSL Network Setup Required - see instructions below`);
            console.log(`\n🔧 WSL Network Setup:`);
            console.log(`1. Run in Windows PowerShell as Administrator:`);
            console.log(`   netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=172.24.74.81`);
            console.log(`2. Allow through Windows Firewall:`);
            console.log(`   New-NetFirewallRule -DisplayName "WSL AI Portal" -Direction Inbound -LocalPort ${PORT} -Protocol TCP -Action Allow`);
            console.log(`3. Then access from other devices: https://192.168.1.85:${PORT}`);
          }
        });
      } catch (sslError) {
        console.error('❌ SSL certificate error:', sslError.message);
        console.log('💡 Falling back to HTTP mode. Please check your SSL certificate configuration.');
        useHTTPS = false;
      }
    }
    
    if (!useHTTPS) {
      console.warn('⚠️  Starting in HTTP mode - This is insecure for production!');
      console.log('💡 To enable HTTPS, set SSL_CERT_PATH and SSL_KEY_PATH environment variables');
      
      server = http.createServer(app).listen(PORT, '0.0.0.0', () => {
        console.log(`⚠️  HTTP Server running on port ${PORT} (INSECURE)`);
        console.log(`Local access: http://localhost:${PORT === 80 ? '' : ':' + PORT}`);
        console.log(`WSL access: http://172.24.74.81:${PORT === 80 ? '' : ':' + PORT}`);
        console.log(`Network access: http://192.168.1.85:${PORT === 80 ? '' : ':' + PORT} (if port forwarded)`);
        console.log(`CORS enabled for: local network and specified domains`);
        console.log('Database connected and ready');
        console.log(`Health check: http://localhost:${PORT === 80 ? '' : ':' + PORT}/health`);
        console.log(`🎙️ WebSocket Live Audio: ws://localhost:${PORT === 80 ? '' : ':' + PORT}/ws/live-audio`);
        if (PORT !== 80) {
          console.log(`📖 WSL Network Setup Required - see instructions below`);
          console.log(`\n🔧 WSL Network Setup:`);
          console.log(`1. Run in Windows PowerShell as Administrator:`);
          console.log(`   netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=172.24.74.81`);
          console.log(`2. Allow through Windows Firewall:`);
          console.log(`   New-NetFirewallRule -DisplayName "WSL AI Portal" -Direction Inbound -LocalPort ${PORT} -Protocol TCP -Action Allow`);
          console.log(`3. Then access from other devices: http://192.168.1.85:${PORT}`);
        }
      });
    }

    // Setup WebSocket server for live audio
    const wss = new WebSocketServer({ 
      server,
      path: '/ws/live-audio'
    });

    wss.on('connection', handleWebSocketConnection);

    console.log('🎙️ WebSocket server for live audio initialized');

    // Setup session cleanup interval (every 5 minutes)
    setInterval(() => {
      cleanupExpiredSessions();
    }, 5 * 60 * 1000);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Try a different port:`);
        console.error(`   PORT=3001 npm start`);
        console.error(`   PORT=3002 npm start`);
        process.exit(1);
      } else if (err.code === 'EACCES' && PORT < 1024) {
        console.error(`❌ Permission denied for port ${PORT}. Privileged ports (< 1024) require root access.`);
        console.error(`💡 Solutions:`);
        console.error(`   1. Run with sudo: sudo npm start`);
        console.error(`   2. Use a different port: PORT=3000 npm start`);
        console.error(`   3. Use port forwarding: sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 3000`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
        process.exit(1);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(async () => {
        await modelConfigService.shutdown();
        await rateLimitQueueService.shutdown();
        await toolsService.shutdown();
        database.close();
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(async () => {
        await modelConfigService.shutdown();
        await rateLimitQueueService.shutdown();
        await toolsService.shutdown();
        database.close();
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app; 