import { createHash } from 'crypto';

/**
 * Security middleware for Live API endpoints
 * 
 * Provides additional security layers beyond basic authentication and rate limiting:
 * - Request validation and sanitization
 * - IP-based tracking and blocking
 * - Suspicious activity detection
 * - Request fingerprinting for abuse prevention
 */

class LiveApiSecurityMiddleware {
  constructor() {
    // Track suspicious IPs
    this.suspiciousIPs = new Map(); // IP -> { violations: count, lastViolation: timestamp }
    this.blockedIPs = new Set();
    
    // Track request patterns
    this.requestPatterns = new Map(); // userAgent-IP combo -> { requests: [], patterns: [] }
    
    // Configuration
    this.config = {
      MAX_VIOLATIONS_PER_IP: 5,
      VIOLATION_WINDOW_MINUTES: 60,
      BLOCK_DURATION_MINUTES: 120,
      MAX_REQUESTS_PER_PATTERN: 100,
      PATTERN_DETECTION_WINDOW_MINUTES: 10
    };
    
    // Clean up expired data every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Main security middleware
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  securityCheck = (req, res, next) => {
    try {
      const clientIP = this.getClientIP(req);
      const userAgent = req.get('User-Agent') || 'unknown';
      
      // Check if IP is blocked
      if (this.blockedIPs.has(clientIP)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: IP address is blocked due to suspicious activity'
        });
      }
      
      // Check for suspicious patterns
      if (this.detectSuspiciousActivity(req, clientIP, userAgent)) {
        this.recordViolation(clientIP, 'suspicious_pattern');
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded: Suspicious activity detected'
        });
      }
      
      // Validate request structure
      const validationResult = this.validateRequest(req);
      if (!validationResult.valid) {
        this.recordViolation(clientIP, 'invalid_request');
        return res.status(400).json({
          success: false,
          error: `Invalid request: ${validationResult.reason}`
        });
      }
      
      // Record legitimate request
      this.recordRequest(clientIP, userAgent, req);
      
      next();
    } catch (error) {
      console.error('Security middleware error:', error);
      next(); // Don't block legitimate users due to security middleware errors
    }
  };

  /**
   * Get client IP address
   * @param {Object} req - Express request
   * @returns {string} Client IP
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.ip ||
           'unknown';
  }

  /**
   * Detect suspicious activity patterns
   * @param {Object} req - Express request
   * @param {string} clientIP - Client IP
   * @param {string} userAgent - User agent
   * @returns {boolean} True if suspicious
   */
  detectSuspiciousActivity(req, clientIP, userAgent) {
    const fingerprint = this.createFingerprint(clientIP, userAgent);
    const pattern = this.requestPatterns.get(fingerprint) || { requests: [], patterns: [] };
    
    const now = Date.now();
    const windowStart = now - (this.config.PATTERN_DETECTION_WINDOW_MINUTES * 60 * 1000);
    
    // Filter recent requests
    pattern.requests = pattern.requests.filter(r => r.timestamp > windowStart);
    
    // Check for rapid requests
    if (pattern.requests.length > this.config.MAX_REQUESTS_PER_PATTERN) {
      return true;
    }
    
    // Check for unusual patterns
    if (this.detectUnusualPatterns(pattern.requests, req)) {
      return true;
    }
    
    return false;
  }

  /**
   * Detect unusual request patterns
   * @param {Array} requests - Recent requests
   * @param {Object} currentRequest - Current request
   * @returns {boolean} True if unusual
   */
  detectUnusualPatterns(requests, currentRequest) {
    if (requests.length < 10) return false;
    
    // Check for identical requests (potential replay attack)
    const currentHash = this.hashRequest(currentRequest);
    const identicalCount = requests.filter(r => r.hash === currentHash).length;
    if (identicalCount > 5) {
      return true;
    }
    
    // Check for rapid succession of different models/parameters (potential enumeration)
    const recentParams = requests.slice(-10).map(r => r.parameters);
    const uniqueParams = new Set(recentParams);
    if (uniqueParams.size > 5) {
      return true;
    }
    
    // Check for unusual timing patterns
    if (this.detectTimingAttacks(requests)) {
      return true;
    }
    
    return false;
  }

  /**
   * Detect timing-based attacks
   * @param {Array} requests - Recent requests
   * @returns {boolean} True if timing attack detected
   */
  detectTimingAttacks(requests) {
    if (requests.length < 5) return false;
    
    // Check for too regular intervals (bot-like behavior)
    const intervals = [];
    for (let i = 1; i < requests.length; i++) {
      intervals.push(requests[i].timestamp - requests[i-1].timestamp);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((acc, interval) => acc + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    
    // Low variance indicates bot-like regular timing
    return variance < 100; // Adjust threshold as needed
  }

  /**
   * Validate request structure and content
   * @param {Object} req - Express request
   * @returns {Object} Validation result
   */
  validateRequest(req) {
    // Check for required headers
    if (!req.get('User-Agent')) {
      return { valid: false, reason: 'Missing User-Agent header' };
    }
    
    // Validate content type for POST requests
    if (req.method === 'POST' && !req.is('application/json')) {
      return { valid: false, reason: 'Invalid content type' };
    }
    
    // Validate body structure for token generation
    if (req.path.includes('/generate') && req.method === 'POST') {
      const result = this.validateTokenRequest(req.body);
      if (!result.valid) {
        return result;
      }
    }
    
    // Check for suspicious headers
    const suspiciousHeaders = ['x-forwarded-host', 'x-originating-ip', 'x-cluster-client-ip'];
    for (const header of suspiciousHeaders) {
      if (req.get(header)) {
        return { valid: false, reason: `Suspicious header: ${header}` };
      }
    }
    
    return { valid: true };
  }

  /**
   * Validate token generation request
   * @param {Object} body - Request body
   * @returns {Object} Validation result
   */
  validateTokenRequest(body) {
    if (!body) {
      return { valid: true }; // Empty body is allowed
    }
    
    // Check for excessively long strings
    const maxStringLength = 1000;
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' && value.length > maxStringLength) {
        return { valid: false, reason: `${key} is too long (max ${maxStringLength} characters)` };
      }
    }
    
    // Check for suspicious model names
    if (body.model && typeof body.model === 'string') {
      if (body.model.includes('..') || body.model.includes('/') || body.model.includes('\\')) {
        return { valid: false, reason: 'Invalid model name' };
      }
    }
    
    // Check for malicious system instructions
    if (body.systemInstruction && typeof body.systemInstruction === 'string') {
      const suspiciousPatterns = [
        'eval(',
        'exec(',
        'require(',
        'import(',
        'process.',
        'fs.',
        'child_process'
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (body.systemInstruction.includes(pattern)) {
          return { valid: false, reason: 'Suspicious system instruction' };
        }
      }
    }
    
    return { valid: true };
  }

  /**
   * Record a security violation
   * @param {string} clientIP - Client IP
   * @param {string} violationType - Type of violation
   */
  recordViolation(clientIP, violationType) {
    const now = Date.now();
    const violations = this.suspiciousIPs.get(clientIP) || { violations: 0, lastViolation: now };
    
    violations.violations++;
    violations.lastViolation = now;
    
    this.suspiciousIPs.set(clientIP, violations);
    
    // Block IP if too many violations
    if (violations.violations >= this.config.MAX_VIOLATIONS_PER_IP) {
      this.blockedIPs.add(clientIP);
      console.warn(`🚫 IP blocked due to suspicious activity: ${clientIP} (${violationType})`);
    }
    
    console.warn(`⚠️  Security violation: ${clientIP} - ${violationType}`);
  }

  /**
   * Record legitimate request
   * @param {string} clientIP - Client IP
   * @param {string} userAgent - User agent
   * @param {Object} req - Express request
   */
  recordRequest(clientIP, userAgent, req) {
    const fingerprint = this.createFingerprint(clientIP, userAgent);
    const pattern = this.requestPatterns.get(fingerprint) || { requests: [], patterns: [] };
    
    pattern.requests.push({
      timestamp: Date.now(),
      path: req.path,
      method: req.method,
      hash: this.hashRequest(req),
      parameters: JSON.stringify(req.body || {})
    });
    
    this.requestPatterns.set(fingerprint, pattern);
  }

  /**
   * Create request fingerprint
   * @param {string} clientIP - Client IP
   * @param {string} userAgent - User agent
   * @returns {string} Fingerprint
   */
  createFingerprint(clientIP, userAgent) {
    return createHash('md5').update(`${clientIP}:${userAgent}`).digest('hex');
  }

  /**
   * Hash request for duplicate detection
   * @param {Object} req - Express request
   * @returns {string} Request hash
   */
  hashRequest(req) {
    const requestData = {
      path: req.path,
      method: req.method,
      body: req.body || {},
      query: req.query || {}
    };
    
    return createHash('md5').update(JSON.stringify(requestData)).digest('hex');
  }

  /**
   * Clean up expired data
   */
  cleanup() {
    const now = Date.now();
    const violationExpiry = now - (this.config.VIOLATION_WINDOW_MINUTES * 60 * 1000);
    const blockExpiry = now - (this.config.BLOCK_DURATION_MINUTES * 60 * 1000);
    
    // Clean up old violations
    for (const [ip, violations] of this.suspiciousIPs) {
      if (violations.lastViolation < violationExpiry) {
        this.suspiciousIPs.delete(ip);
      }
    }
    
    // Unblock IPs after block period
    for (const ip of this.blockedIPs) {
      const violations = this.suspiciousIPs.get(ip);
      if (!violations || violations.lastViolation < blockExpiry) {
        this.blockedIPs.delete(ip);
        console.log(`🔓 IP unblocked: ${ip}`);
      }
    }
    
    // Clean up old request patterns
    const patternExpiry = now - (this.config.PATTERN_DETECTION_WINDOW_MINUTES * 60 * 1000);
    for (const [fingerprint, pattern] of this.requestPatterns) {
      pattern.requests = pattern.requests.filter(r => r.timestamp > patternExpiry);
      if (pattern.requests.length === 0) {
        this.requestPatterns.delete(fingerprint);
      }
    }
  }

  /**
   * Get security statistics
   * @returns {Object} Security statistics
   */
  getSecurityStats() {
    return {
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousIPs.size,
      trackedPatterns: this.requestPatterns.size,
      violations: Array.from(this.suspiciousIPs.values()).reduce((sum, v) => sum + v.violations, 0)
    };
  }
}

export default new LiveApiSecurityMiddleware();