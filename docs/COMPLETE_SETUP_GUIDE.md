# AI Portal Backend - Complete Setup and Configuration Guide

## Table of Contents
1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Environment Configuration](#environment-configuration)
4. [API Key Setup](#api-key-setup)
5. [Model Configuration](#model-configuration)
6. [Database Setup](#database-setup)
7. [Network Configuration](#network-configuration)
8. [Tools System Setup](#tools-system-setup)
9. [Local Models Setup](#local-models-setup)
10. [Production Deployment](#production-deployment)
11. [Monitoring and Logging](#monitoring-and-logging)
12. [Backup and Maintenance](#backup-and-maintenance)
13. [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd aiportal-backend
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start the Server
```bash
npm start
```

### 4. Get Network IP
```bash
npm run network
```

### 5. Create User and API Key
```bash
# Register
curl -X POST http://YOUR_IP:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!","email":"admin@example.com"}'

# Login
curl -X POST http://YOUR_IP:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'

# Generate API key (use JWT from login response)
curl -X POST http://YOUR_IP:3000/api/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"keyName":"Development Key"}'
```

### 6. Test the API
```bash
curl -X POST http://YOUR_IP:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"model": "custom/coding-assistant", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Installation

### Prerequisites
- **Node.js** 18+ (LTS recommended)
- **npm** or **yarn**
- **SQLite3** (included with Node.js)
- **Python 3.8+** (for Tools System)

### System Requirements
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 1GB minimum, 5GB recommended (for local models)
- **Network**: Internet connection for AI providers

### Operating System Support
- **Linux** (Ubuntu 20.04+, CentOS 7+, Debian 10+)
- **macOS** (10.15+)
- **Windows** (10/11 with WSL2 recommended)

### Installation Steps

#### Linux/macOS
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y  # Ubuntu/Debian
# or
brew update  # macOS

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs  # Ubuntu/Debian
# or
brew install node  # macOS

# Install Python (if not installed)
sudo apt install python3 python3-pip  # Ubuntu/Debian
# or
brew install python  # macOS

# Clone repository
git clone <repository-url>
cd aiportal-backend

# Install dependencies
npm install

# Install Python dependencies for Tools System
pip3 install -r requirements.txt
```

#### Windows (with WSL2)
```bash
# Install WSL2 and Ubuntu
wsl --install

# Follow Linux instructions above in WSL2
```

#### Docker Installation
```bash
# Build Docker image
docker build -t aiportal-backend .

# Run with Docker Compose
docker-compose up -d
```

## Environment Configuration

### Basic Environment Variables (.env)
```bash
# Server Configuration
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# Authentication
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_EXPIRES_IN=7d
API_KEY_EXPIRY_DAYS=365

# Database
DATABASE_PATH=./database/aiportal.db
DATABASE_BACKUP_PATH=./database/backups

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/aiportal.log

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ENABLED=false
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
CORS_CREDENTIALS=true

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=another-super-secret-key-for-sessions
```

### Provider API Keys
```bash
# AI Provider API Keys
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
OPENAI_API_KEY=sk-your-openai-key-here
GOOGLE_API_KEY=your-google-ai-studio-key-here

# Web Search
BRAVE_API_KEY=your-brave-search-api-key-here

# Local Models
OLLAMA_BASE_URL=http://localhost:11434
LLAMA_CPP_SERVER_URL=http://localhost:8080

# Cloud Storage (Optional)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
S3_BUCKET=your-s3-bucket-name
```

### Advanced Configuration
```bash
# Performance Tuning
MAX_CONCURRENT_REQUESTS=100
REQUEST_TIMEOUT_MS=120000
MEMORY_CACHE_SIZE_MB=512

# Model Configuration
MODEL_CONFIG_HOT_RELOAD=true
MODEL_CONFIG_WATCH_INTERVAL=5000

# Tools System
TOOLS_ENABLED=true
TOOLS_EXECUTION_TIMEOUT=60000
TOOLS_MAX_CONCURRENT=10
TOOLS_PYTHON_PATH=/usr/bin/python3

# Audio Processing
AUDIO_UPLOAD_MAX_SIZE=50MB
AUDIO_SESSION_TIMEOUT=900000

# Monitoring
HEALTH_CHECK_INTERVAL=30000
METRICS_ENABLED=true
METRICS_PORT=3001

# Development
DEBUG_MODE=false
DEV_MOCK_PROVIDERS=false
DEV_DISABLE_AUTH=false
```

## API Key Setup

### Getting Provider API Keys

#### OpenRouter (Recommended - Access to All Models)
1. Visit https://openrouter.ai/
2. Sign up for an account
3. Go to "Keys" section
4. Create a new API key
5. Copy key starting with `sk-or-v1-`

**Benefits:**
- Access to 100+ models from multiple providers
- Unified API interface
- Competitive pricing
- No need for separate keys

#### Anthropic Claude
1. Visit https://console.anthropic.com/
2. Sign up for an account
3. Go to "API Keys" section
4. Create a new key
5. Copy key starting with `sk-ant-`

#### OpenAI
1. Visit https://platform.openai.com/
2. Sign up for an account
3. Go to "API Keys" section
4. Create a new secret key
5. Copy key starting with `sk-`

#### Google AI Studio
1. Visit https://ai.google.dev/
2. Sign up for an account
3. Create a new project
4. Enable the Generative AI API
5. Create credentials (API key)
6. Copy the generated key

#### Brave Search (For Web Search)
1. Visit https://api.search.brave.com/
2. Sign up for an account
3. Choose a plan (free tier: 2,000 searches/month)
4. Get API key from dashboard
5. Copy the generated key

### API Key Pricing Comparison

| Provider | Model | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|-------|-------------------|-------------------|
| OpenRouter | Claude 3.5 Sonnet | $3.00 | $15.00 |
| OpenRouter | GPT-4o | $2.50 | $10.00 |
| OpenRouter | Gemini Pro | $1.25 | $5.00 |
| Direct Anthropic | Claude 3.5 Sonnet | $3.00 | $15.00 |
| Direct OpenAI | GPT-4o | $2.50 | $10.00 |
| Direct Google | Gemini Pro | $1.25 | $5.00 |

### API Key Security Best Practices

1. **Use Environment Variables**: Never hardcode keys in source code
2. **Rotate Keys Regularly**: Change keys every 90 days
3. **Limit Key Permissions**: Use read-only keys when possible
4. **Monitor Usage**: Set up billing alerts
5. **Use Different Keys**: Separate keys for development/production

### API Key Validation
```bash
# Test OpenRouter
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models

# Test Anthropic
curl -H "X-API-Key: $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages

# Test OpenAI
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Test Google
curl -H "x-goog-api-key: $GOOGLE_API_KEY" \
  https://generativelanguage.googleapis.com/v1/models

# Test Brave Search
curl -H "X-Subscription-Token: $BRAVE_API_KEY" \
  "https://api.search.brave.com/res/v1/web/search?q=test"
```

## Model Configuration

### Model Configuration System

The AI Portal uses a JSON-based model configuration system located in `/model_config/models/`. Each model has its own configuration file.

### Configuration Structure
```
model_config/
├── config.json              # Global configuration
└── models/
    ├── anthropic/
    │   ├── claude-3.5-sonnet.json
    │   └── claude-4-opus.json
    ├── openai/
    │   ├── gpt-4o.json
    │   └── o3.json
    ├── google/
    │   └── gemini-2.5-pro.json
    └── custom/
        ├── coding-assistant.json
        ├── creative-writer.json
        └── data-analyst.json
```

### Global Configuration (`config.json`)
```json
{
  "hotReload": true,
  "watchInterval": 5000,
  "defaultProvider": "openrouter",
  "fallbackModel": "openrouter/meta-llama/llama-3.2-3b-instruct:free",
  "rateLimiting": {
    "enabled": true,
    "defaultLimits": {
      "perMinute": 10,
      "perHour": 100,
      "perDay": 1000
    }
  },
  "caching": {
    "enabled": true,
    "ttl": 3600,
    "maxSize": 1000
  }
}
```

### Model Configuration Template
```json
{
  "id": "provider/model-name",
  "name": "Human Readable Name",
  "description": "Model description",
  "provider": "openrouter",
  "model": "actual-model-id",
  "apiBase": "https://openrouter.ai/api/v1",
  "enabled": true,
  "systemPrompt": "You are a helpful assistant...",
  "capabilities": {
    "text": true,
    "vision": false,
    "tools": true,
    "web_search": true,
    "audio": false
  },
  "rateLimits": {
    "perMinute": 10,
    "perHour": 100,
    "perDay": 1000,
    "tokensPerMinute": 50000,
    "tokensPerHour": 500000
  },
  "providerConfig": {
    "temperature": 0.7,
    "maxTokens": 4000,
    "topP": 1.0,
    "frequencyPenalty": 0.0,
    "presencePenalty": 0.0
  },
  "tools": {
    "enabled": true,
    "allowedTools": ["calculator", "code-execution", "web-search"],
    "maxConcurrentCalls": 3,
    "timeout": 60000
  },
  "pricing": {
    "promptTokens": 0.003,
    "completionTokens": 0.015,
    "currency": "USD"
  },
  "metadata": {
    "contextLength": 128000,
    "trainingData": "2024-04",
    "multimodal": false,
    "languages": ["en", "es", "fr", "de"],
    "specializations": ["coding", "analysis"]
  }
}
```

### Custom Model Example
```json
{
  "id": "custom/coding-assistant",
  "name": "Coding Assistant",
  "description": "Specialized programming assistant using Claude Sonnet",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "enabled": true,
  "systemPrompt": "You are an expert programming assistant. You excel at:\n- Writing clean, efficient code\n- Debugging and troubleshooting\n- Explaining complex concepts\n- Code reviews and best practices\n\nAlways provide complete, working examples with explanations.",
  "capabilities": {
    "text": true,
    "vision": true,
    "tools": true,
    "web_search": true
  },
  "rateLimits": {
    "perMinute": 20,
    "perHour": 200,
    "perDay": 2000
  },
  "providerConfig": {
    "temperature": 0.3,
    "maxTokens": 8000
  },
  "tools": {
    "enabled": true,
    "allowedTools": ["code-execution", "calculator"],
    "maxConcurrentCalls": 2
  }
}
```

### Creating New Models

1. **Create Configuration File**:
```bash
mkdir -p model_config/models/custom
touch model_config/models/custom/my-assistant.json
```

2. **Add Configuration**:
```json
{
  "id": "custom/my-assistant",
  "name": "My Custom Assistant",
  "description": "A specialized assistant for my use case",
  "provider": "openrouter",
  "model": "anthropic/claude-3.5-sonnet:beta",
  "systemPrompt": "You are a helpful assistant specialized in...",
  "enabled": true
}
```

3. **Test the Model**:
```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "model": "custom/my-assistant",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Model Management Commands
```bash
# Reload model configurations
npm run reload-models

# Validate model configurations
npm run validate-models

# List all models
npm run list-models

# Test model configuration
npm run test-model custom/coding-assistant
```

## Database Setup

### SQLite Database

The AI Portal uses SQLite for data storage, which requires no additional setup for development.

#### Database Schema
```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    is_admin BOOLEAN DEFAULT 0
);

-- API Keys table
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Usage Statistics table
CREATE TABLE usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    request_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    cost DECIMAL(10,4) DEFAULT 0,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Rate Limiting table
CREATE TABLE rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    window_type TEXT NOT NULL, -- 'minute', 'hour', 'day'
    request_count INTEGER DEFAULT 0,
    window_start DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Sessions table (for audio sessions)
CREATE TABLE audio_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

#### Database Initialization
```bash
# Initialize database with schema
npm run init-db

# Create admin user
npm run create-admin

# Reset database (CAUTION: Deletes all data)
npm run reset-db
```

#### Database Backup
```bash
# Manual backup
npm run backup-db

# Automated backup (daily)
npm run setup-backup-cron

# Restore from backup
npm run restore-db backup-2024-01-15.db
```

### Production Database Options

#### PostgreSQL Setup
```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb aiportal

# Create user
sudo -u postgres createuser aiportal_user

# Set password
sudo -u postgres psql -c "ALTER USER aiportal_user PASSWORD 'secure_password';"

# Grant permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE aiportal TO aiportal_user;"
```

**Environment Variables for PostgreSQL:**
```bash
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://aiportal_user:secure_password@localhost:5432/aiportal
```

#### MySQL Setup
```bash
# Install MySQL
sudo apt install mysql-server

# Create database
mysql -u root -p -e "CREATE DATABASE aiportal;"

# Create user
mysql -u root -p -e "CREATE USER 'aiportal_user'@'localhost' IDENTIFIED BY 'secure_password';"

# Grant permissions
mysql -u root -p -e "GRANT ALL PRIVILEGES ON aiportal.* TO 'aiportal_user'@'localhost';"
```

**Environment Variables for MySQL:**
```bash
DATABASE_TYPE=mysql
DATABASE_URL=mysql://aiportal_user:secure_password@localhost:3306/aiportal
```

## Network Configuration

### Local Network Access

The AI Portal is configured to be accessible from your entire local network by default.

#### Network Configuration
```bash
# Server binding
HOST=0.0.0.0  # Bind to all interfaces
PORT=3000     # Default port

# Get your network IP
npm run network
```

#### Firewall Configuration

**Ubuntu/Debian:**
```bash
# Allow port 3000
sudo ufw allow 3000

# Check status
sudo ufw status
```

**CentOS/RHEL:**
```bash
# Allow port 3000
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

**macOS:**
```bash
# macOS firewall typically allows local network traffic
# No additional configuration needed
```

**Windows:**
```powershell
# Add firewall rule
New-NetFirewallRule -DisplayName "AI Portal" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
```

### CORS Configuration

**Development (Disabled for Maximum Compatibility):**
```bash
CORS_ENABLED=false
```

**Production (Specific Origins):**
```bash
CORS_ENABLED=true
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400
```

### SSL/TLS Setup

#### Self-Signed Certificate (Development)
```bash
# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Update environment
SSL_ENABLED=true
SSL_CERT_PATH=./cert.pem
SSL_KEY_PATH=./key.pem
```

#### Let's Encrypt (Production)
```bash
# Install Certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d api.yourdomain.com

# Update environment
SSL_ENABLED=true
SSL_CERT_PATH=/etc/letsencrypt/live/api.yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/api.yourdomain.com/privkey.pem
```

### Reverse Proxy Setup

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

#### Apache Configuration
```apache
<VirtualHost *:80>
    ServerName api.yourdomain.com
    
    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    ProxyTimeout 300
    ProxyBadHeader Ignore
</VirtualHost>
```

## Tools System Setup

### Prerequisites
```bash
# Install Python dependencies
pip3 install -r requirements.txt

# Or install individually
pip3 install requests numpy pandas matplotlib
```

### Tools Configuration

#### Global Tools Configuration (`tools/config.json`)
```json
{
  "enabled": true,
  "maxConcurrentToolCalls": 10,
  "toolExecutionTimeout": 60000,
  "defaultPythonPath": "/usr/bin/python3",
  "allowedTools": ["*"],
  "blockedTools": [],
  "securitySandbox": true,
  "logExecutions": true
}
```

#### Individual Tool Configuration
```json
{
  "id": "calculator",
  "name": "Calculator",
  "description": "Performs mathematical calculations",
  "enabled": true,
  "maxExecutionTime": 5000,
  "allowedModels": ["*"],
  "requiresApproval": false,
  "parameters": {
    "expression": {
      "type": "string",
      "description": "Mathematical expression to evaluate",
      "required": true
    }
  },
  "security": {
    "sandbox": true,
    "allowNetworkAccess": false,
    "allowFileSystem": false
  }
}
```

### Creating Custom Tools

1. **Create Tool Directory**:
```bash
mkdir tools/my-tool
```

2. **Create Configuration** (`tools/my-tool/config.json`):
```json
{
  "id": "my-tool",
  "name": "My Custom Tool",
  "description": "Does something useful",
  "enabled": true,
  "maxExecutionTime": 10000,
  "parameters": {
    "input": {
      "type": "string",
      "description": "Input parameter",
      "required": true
    }
  }
}
```

3. **Create Controller** (`tools/my-tool/controller.py`):
```python
#!/usr/bin/env python3
import json
import sys

def main():
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Extract parameters
        user_input = input_data.get('input', '')
        
        # Process the input
        result = f"Processed: {user_input}"
        
        # Return result
        response = {
            "success": True,
            "result": result,
            "timestamp": "2024-01-01T00:00:00Z"
        }
        
        print(json.dumps(response))
        
    except Exception as e:
        error_response = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_response))
        sys.exit(1)

if __name__ == "__main__":
    main()
```

4. **Make Executable**:
```bash
chmod +x tools/my-tool/controller.py
```

5. **Test Tool**:
```bash
# Test tool directly
echo '{"input": "test"}' | python3 tools/my-tool/controller.py

# Test via API
curl -X POST http://localhost:3000/api/admin/tools/my-tool/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"input": "test"}'
```

### Tool Security

#### Sandbox Configuration
```json
{
  "security": {
    "sandbox": true,
    "allowNetworkAccess": false,
    "allowFileSystem": false,
    "allowSubprocesses": false,
    "memoryLimit": "128MB",
    "timeLimit": 30
  }
}
```

#### Python Sandbox Setup
```bash
# Install firejail for sandboxing
sudo apt install firejail

# Configure sandbox profile
sudo tee /etc/firejail/aiportal-tools.profile << EOF
include /etc/firejail/python3.profile
blacklist /home
blacklist /etc
blacklist /var
whitelist /tmp
caps.drop all
noroot
net none
EOF
```

## Local Models Setup

### Ollama Setup

#### Installation
```bash
# Linux/macOS
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download/windows
```

#### Configuration
```bash
# Start Ollama service
ollama serve

# Pull models
ollama pull llama3.2
ollama pull codellama
ollama pull mistral

# List installed models
ollama list
```

#### Environment Configuration
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=300000
OLLAMA_MODELS_PATH=/usr/share/ollama/.ollama/models
```

### llama.cpp Setup

#### Installation
```bash
# Clone repository
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp

# Build
make -j4

# Or with CUDA support
make LLAMA_CUDA=1 -j4
```

#### Download Models
```bash
# Download Llama 3.2 1B model
./scripts/setup-llama3.2-1b.sh

# Or manually
mkdir -p models
cd models
wget https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf
```

#### Start Server
```bash
# Start llama.cpp server
./llama-server -m models/Llama-3.2-1B-Instruct-Q4_K_M.gguf -c 2048 --port 8080
```

#### Environment Configuration
```bash
LLAMA_CPP_SERVER_URL=http://localhost:8080
LLAMA_CPP_MODELS_PATH=./llama.cpp/models
```

### Model Performance Optimization

#### GPU Acceleration
```bash
# NVIDIA GPU (CUDA)
CUDA_VISIBLE_DEVICES=0

# AMD GPU (ROCm)
export ROCM_PATH=/opt/rocm

# Apple Silicon (Metal)
# Automatically detected on macOS
```

#### Memory Management
```bash
# Limit memory usage
OLLAMA_MAX_MEMORY=4GB
LLAMA_CPP_MAX_MEMORY=4GB

# Enable memory mapping
OLLAMA_MMAP=true
LLAMA_CPP_MMAP=true
```

## Production Deployment

### PM2 Process Manager

#### Installation
```bash
npm install -g pm2
```

#### PM2 Configuration (`ecosystem.config.js`)
```javascript
module.exports = {
  apps: [{
    name: 'aiportal-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

#### PM2 Commands
```bash
# Start application
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit

# View logs
pm2 logs

# Restart
pm2 restart aiportal-backend

# Stop
pm2 stop aiportal-backend

# Auto-start on boot
pm2 startup
pm2 save
```

### Docker Deployment

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install Python for tools
RUN apk add --no-cache python3 py3-pip

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S aiportal -u 1001

# Set permissions
RUN chown -R aiportal:nodejs /app
USER aiportal

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
```

#### Docker Compose
```yaml
version: '3.8'

services:
  aiportal:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/aiportal.db
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - aiportal
    restart: unless-stopped

  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```

### Kubernetes Deployment

#### Deployment YAML
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aiportal-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aiportal-backend
  template:
    metadata:
      labels:
        app: aiportal-backend
    spec:
      containers:
      - name: aiportal-backend
        image: aiportal-backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: aiportal-service
spec:
  selector:
    app: aiportal-backend
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

## Monitoring and Logging

### Application Monitoring

#### Health Checks
```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health check
curl http://localhost:3000/health/detailed
```

#### Metrics Collection
```javascript
// Prometheus metrics
const prometheus = require('prom-client');

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new prometheus.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});
```

### Logging Configuration

#### Winston Logger Setup
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'aiportal-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

#### Log Rotation
```bash
# Install logrotate
sudo apt install logrotate

# Create logrotate configuration
sudo tee /etc/logrotate.d/aiportal << EOF
/path/to/aiportal/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 nodejs nodejs
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

### Performance Monitoring

#### APM Tools

**New Relic:**
```bash
npm install newrelic
```

**Datadog:**
```bash
npm install dd-trace
```

**Application Insights:**
```bash
npm install applicationinsights
```

#### Custom Metrics
```javascript
// Track API usage
const apiUsageCounter = new prometheus.Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['endpoint', 'method', 'model']
});

// Track token usage
const tokenUsageCounter = new prometheus.Counter({
  name: 'tokens_used_total',
  help: 'Total number of tokens used',
  labelNames: ['model', 'type']
});
```

## Backup and Maintenance

### Database Backup

#### Automated Backup Script
```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/app/backups"
DB_PATH="/app/database/aiportal.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/aiportal_backup_$DATE.db"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
sqlite3 "$DB_PATH" ".backup $BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

# Keep only last 30 backups
find "$BACKUP_DIR" -name "aiportal_backup_*.db.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

#### Cron Job Setup
```bash
# Add to crontab
crontab -e

# Add this line for daily backups at 2 AM
0 2 * * * /path/to/backup-database.sh
```

### System Maintenance

#### Update Script
```bash
#!/bin/bash
# update-aiportal.sh

# Backup database
./backup-database.sh

# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Restart application
pm2 restart aiportal-backend

# Check health
sleep 10
curl -f http://localhost:3000/health || exit 1

echo "Update completed successfully"
```

#### Log Cleanup
```bash
#!/bin/bash
# cleanup-logs.sh

LOG_DIR="/app/logs"
DAYS_TO_KEEP=30

# Remove old log files
find "$LOG_DIR" -name "*.log" -mtime +$DAYS_TO_KEEP -delete

# Remove old compressed logs
find "$LOG_DIR" -name "*.gz" -mtime +$DAYS_TO_KEEP -delete

echo "Log cleanup completed"
```

### Security Updates

#### Dependency Updates
```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

#### SSL Certificate Renewal
```bash
#!/bin/bash
# renew-ssl.sh

# Renew Let's Encrypt certificate
certbot renew --quiet

# Restart nginx
systemctl reload nginx

# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/api.yourdomain.com/cert.pem -text -noout | grep "Not After"
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

#### Permission Denied
```bash
# Fix file permissions
chmod +x scripts/*.sh
chown -R $USER:$USER /app

# Fix database permissions
chmod 664 database/aiportal.db
chown $USER:$USER database/aiportal.db
```

#### Out of Memory
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Optimize PM2 configuration
pm2 start ecosystem.config.js --max-memory-restart 1G
```

#### Database Locked
```bash
# Check for hanging connections
lsof database/aiportal.db

# Kill hanging processes
kill -9 <PID>

# Restore from backup if corrupted
cp database/backups/latest.db database/aiportal.db
```

### Debug Mode

#### Enable Debug Logging
```bash
DEBUG=* NODE_ENV=development npm start
```

#### API Request Debugging
```bash
# Log all requests
curl -v http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"model": "custom/coding-assistant", "messages": [{"role": "user", "content": "test"}]}'
```

#### Database Debugging
```bash
# Connect to SQLite database
sqlite3 database/aiportal.db

# Check tables
.tables

# Check user data
SELECT * FROM users;

# Check API keys
SELECT * FROM api_keys WHERE is_active = 1;
```

### Performance Optimization

#### Database Optimization
```sql
-- Create indexes
CREATE INDEX idx_usage_stats_user_model ON usage_stats(user_id, model_id);
CREATE INDEX idx_rate_limits_user_window ON rate_limits(user_id, window_type, window_start);

-- Analyze database
ANALYZE;

-- Vacuum database
VACUUM;
```

#### Memory Optimization
```bash
# Monitor memory usage
NODE_OPTIONS="--inspect" npm start

# Use Chrome DevTools to profile memory
# Navigate to chrome://inspect
```

#### Load Testing
```bash
# Install artillery
npm install -g artillery

# Create load test config
cat > load-test.yml << EOF
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: 'Chat API'
    requests:
      - post:
          url: '/api/v1/chat/completions'
          headers:
            Content-Type: 'application/json'
            X-API-Key: 'YOUR_API_KEY'
          json:
            model: 'custom/fast-responder'
            messages:
              - role: 'user'
                content: 'Hello'
EOF

# Run load test
artillery run load-test.yml
```

### Getting Help

#### Log Analysis
```bash
# View recent errors
tail -f logs/error.log | grep ERROR

# Search for specific issues
grep -r "authentication failed" logs/

# Check application logs
pm2 logs aiportal-backend
```

#### System Information
```bash
# System info
uname -a
node --version
npm --version
python3 --version

# Disk space
df -h

# Memory usage
free -h

# CPU usage
top
```

#### Health Check Detailed
```bash
curl http://localhost:3000/health/detailed
```

This should return detailed system information including:
- Database connection status
- Provider API connectivity
- Tool system status
- Memory usage
- Active sessions

For additional support, check the application logs and system resources before reporting issues.