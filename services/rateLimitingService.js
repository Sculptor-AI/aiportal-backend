import database from '../database/connection.js';

export class RateLimitingService {
  
  static async checkRateLimit(userId, modelId, rateLimits) {
    const now = new Date();
    
    // Check each rate limit window
    const checks = [
      { 
        type: 'minute', 
        limit: rateLimits.per_minute, 
        windowStart: new Date(now.getTime() - 60 * 1000) 
      },
      { 
        type: 'hour', 
        limit: rateLimits.per_hour, 
        windowStart: new Date(now.getTime() - 60 * 60 * 1000) 
      },
      { 
        type: 'day', 
        limit: rateLimits.per_day, 
        windowStart: new Date(now.getTime() - 24 * 60 * 60 * 1000) 
      }
    ];

    for (const check of checks) {
      if (check.limit) {
        const currentUsage = await this.getUsageInWindow(
          userId, 
          modelId, 
          check.type, 
          check.windowStart
        );

        if (currentUsage >= check.limit) {
          return {
            allowed: false,
            error: `Rate limit exceeded for ${check.type}. Limit: ${check.limit}, Current: ${currentUsage}`,
            retryAfter: this.calculateRetryAfter(check.type, check.windowStart),
            limitType: check.type,
            limit: check.limit,
            current: currentUsage
          };
        }
      }
    }

    return { allowed: true };
  }

  static async recordUsage(userId, modelId) {
    const now = new Date();
    
    // Clean up old records first (older than 24 hours)
    await this.cleanupOldRecords();

    // Record usage for each window type
    const windowTypes = ['minute', 'hour', 'day'];
    
    for (const windowType of windowTypes) {
      const windowStart = this.getWindowStart(now, windowType);
      
      // Try to increment existing record
      const result = await database.run(`
        UPDATE rate_limits 
        SET request_count = request_count + 1
        WHERE user_id = ? AND model_name = ? AND window_type = ? AND window_start = ?
      `, [userId, modelId, windowType, windowStart.toISOString()]);

      // If no existing record, create one
      if (result.changes === 0) {
        await database.run(`
          INSERT INTO rate_limits (user_id, model_name, window_type, window_start, request_count)
          VALUES (?, ?, ?, ?, 1)
        `, [userId, modelId, windowType, windowStart.toISOString()]);
      }
    }
  }

  static async getUsageInWindow(userId, modelId, windowType, windowStart) {
    const result = await database.get(`
      SELECT COALESCE(SUM(request_count), 0) as total
      FROM rate_limits 
      WHERE user_id = ? AND model_name = ? AND window_type = ? AND window_start >= ?
    `, [userId, modelId, windowType, windowStart.toISOString()]);

    return result.total;
  }

  static getWindowStart(date, windowType) {
    const d = new Date(date);
    
    switch (windowType) {
      case 'minute':
        d.setSeconds(0, 0);
        return d;
      case 'hour':
        d.setMinutes(0, 0, 0);
        return d;
      case 'day':
        d.setHours(0, 0, 0, 0);
        return d;
      default:
        throw new Error(`Invalid window type: ${windowType}`);
    }
  }

  static calculateRetryAfter(windowType, windowStart) {
    const now = new Date();
    const nextWindow = new Date(windowStart);
    
    switch (windowType) {
      case 'minute':
        nextWindow.setMinutes(nextWindow.getMinutes() + 1);
        break;
      case 'hour':
        nextWindow.setHours(nextWindow.getHours() + 1);
        break;
      case 'day':
        nextWindow.setDate(nextWindow.getDate() + 1);
        break;
    }
    
    return Math.ceil((nextWindow.getTime() - now.getTime()) / 1000);
  }

  static async cleanupOldRecords() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    await database.run(`
      DELETE FROM rate_limits 
      WHERE window_start < ? AND window_type = 'minute'
    `, [oneDayAgo.toISOString()]);

    // Keep hour records for 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await database.run(`
      DELETE FROM rate_limits 
      WHERE window_start < ? AND window_type = 'hour'
    `, [sevenDaysAgo.toISOString()]);

    // Keep day records for 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await database.run(`
      DELETE FROM rate_limits 
      WHERE window_start < ? AND window_type = 'day'
    `, [thirtyDaysAgo.toISOString()]);
  }

  static async getUserUsageStats(userId, modelId = null) {
    let query = `
      SELECT 
        model_name,
        window_type,
        SUM(request_count) as total_requests,
        MAX(window_start) as last_request
      FROM rate_limits 
      WHERE user_id = ?
    `;
    const params = [userId];

    if (modelId) {
      query += ` AND model_name = ?`;
      params.push(modelId);
    }

    query += ` GROUP BY model_name, window_type ORDER BY model_name, window_type`;

    return await database.query(query, params);
  }

  static async resetUserLimits(userId, modelId = null) {
    let query = `DELETE FROM rate_limits WHERE user_id = ?`;
    const params = [userId];

    if (modelId) {
      query += ` AND model_name = ?`;
      params.push(modelId);
    }

    return await database.run(query, params);
  }
}