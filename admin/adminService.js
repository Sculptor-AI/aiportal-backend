import crypto from 'crypto';
import database from '../database/connection.js';

const ADMIN_TOKEN_EXPIRES_HOURS = 24;

export class AdminService {
  
  static async isUserAdmin(userId) {
    try {
      const user = await database.get('SELECT status FROM users WHERE id = ? AND is_active = 1', [userId]);
      return user && user.status === 'admin';
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  static async addAdmin(userId, addedBy) {
    // Check if user exists and is not already an admin
    const user = await database.get('SELECT username, status FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.status === 'admin') {
      throw new Error('User is already an admin');
    }

    // Update user status in database
    await database.run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['admin', userId]);
  }

  static async removeAdmin(userId) {
    // Check if user exists and is an admin
    const user = await database.get('SELECT username, status FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.status !== 'admin') {
      throw new Error('User is not an admin');
    }

    // Update user status in database
    await database.run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['active', userId]);
  }

  static async generateAdminToken(userId) {
    // Verify user is admin
    if (!await this.isUserAdmin(userId)) {
      throw new Error('User is not an admin');
    }

    const token = 'at_' + crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ADMIN_TOKEN_EXPIRES_HOURS);

    await database.run(
      'INSERT INTO admin_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt.toISOString()]
    );

    return token;
  }

  static async verifyAdminToken(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const result = await database.get(`
      SELECT at.user_id, u.username, at.id as token_id
      FROM admin_tokens at 
      JOIN users u ON at.user_id = u.id 
      WHERE at.token_hash = ? AND at.expires_at > datetime('now') AND at.is_revoked = 0 AND u.is_active = 1
    `, [tokenHash]);

    if (result) {
      // Verify user is still admin
      if (!await this.isUserAdmin(result.user_id)) {
        // Revoke the token if user is no longer admin
        await database.run('UPDATE admin_tokens SET is_revoked = 1 WHERE id = ?', [result.token_id]);
        return null;
      }
    }

    return result;
  }

  static async revokeAdminToken(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await database.run(
      'UPDATE admin_tokens SET is_revoked = 1 WHERE token_hash = ?',
      [tokenHash]
    );
  }

  static async revokeAllAdminTokensForUser(userId) {
    await database.run(
      'UPDATE admin_tokens SET is_revoked = 1 WHERE user_id = ? AND is_revoked = 0',
      [userId]
    );
  }

  static async getAllUsers() {
    return await database.query(`
      SELECT 
        id, 
        username, 
        email, 
        status, 
        created_at, 
        updated_at, 
        last_login, 
        is_active 
      FROM users 
      ORDER BY created_at DESC
    `);
  }

  static async updateUserStatus(userId, newStatus, adminUserId) {
    const validStatuses = ['pending', 'active', 'admin'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error('Invalid status');
    }

    // Check if user exists
    const user = await database.get('SELECT id, status FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent admins from changing their own status
    if (userId === adminUserId) {
      throw new Error('Cannot change your own admin status');
    }

    // If promoting to admin or demoting an admin, verify the requesting admin has appropriate permissions
    if (newStatus === 'admin' || user.status === 'admin') {
      // For now, any admin can promote/demote others (but not themselves)
      // In the future, you could add a super-admin role for this
      if (!await this.isUserAdmin(adminUserId)) {
        throw new Error('Insufficient privileges to change admin status');
      }
    }

    const oldStatus = user.status;
    await database.run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, userId]);

    // If demoting from admin, revoke all admin tokens for that user
    if (oldStatus === 'admin' && newStatus !== 'admin') {
      await this.revokeAllAdminTokensForUser(userId);
    }
  }

  static async updateUserDetails(userId, updates) {
    const allowedFields = ['username', 'email', 'password_hash'];
    const updateFields = [];
    const updateValues = [];

    // Validate that all field names are safe and in allowedFields
    for (const [field, value] of Object.entries(updates)) {
      if (!allowedFields.includes(field)) {
        throw new Error(`Field '${field}' is not allowed to be updated`);
      }
      if (value !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(userId);

    // Use parameterized query to prevent SQL injection
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    await database.run(query, updateValues);
  }

  static async getUserById(userId) {
    return await database.get(`
      SELECT 
        id, 
        username, 
        email, 
        status, 
        created_at, 
        updated_at, 
        last_login, 
        is_active 
      FROM users 
      WHERE id = ?
    `, [userId]);
  }

  static async getDashboardStats() {
    const [totalUsers, pendingUsers, activeUsers, adminUsers, totalApiKeys] = await Promise.all([
      database.get('SELECT COUNT(*) as count FROM users'),
      database.get('SELECT COUNT(*) as count FROM users WHERE status = "pending"'),
      database.get('SELECT COUNT(*) as count FROM users WHERE status = "active"'),
      database.get('SELECT COUNT(*) as count FROM users WHERE status = "admin"'),
      database.get('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1')
    ]);

    return {
      totalUsers: totalUsers.count,
      pendingUsers: pendingUsers.count,
      activeUsers: activeUsers.count,
      adminUsers: adminUsers.count,
      totalApiKeys: totalApiKeys.count
    };
  }
}