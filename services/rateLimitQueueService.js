import EventEmitter from 'events';
import modelConfigService from './modelConfigService.js';

class RateLimitQueueService extends EventEmitter {
    constructor() {
        super();
        this.globalQueues = new Map(); // modelId -> queue
        this.userQueues = new Map();   // userId:modelId -> queue
        this.ipQueues = new Map();     // ip:modelId -> queue
        this.globalCounters = new Map(); // modelId -> { count, resetTime }
        this.userCounters = new Map();   // userId:modelId -> { count, resetTime }
        this.ipCounters = new Map();     // ip:modelId -> { count, resetTime }
        this.processing = new Set();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        await modelConfigService.initialize();
        this.setupCleanupInterval();
        
        this.initialized = true;
        console.log('✅ Rate limit queue service initialized');
    }

    // Check if request can proceed or needs to be queued
    async checkRateLimit(userId, modelId, ipAddress = null) {
        if (!modelConfigService.isRateLimitingEnabled()) {
            return { allowed: true, queued: false };
        }

        const globalLimit = modelConfigService.getModelGlobalRateLimit(modelId);
        const userLimit = modelConfigService.getModelUserRateLimit(modelId);

        // Check global rate limit
        const globalAllowed = this.checkGlobalLimit(modelId, globalLimit);
        
        // Check user rate limit
        const userKey = `${userId}:${modelId}`;
        const userAllowed = this.checkUserLimit(userKey, userLimit);

        // Check IP rate limit (if IP provided)
        let ipAllowed = true;
        let ipKey = null;
        if (ipAddress) {
            ipKey = `${ipAddress}:${modelId}`;
            // Default IP rate limit (stricter than user limits)
            const ipLimit = { requests: 50, window: 'hour' };
            ipAllowed = this.checkIpLimit(ipKey, ipLimit);
        }

        if (globalAllowed && userAllowed && ipAllowed) {
            // All limits allow the request
            this.incrementCounters(modelId, userKey, ipKey);
            return { allowed: true, queued: false };
        }

        // Queue the request
        const queueConfig = modelConfigService.getQueueConfig();
        if (!queueConfig.enabled) {
            // Return limit exceeded info
            const limitInfo = this.getLimitExceededInfo(modelId, userKey, globalLimit, userLimit);
            return { 
                allowed: false, 
                queued: false, 
                error: 'Rate limit exceeded',
                ...limitInfo
            };
        }

        // Add to queue
        return await this.queueRequest(userId, modelId, globalAllowed, userAllowed, ipAllowed);
    }

    checkGlobalLimit(modelId, limit) {
        const key = modelId;
        const counter = this.globalCounters.get(key);
        const windowMs = modelConfigService.getWindowDurationMs(limit.window);
        const now = Date.now();

        if (!counter || now >= counter.resetTime) {
            // Reset or initialize counter
            this.globalCounters.set(key, {
                count: 0,
                resetTime: now + windowMs
            });
            return true;
        }

        return counter.count < limit.requests;
    }

    checkUserLimit(userKey, limit) {
        const counter = this.userCounters.get(userKey);
        const windowMs = modelConfigService.getWindowDurationMs(limit.window);
        const now = Date.now();

        if (!counter || now >= counter.resetTime) {
            // Reset or initialize counter
            this.userCounters.set(userKey, {
                count: 0,
                resetTime: now + windowMs
            });
            return true;
        }

        return counter.count < limit.requests;
    }

    checkIpLimit(ipKey, limit) {
        const counter = this.ipCounters.get(ipKey);
        const windowMs = modelConfigService.getWindowDurationMs(limit.window);
        const now = Date.now();

        if (!counter || now >= counter.resetTime) {
            // Reset or initialize counter
            this.ipCounters.set(ipKey, {
                count: 0,
                resetTime: now + windowMs
            });
            return true;
        }

        return counter.count < limit.requests;
    }

    incrementCounters(modelId, userKey, ipKey = null) {
        // Increment global counter
        const globalCounter = this.globalCounters.get(modelId);
        if (globalCounter) {
            globalCounter.count++;
        }

        // Increment user counter
        const userCounter = this.userCounters.get(userKey);
        if (userCounter) {
            userCounter.count++;
        }

        // Increment IP counter if provided
        if (ipKey) {
            const ipCounter = this.ipCounters.get(ipKey);
            if (ipCounter) {
                ipCounter.count++;
            }
        }
    }

    async queueRequest(userId, modelId, globalAllowed, userAllowed, ipAllowed = true) {
        const queueConfig = modelConfigService.getQueueConfig();
        
        // Determine which queue to use
        let queueKey, queueMap;
        if (!globalAllowed) {
            queueKey = modelId;
            queueMap = this.globalQueues;
        } else {
            queueKey = `${userId}:${modelId}`;
            queueMap = this.userQueues;
        }

        // Get or create queue
        if (!queueMap.has(queueKey)) {
            queueMap.set(queueKey, []);
        }
        
        const queue = queueMap.get(queueKey);
        
        // Check queue size limit
        if (queue.length >= queueConfig.maxQueueSize) {
            return {
                allowed: false,
                queued: false,
                error: 'Queue is full, please try again later'
            };
        }

        // Create promise that resolves when request can proceed
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.removeFromQueue(queue, requestData);
                reject(new Error('Request timeout in queue'));
            }, queueConfig.processingTimeout);

            const requestData = {
                userId,
                modelId,
                resolve,
                reject,
                timeout,
                timestamp: Date.now(),
                globalBlocked: !globalAllowed,
                userBlocked: !userAllowed
            };

            queue.push(requestData);
            
            // Start processing if not already processing
            this.processQueue(queueKey, queueMap);
        });
    }

    async processQueue(queueKey, queueMap) {
        if (this.processing.has(queueKey)) {
            return; // Already processing this queue
        }

        this.processing.add(queueKey);

        try {
            while (true) {
                const queue = queueMap.get(queueKey);
                if (!queue || queue.length === 0) {
                    break;
                }

                const request = queue[0];
                const { userId, modelId, globalBlocked, userBlocked } = request;

                // Check if rate limits are now available
                let canProcess = true;
                
                if (globalBlocked) {
                    const globalLimit = modelConfigService.getModelGlobalRateLimit(modelId);
                    canProcess = this.checkGlobalLimit(modelId, globalLimit);
                }
                
                if (canProcess && userBlocked) {
                    const userLimit = modelConfigService.getModelUserRateLimit(modelId);
                    const userKey = `${userId}:${modelId}`;
                    canProcess = this.checkUserLimit(userKey, userLimit);
                }

                if (canProcess) {
                    // Remove from queue and allow request
                    queue.shift();
                    clearTimeout(request.timeout);
                    
                    // Increment counters
                    const userKey = `${userId}:${modelId}`;
                    this.incrementCounters(modelId, userKey);
                    
                    request.resolve({
                        allowed: true,
                        queued: true,
                        queueTime: Date.now() - request.timestamp
                    });
                } else {
                    // Still rate limited, wait before checking again
                    await this.sleep(1000); // Check every second
                }
            }
        } finally {
            this.processing.delete(queueKey);
        }
    }

    removeFromQueue(queue, requestData) {
        const index = queue.indexOf(requestData);
        if (index > -1) {
            queue.splice(index, 1);
        }
    }

    getLimitExceededInfo(modelId, userKey, globalLimit, userLimit) {
        const info = {};

        // Check global limit reset time
        const globalCounter = this.globalCounters.get(modelId);
        if (globalCounter && globalCounter.count >= globalLimit.requests) {
            info.globalLimitResetTime = globalCounter.resetTime;
            info.globalLimitResetIn = Math.max(0, globalCounter.resetTime - Date.now());
        }

        // Check user limit reset time
        const userCounter = this.userCounters.get(userKey);
        if (userCounter && userCounter.count >= userLimit.requests) {
            info.userLimitResetTime = userCounter.resetTime;
            info.userLimitResetIn = Math.max(0, userCounter.resetTime - Date.now());
        }

        // Return the earliest reset time
        if (info.globalLimitResetIn !== undefined && info.userLimitResetIn !== undefined) {
            const nextReset = Math.min(info.globalLimitResetIn, info.userLimitResetIn);
            info.retryAfter = Math.ceil(nextReset / 1000); // seconds
        } else if (info.globalLimitResetIn !== undefined) {
            info.retryAfter = Math.ceil(info.globalLimitResetIn / 1000);
        } else if (info.userLimitResetIn !== undefined) {
            info.retryAfter = Math.ceil(info.userLimitResetIn / 1000);
        }

        return info;
    }

    setupCleanupInterval() {
        // Clean up expired counters every 5 minutes
        setInterval(() => {
            this.cleanupExpiredCounters();
        }, 5 * 60 * 1000);
    }

    cleanupExpiredCounters() {
        const now = Date.now();
        
        // Clean up global counters
        for (const [key, counter] of this.globalCounters) {
            if (now >= counter.resetTime) {
                this.globalCounters.delete(key);
            }
        }

        // Clean up user counters
        for (const [key, counter] of this.userCounters) {
            if (now >= counter.resetTime) {
                this.userCounters.delete(key);
            }
        }

        // Clean up empty queues
        this.cleanupEmptyQueues();
    }

    cleanupEmptyQueues() {
        for (const [key, queue] of this.globalQueues) {
            if (queue.length === 0) {
                this.globalQueues.delete(key);
            }
        }

        for (const [key, queue] of this.userQueues) {
            if (queue.length === 0) {
                this.userQueues.delete(key);
            }
        }
    }

    // Get queue status for monitoring
    getQueueStatus() {
        const status = {
            globalQueues: {},
            userQueues: {},
            globalCounters: {},
            userCounters: {}
        };

        for (const [key, queue] of this.globalQueues) {
            status.globalQueues[key] = {
                length: queue.length,
                processing: this.processing.has(key)
            };
        }

        for (const [key, queue] of this.userQueues) {
            status.userQueues[key] = {
                length: queue.length,
                processing: this.processing.has(key)
            };
        }

        for (const [key, counter] of this.globalCounters) {
            status.globalCounters[key] = {
                count: counter.count,
                resetIn: Math.max(0, counter.resetTime - Date.now())
            };
        }

        for (const [key, counter] of this.userCounters) {
            status.userCounters[key] = {
                count: counter.count,
                resetIn: Math.max(0, counter.resetTime - Date.now())
            };
        }

        return status;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async shutdown() {
        // Clear all pending timeouts and reject pending requests
        for (const queue of [...this.globalQueues.values(), ...this.userQueues.values()]) {
            for (const request of queue) {
                clearTimeout(request.timeout);
                request.reject(new Error('Service shutting down'));
            }
        }

        this.globalQueues.clear();
        this.userQueues.clear();
        this.globalCounters.clear();
        this.userCounters.clear();
        this.processing.clear();

        console.log('🔽 Rate limit queue service shutdown');
    }
}

// Export singleton instance
export default new RateLimitQueueService();