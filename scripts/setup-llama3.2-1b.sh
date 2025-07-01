#!/bin/bash

# Setup script for Llama 3.2 1B local inference
# This script downloads the GGUF model and sets up llama.cpp

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🦙 Setting up Llama 3.2 1B for local inference...${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the backend directory${NC}"
    exit 1
fi

# Create models directory
echo -e "${YELLOW}📁 Creating models directory...${NC}"
mkdir -p models/llama3.2-1b

# Check if model already exists
if [ -f "models/llama3.2-1b/llama-3.2-1b-instruct-q4_k_m.gguf" ]; then
    echo -e "${GREEN}✅ Model already exists. Skipping download.${NC}"
else
    # Download the model
    echo -e "${YELLOW}⬇️  Downloading Llama 3.2 1B GGUF model (this may take a while)...${NC}"
    
    # Use curl or wget to download from HuggingFace
    MODEL_URL="https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
    MODEL_FILE="models/llama3.2-1b/llama-3.2-1b-instruct-q4_k_m.gguf"
    
    if command -v curl &> /dev/null; then
        curl -L -o "$MODEL_FILE" "$MODEL_URL"
    elif command -v wget &> /dev/null; then
        wget -O "$MODEL_FILE" "$MODEL_URL"
    else
        echo -e "${RED}Error: Neither curl nor wget is available. Please install one of them.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Model downloaded successfully!${NC}"
fi

# Check if llama.cpp is installed
echo -e "${YELLOW}🔍 Checking for llama.cpp installation...${NC}"

if command -v llama-server &> /dev/null; then
    echo -e "${GREEN}✅ llama-server found!${NC}"
    LLAMA_VERSION=$(llama-server --version 2>/dev/null || echo "unknown")
    echo -e "${BLUE}📦 Version: $LLAMA_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  llama-server not found. Installing llama.cpp...${NC}"
    
    # Install dependencies
    echo -e "${YELLOW}📦 Installing build dependencies...${NC}"
    if command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y cmake build-essential libcurl4-openssl-dev
    elif command -v yum &> /dev/null; then
        sudo yum groupinstall -y "Development Tools" && sudo yum install -y cmake libcurl-devel
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --needed cmake base-devel curl
    elif command -v brew &> /dev/null; then
        brew install cmake curl
    else
        echo -e "${RED}❌ Could not install dependencies automatically. Please install cmake and build-essential manually.${NC}"
        exit 1
    fi
    
    # Clone and build llama.cpp
    if [ ! -d "llama.cpp" ]; then
        echo -e "${YELLOW}📥 Cloning llama.cpp repository...${NC}"
        git clone https://github.com/ggerganov/llama.cpp.git
    fi
    
    cd llama.cpp
    
    # Build llama.cpp using CMake (modern method)
    echo -e "${YELLOW}🔨 Building llama.cpp with CMake (this will take a few minutes)...${NC}"
    
    # Create build directory
    mkdir -p build
    cd build
    
    # Configure with CMake (disable CURL if not available)
    cmake .. -DGGML_NATIVE=OFF -DLLAMA_SERVER=ON -DLLAMA_CURL=OFF
    
    # Build
    cmake --build . --config Release --target llama-server -j$(nproc 2>/dev/null || echo 4)
    
    cd ..
    
    # Add to PATH or create symlink
    if [ -f "build/bin/llama-server" ]; then
        sudo ln -sf "$(pwd)/build/bin/llama-server" /usr/local/bin/llama-server 2>/dev/null || {
            echo -e "${YELLOW}⚠️  Could not create system-wide symlink. You'll need to set LLAMA_CPP_PATH in your .env${NC}"
            echo -e "${BLUE}💡 Add this to your .env file: LLAMA_CPP_PATH=$(pwd)/build/bin/llama-server${NC}"
        }
    else
        echo -e "${RED}❌ Failed to build llama-server${NC}"
        exit 1
    fi
    
    cd ..
    echo -e "${GREEN}✅ llama.cpp installed successfully!${NC}"
fi

# Test the model
echo -e "${YELLOW}🧪 Testing the model...${NC}"

# Start a test server in the background
MODEL_PATH="models/llama3.2-1b/llama-3.2-1b-instruct-q4_k_m.gguf"
TEST_PORT=8082

llama-server -m "$MODEL_PATH" --port $TEST_PORT --host 127.0.0.1 -c 2048 -ngl 0 &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test the server
if curl -s "http://127.0.0.1:$TEST_PORT/health" > /dev/null; then
    echo -e "${GREEN}✅ Model server is working!${NC}"
    
    # Test a simple request
    echo -e "${YELLOW}🗨️  Testing chat completion...${NC}"
    RESPONSE=$(curl -s -X POST "http://127.0.0.1:$TEST_PORT/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{
            "messages": [{"role": "user", "content": "Hello! Just say hi back."}],
            "max_tokens": 10,
            "temperature": 0.1
        }' | jq -r '.choices[0].message.content' 2>/dev/null || echo "Could not parse response")
    
    if [ "$RESPONSE" != "Could not parse response" ] && [ ! -z "$RESPONSE" ]; then
        echo -e "${GREEN}✅ Chat test successful! Response: $RESPONSE${NC}"
    else
        echo -e "${YELLOW}⚠️  Chat test completed but response parsing failed${NC}"
    fi
else
    echo -e "${RED}❌ Model server test failed${NC}"
fi

# Stop test server
kill $SERVER_PID 2>/dev/null || true
sleep 2

# Update .env with local model configuration
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Creating .env file...${NC}"
    cp .env.example .env 2>/dev/null || touch .env
fi

# Add local model configuration if not present
if ! grep -q "LOCAL_MODELS_PATH" .env; then
    echo -e "${YELLOW}📝 Adding local model configuration to .env...${NC}"
    echo "" >> .env
    echo "# Local Model Configuration" >> .env
    echo "LOCAL_MODELS_PATH=./models" >> .env
    echo "LLAMA_CPP_PATH=llama-server" >> .env
fi

echo -e "${GREEN}🎉 Setup complete!${NC}"
echo -e "${BLUE}📋 Summary:${NC}"
echo -e "   • Model: ${GREEN}Llama 3.2 1B Instruct (Q4_K_M)${NC}"
echo -e "   • Location: ${GREEN}./models/llama3.2-1b/${NC}"
echo -e "   • API ID: ${GREEN}local/llama3.2-1b${NC}"
echo -e "   • Provider: ${GREEN}local${NC}"
echo ""
echo -e "${BLUE}🚀 Usage:${NC}"
echo -e '   curl -X POST http://localhost:3000/api/v1/chat/completions \'
echo -e '     -H "Content-Type: application/json" \'
echo -e '     -H "X-API-Key: your_api_key" \'
echo -e '     -d '"'"'{'
echo -e '       "model": "local/llama3.2-1b",'
echo -e '       "messages": [{"role": "user", "content": "Hello!"}],'
echo -e '       "stream": false'
echo -e '     }'"'"
echo ""
echo -e "${YELLOW}💡 Note: The first request may take longer as the model server starts up.${NC}"