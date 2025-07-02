import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { router as apiRouter } from './routes/api.js';
import imageGenerationRoutes from './routes/imageGenerationRoutes.js';
import rssRoutes from './routes/rssRoutes.js';
import authRoutes from './routes/authRoutes.js';
import routerboxRoutes from './routes/routerboxRoutes.js';
import customModelRoutes from './routes/customModelRoutes.js';
import usageRoutes from './routes/usageRoutes.js';
import database from './database/connection.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
// Disable helmet for local development to avoid CORS issues
// app.use(helmet({ 
//   crossOriginResourcePolicy: { policy: "cross-origin" } 
// })); 

// Enable CORS - this must come before other middleware
app.use(cors(corsOptions));

// Additional CORS middleware to handle any edge cases
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Trust Cloudflare proxy
  app.set('trust proxy', true);
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// Increase JSON body size limit to 50MB to handle base64 encoded images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Also increase URL-encoded limit

// Log requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Add a preflight route to handle OPTIONS requests
app.options('*', cors(corsOptions));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/v1/chat', routerboxRoutes); // Main Routerbox endpoint
app.use('/api/v1/custom-models', customModelRoutes); // Custom model management
app.use('/api/v1/usage', usageRoutes); // Usage statistics
app.use('/api', apiRouter);
app.use('/api/v1/images', imageGenerationRoutes);
app.use('/api/rss', rssRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await database.connect();
    
    // Check for SSL certificates
    const useHTTPS = process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH;
    let server;
    
    if (useHTTPS) {
      try {
        const httpsOptions = {
          key: fs.readFileSync(process.env.SSL_KEY_PATH),
          cert: fs.readFileSync(process.env.SSL_CERT_PATH)
        };
        
        server = https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
          console.log(`🔒 HTTPS Server running on port ${PORT}`);
          console.log(`Local access: https://localhost:${PORT}`);
          console.log(`WSL access: https://172.24.74.81:${PORT}`);
          console.log(`Network access: https://192.168.1.85:${PORT} (if port forwarded)`);
          console.log(`CORS enabled for: local network and specified domains`);
          console.log('Database connected and ready');
          console.log(`Health check: https://localhost:${PORT}/health`);
          console.log(`📖 WSL Network Setup Required - see instructions below`);
          console.log(`\n🔧 WSL Network Setup:`);
          console.log(`1. Run in Windows PowerShell as Administrator:`);
          console.log(`   netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=172.24.74.81`);
          console.log(`2. Allow through Windows Firewall:`);
          console.log(`   New-NetFirewallRule -DisplayName "WSL AI Portal" -Direction Inbound -LocalPort ${PORT} -Protocol TCP -Action Allow`);
          console.log(`3. Then access from other devices: https://192.168.1.85:${PORT}`);
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
      
      server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Local access: http://localhost:${PORT}`);
        console.log(`WSL access: http://172.24.74.81:${PORT}`);
        console.log(`Network access: http://192.168.1.85:${PORT} (if port forwarded)`);
        console.log(`CORS enabled for: local network and specified domains`);
        console.log('Database connected and ready');
        console.log(`Health check: http://localhost:${PORT}/health`);
        console.log(`📖 WSL Network Setup Required - see instructions below`);
        console.log(`\n🔧 WSL Network Setup:`);
        console.log(`1. Run in Windows PowerShell as Administrator:`);
        console.log(`   netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=172.24.74.81`);
        console.log(`2. Allow through Windows Firewall:`);
        console.log(`   New-NetFirewallRule -DisplayName "WSL AI Portal" -Direction Inbound -LocalPort ${PORT} -Protocol TCP -Action Allow`);
        console.log(`3. Then access from other devices: http://192.168.1.85:${PORT}`);
      });
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Try a different port:`);
        console.error(`   PORT=3001 npm run start:direct`);
        console.error(`   PORT=3002 npm run start:direct`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
        process.exit(1);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(() => {
        database.close();
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(() => {
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