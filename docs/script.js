// Global variables
let apiBase = 'https://api.sculptorai.org';
let apiKey = '';
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let wsConnection = null;
let currentSessionId = null;
let isWebSocketAuthenticated = false;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    
    // Temperature slider
    const tempSlider = document.getElementById('temperature');
    const tempValue = document.getElementById('temperature-value');
    tempSlider.addEventListener('input', function() {
        tempValue.textContent = this.value;
    });
});

// Tab management
function showTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// Settings management
function loadSettings() {
    const savedBase = localStorage.getItem('apiBase');
    const savedKey = localStorage.getItem('apiKey');
    
    if (savedBase) {
        apiBase = savedBase;
        document.getElementById('api-base').value = savedBase;
    }
    
    if (savedKey) {
        apiKey = savedKey;
        document.getElementById('api-key').value = savedKey;
    }
}

function saveSettings() {
    apiBase = document.getElementById('api-base').value;
    apiKey = document.getElementById('api-key').value;
    
    localStorage.setItem('apiBase', apiBase);
    localStorage.setItem('apiKey', apiKey);
    
    showNotification('Settings saved successfully!');
}

// Utility functions
function showLoading() {
    document.getElementById('loading').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showNotification(message) {
    alert(message); // Simple notification for now
}

function formatJson(obj) {
    return JSON.stringify(obj, null, 2);
}

function displayResponse(elementId, response, isSuccess = true) {
    const element = document.getElementById(elementId);
    element.textContent = typeof response === 'string' ? response : formatJson(response);
    element.className = `response-section ${isSuccess ? 'success' : 'error'}`;
}

// API request helper
async function makeRequest(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...options.headers
    };
    
    const config = {
        method: 'GET',
        headers,
        ...options
    };
    
    try {
        showLoading();
        const response = await fetch(`${apiBase}${url}`, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    } finally {
        hideLoading();
    }
}

// Chat API functions
async function sendChatRequest() {
    const model = document.getElementById('chat-model').value;
    const message = document.getElementById('chat-message').value;
    const webSearch = document.getElementById('web-search').checked;
    const stream = document.getElementById('stream').checked;
    const temperature = parseFloat(document.getElementById('temperature').value);
    
    if (!message.trim()) {
        showNotification('Please enter a message');
        return;
    }
    
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    const requestBody = {
        model,
        messages: [{ role: 'user', content: message }],
        temperature,
        web_search: webSearch,
        stream
    };
    
    try {
        if (stream) {
            await handleStreamingRequest(requestBody);
        } else {
            const response = await makeRequest('/api/v1/chat/completions', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });
            
            let content = response.choices[0].message.content;
            let links = [];
            
            // Parse links if present
            const linkMatch = content.match(/<links>\s*(.*?)\s*<\/links>/);
            if (linkMatch) {
                const linksString = linkMatch[1];
                links = linksString.split(' ; ').map(url => url.trim());
                content = content.replace(/<links>.*?<\/links>/, '').trim();
            }
            
            // Display response
            const responseElement = document.getElementById('chat-response');
            responseElement.innerHTML = `
                <div class="response-content">${content}</div>
            `;
            
            // Display links if present
            if (links.length > 0) {
                displayLinks('chat-response', links);
            }
        }
    } catch (error) {
        displayResponse('chat-response', `Error: ${error.message}`, false);
    }
}

async function handleStreamingRequest(requestBody) {
    const response = await fetch(`${apiBase}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    const responseElement = document.getElementById('chat-response');
    responseElement.innerHTML = `
        <div class="tools-section" id="tools-section" style="display: none;">
            <div class="tools-header" onclick="toggleToolsView()">
                <span class="tools-indicator">🔧</span>
                <span class="tools-title">Tools Activity</span>
                <span class="tools-toggle">▼</span>
            </div>
            <div class="tools-content" id="tools-content" style="display: none;"></div>
        </div>
        <div class="streaming-container" id="stream-content"></div>
    `;
    
    const streamContent = document.getElementById('stream-content');
    let fullContent = '';
    let toolsActive = false;
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        // Parse links from final content
                        const linkMatch = fullContent.match(/<links>\s*(.*?)\s*<\/links>/);
                        if (linkMatch) {
                            const linksString = linkMatch[1];
                            const links = linksString.split(' ; ').map(url => url.trim());
                            fullContent = fullContent.replace(/<links>.*?<\/links>/, '').trim();
                            displayLinks('chat-response', links);
                        }
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        // Handle tool events
                        if (parsed.type && parsed.type.startsWith('tool_')) {
                            handleToolEvent(parsed);
                            toolsActive = true;
                            document.getElementById('tools-section').style.display = 'block';
                            continue;
                        }
                        
                        if (parsed.choices?.[0]?.delta?.content) {
                            const deltaContent = parsed.choices[0].delta.content;
                            fullContent += deltaContent;
                            
                            const chunkDiv = document.createElement('div');
                            chunkDiv.className = 'streaming-chunk';
                            chunkDiv.textContent = deltaContent;
                            streamContent.appendChild(chunkDiv);
                            streamContent.scrollTop = streamContent.scrollHeight;
                        }
                    } catch (e) {
                        // Skip parsing errors
                    }
                }
            }
        }
    } catch (error) {
        displayResponse('chat-response', `Streaming error: ${error.message}`, false);
    }
}

function displayLinks(responseElementId, links) {
    const responseElement = document.getElementById(responseElementId);
    
    const linksDiv = document.createElement('div');
    linksDiv.className = 'links-section';
    linksDiv.innerHTML = '<h4>Sources:</h4>';
    
    links.forEach(link => {
        const linkElement = document.createElement('a');
        linkElement.href = link;
        linkElement.target = '_blank';
        linkElement.textContent = link;
        linksDiv.appendChild(linkElement);
    });
    
    responseElement.appendChild(linksDiv);
}

// Tool event handling
function handleToolEvent(event) {
    const toolsContent = document.getElementById('tools-content');
    if (!toolsContent) return;
    
    const toolId = event.tool_id || 'unknown';
    const toolName = event.tool_name || 'Unknown Tool';
    
    let toolElement = document.getElementById(`tool-${toolId}`);
    
    if (!toolElement) {
        toolElement = document.createElement('div');
        toolElement.id = `tool-${toolId}`;
        toolElement.className = 'tool-item';
        toolElement.innerHTML = `
            <div class="tool-header">
                <span class="tool-name">${toolName}</span>
                <span class="tool-status" id="status-${toolId}">pending</span>
            </div>
            <div class="tool-details" id="details-${toolId}"></div>
        `;
        toolsContent.appendChild(toolElement);
    }
    
    const statusElement = document.getElementById(`status-${toolId}`);
    const detailsElement = document.getElementById(`details-${toolId}`);
    
    switch (event.type) {
        case 'tool_call_start':
            statusElement.textContent = 'starting';
            statusElement.className = 'tool-status status-pending';
            break;
        case 'tool_call_executing':
            statusElement.textContent = 'executing';
            statusElement.className = 'tool-status status-executing';
            break;
        case 'tool_call_completed':
            statusElement.textContent = 'completed';
            statusElement.className = 'tool-status status-completed';
            if (event.result) {
                detailsElement.innerHTML = `<pre class="tool-result">${JSON.stringify(event.result, null, 2)}</pre>`;
            }
            break;
        case 'tool_call_error':
            statusElement.textContent = 'error';
            statusElement.className = 'tool-status status-error';
            if (event.error) {
                detailsElement.innerHTML = `<div class="tool-error">${event.error}</div>`;
            }
            break;
    }
}

function toggleToolsView() {
    const toolsContent = document.getElementById('tools-content');
    const toggle = document.querySelector('.tools-toggle');
    
    if (toolsContent.style.display === 'none') {
        toolsContent.style.display = 'block';
        toggle.textContent = '▲';
    } else {
        toolsContent.style.display = 'none';
        toggle.textContent = '▼';
    }
}

function clearChatResponse() {
    document.getElementById('chat-response').innerHTML = '';
}

// Live Audio functions
function generateSessionId() {
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    document.getElementById('session-id').value = sessionId;
}

async function startSession() {
    const sessionId = document.getElementById('session-id').value;
    
    if (!sessionId) {
        showNotification('Please enter a session ID');
        return;
    }
    
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    try {
        const response = await makeRequest('/api/v1/live-audio/session/start', {
            method: 'POST',
            body: JSON.stringify({ 
                session_id: sessionId,
                model: 'gemini-live-2.5-flash-preview',
                response_modality: 'text',
                input_transcription: true,
                output_transcription: true
            })
        });
        
        currentSessionId = sessionId;
        displayResponse('session-response', response, true);
    } catch (error) {
        displayResponse('session-response', `Error: ${error.message}`, false);
    }
}

async function endSession() {
    const sessionId = document.getElementById('session-id').value;
    
    if (!sessionId) {
        showNotification('Please enter a session ID');
        return;
    }
    
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    try {
        const response = await makeRequest('/api/v1/live-audio/session/end', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId })
        });
        
        displayResponse('session-response', response, true);
    } catch (error) {
        displayResponse('session-response', `Error: ${error.message}`, false);
    }
}

async function getSessionStatus() {
    const sessionId = document.getElementById('session-id').value;
    
    if (!sessionId) {
        showNotification('Please enter a session ID');
        return;
    }
    
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    try {
        const response = await makeRequest(`/api/v1/live-audio/session/${sessionId}/status`);
        displayResponse('session-response', response, true);
    } catch (error) {
        displayResponse('session-response', `Error: ${error.message}`, false);
    }
}

async function transcribeAudio() {
    const audioFile = document.getElementById('audio-file').files[0];
    const format = document.getElementById('audio-format').value;
    const sampleRate = parseInt(document.getElementById('sample-rate').value);
    const sessionId = document.getElementById('session-id').value || 'default';
    
    if (!audioFile) {
        showNotification('Please select an audio file');
        return;
    }
    
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        const response = await makeRequest('/api/v1/live-audio/transcribe', {
            method: 'POST',
            body: JSON.stringify({
                audio_data: base64Audio,
                format,
                sample_rate: sampleRate,
                session_id: sessionId
            })
        });
        
        displayResponse('transcription-response', response, true);
    } catch (error) {
        displayResponse('transcription-response', `Error: ${error.message}`, false);
    }
}

async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotification('Recording not supported in this browser');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const sessionId = document.getElementById('session-id').value || 'default';
            const sampleRate = parseInt(document.getElementById('sample-rate').value);
            
            if (apiKey) {
                try {
                    const response = await makeRequest('/api/v1/live-audio/transcribe', {
                        method: 'POST',
                        body: JSON.stringify({
                            audio_data: base64Audio,
                            format: 'webm',
                            sample_rate: sampleRate,
                            session_id: sessionId
                        })
                    });
                    
                    displayResponse('transcription-response', response, true);
                } catch (error) {
                    displayResponse('transcription-response', `Error: ${error.message}`, false);
                }
            }
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('recording-status').textContent = 'Recording... Click "Stop Recording" to finish.';
        document.getElementById('recording-status').style.color = 'green';
        
    } catch (error) {
        showNotification('Error accessing microphone: ' + error.message);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        document.getElementById('recording-status').textContent = 'Recording stopped. Processing...';
        document.getElementById('recording-status').style.color = 'orange';
        
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// WebSocket Real-time Streaming Functions
function connectWebSocket() {
    if (wsConnection) {
        wsConnection.close();
    }

    const wsUrl = apiBase.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/live-audio';
    
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = function(event) {
        console.log('WebSocket connected, authenticating...');
        document.getElementById('recording-status').textContent = 'WebSocket connected. Authenticating...';
        document.getElementById('recording-status').style.color = 'orange';
        
        // Send authentication message
        if (apiKey) {
            wsConnection.send(JSON.stringify({
                type: 'auth',
                token: apiKey,
                type: 'api_key'
            }));
        } else {
            document.getElementById('recording-status').textContent = 'WebSocket connected but no API key provided.';
            document.getElementById('recording-status').style.color = 'red';
        }
    };
    
    wsConnection.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
            case 'connected':
                console.log('WebSocket connection established, authentication required');
                break;

            case 'auth_success':
                console.log('WebSocket authenticated successfully');
                document.getElementById('recording-status').textContent = 'WebSocket authenticated. Ready to start streaming.';
                document.getElementById('recording-status').style.color = 'green';
                isWebSocketAuthenticated = true;
                break;

            case 'auth_failed':
            case 'auth_timeout':
                console.error('WebSocket authentication failed:', data.error);
                document.getElementById('recording-status').textContent = `Authentication failed: ${data.error}`;
                document.getElementById('recording-status').style.color = 'red';
                isWebSocketAuthenticated = false;
                break;

            case 'auth_required':
                console.error('Authentication required:', data.error);
                document.getElementById('recording-status').textContent = 'Please authenticate first.';
                document.getElementById('recording-status').style.color = 'red';
                isWebSocketAuthenticated = false;
                break;

            case 'rate_limit_exceeded':
                console.error('Rate limit exceeded:', data.error);
                displayResponse('transcription-response', `Rate Limit: ${data.error}`, false);
                break;
                
            case 'session_started':
                console.log('Session started:', data);
                displayResponse('session-response', data, true);
                break;
                
            case 'transcription_result':
                console.log('Transcription result:', data);
                displayResponse('transcription-response', data, true);
                break;
                
            case 'session_ended':
                console.log('Session ended:', data);
                displayResponse('session-response', data, true);
                break;

            case 'session_status':
                console.log('Session status:', data);
                displayResponse('session-response', data, true);
                break;

            case 'rate_limit_status':
                console.log('Rate limit status:', data);
                displayResponse('transcription-response', `Rate Limits: ${JSON.stringify(data.data, null, 2)}`, true);
                break;
                
            case 'error':
                console.error('WebSocket error:', data.error);
                displayResponse('transcription-response', `WebSocket Error: ${data.error}`, false);
                break;
                
            default:
                console.log('Unknown message type:', data);
        }
    };
    
    wsConnection.onclose = function(event) {
        console.log('WebSocket connection closed');
        document.getElementById('recording-status').textContent = 'WebSocket disconnected.';
        document.getElementById('recording-status').style.color = 'red';
        isWebSocketAuthenticated = false;
    };
    
    wsConnection.onerror = function(error) {
        console.error('WebSocket error:', error);
        document.getElementById('recording-status').textContent = 'WebSocket error occurred.';
        document.getElementById('recording-status').style.color = 'red';
    };
}

function startStreamingSession() {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        
        // Wait for connection to open and authenticate
        setTimeout(() => {
            if (wsConnection && wsConnection.readyState === WebSocket.OPEN && isWebSocketAuthenticated) {
                startStreamingSession();
            } else if (wsConnection && wsConnection.readyState === WebSocket.OPEN && !isWebSocketAuthenticated) {
                showNotification('WebSocket not authenticated. Please check your API key.');
            }
        }, 2000); // Increased timeout for authentication
        return;
    }

    if (!isWebSocketAuthenticated) {
        showNotification('WebSocket not authenticated. Please connect and authenticate first.');
        return;
    }
    
    const sessionId = document.getElementById('session-id').value || generateSessionId();
    
    const message = {
        type: 'start_session',
        session_id: sessionId,
        model: 'gemini-live-2.5-flash-preview',
        response_modality: 'text',
        input_transcription: true,
        output_transcription: true
    };
    
    wsConnection.send(JSON.stringify(message));
    currentSessionId = sessionId;
    document.getElementById('session-id').value = sessionId;
}

function endStreamingSession() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
            type: 'end_session'
        }));
    }
}

async function startStreamingRecording() {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        showNotification('Please connect WebSocket first');
        return;
    }
    
    if (!currentSessionId) {
        showNotification('Please start a streaming session first');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm'
        });
        
        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                const arrayBuffer = await event.data.arrayBuffer();
                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                
                const message = {
                    type: 'audio_chunk',
                    audio_data: base64Audio,
                    format: 'webm',
                    sample_rate: 16000,
                    channels: 1
                };
                
                wsConnection.send(JSON.stringify(message));
            }
        };
        
        mediaRecorder.start(1000); // Send chunks every 1 second
        isRecording = true;
        
        document.getElementById('recording-status').textContent = 'Streaming audio... Click "Stop Streaming" to finish.';
        document.getElementById('recording-status').style.color = 'green';
        
    } catch (error) {
        showNotification('Error accessing microphone: ' + error.message);
    }
}

function stopStreamingRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        document.getElementById('recording-status').textContent = 'Streaming stopped.';
        document.getElementById('recording-status').style.color = 'orange';
        
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// Authentication functions
async function registerUser() {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    if (!username || !email || !password) {
        showNotification('Please fill in all fields');
        return;
    }
    
    try {
        const response = await makeRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        
        displayResponse('register-response', response, true);
    } catch (error) {
        displayResponse('register-response', `Error: ${error.message}`, false);
    }
}

async function loginUser() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showNotification('Please fill in all fields');
        return;
    }
    
    try {
        const response = await makeRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        displayResponse('login-response', response, true);
    } catch (error) {
        displayResponse('login-response', `Error: ${error.message}`, false);
    }
}

async function generateApiKey() {
    const keyName = document.getElementById('key-name').value;
    
    if (!keyName) {
        showNotification('Please enter a key name');
        return;
    }
    
    if (!apiKey) {
        showNotification('Please set your API key in Settings first');
        return;
    }
    
    try {
        const response = await makeRequest('/api/auth/api-keys', {
            method: 'POST',
            body: JSON.stringify({ keyName })
        });
        
        displayResponse('api-key-response', response, true);
    } catch (error) {
        displayResponse('api-key-response', `Error: ${error.message}`, false);
    }
}

// Models functions
async function listModels() {
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    try {
        const response = await makeRequest('/api/v1/chat/models');
        displayResponse('models-response', response, true);
    } catch (error) {
        displayResponse('models-response', `Error: ${error.message}`, false);
    }
}

async function listCustomModels() {
    if (!apiKey) {
        showNotification('Please set your API key in Settings');
        return;
    }
    
    try {
        const response = await makeRequest('/api/v1/custom-models');
        displayResponse('custom-models-response', response, true);
    } catch (error) {
        displayResponse('custom-models-response', `Error: ${error.message}`, false);
    }
}