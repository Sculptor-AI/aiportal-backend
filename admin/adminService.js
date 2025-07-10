import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import database from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_USERS_FILE = path.join(__dirname, 'admin-users.json');
const ADMIN_TOKEN_EXPIRES_HOURS = 24;

export class AdminService {
  
  static async loadAdminUsers() {
    try {
      const data = await fs.promises.readFile(ADMIN_USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading admin users:', error);
      return { admins: [] };
    }
  }

  static async saveAdminUsers(adminData) {
    try {
      await fs.promises.writeFile(ADMIN_USERS_FILE, JSON.stringify(adminData, null, 2));
    } catch (error) {
      console.error('Error saving admin users:', error);
      throw new Error('Failed to save admin users');
    }
  }

  static async isUserAdmin(userId) {
    const adminData = await this.loadAdminUsers();
    return adminData.admins.some(admin => admin.userId === parseInt(userId));
  }

  static async addAdmin(userId, addedBy) {
    const adminData = await this.loadAdminUsers();
    
    // Check if user is already an admin
    if (adminData.admins.some(admin => admin.userId === userId)) {
      throw new Error('User is already an admin');
    }

    // Get user info
    const user = await database.get('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new Error('User not found');
    }

    // Add to admin list
    adminData.admins.push({
      userId: userId,
      username: user.username,
      addedAt: new Date().toISOString(),
      addedBy: addedBy
    });

    await this.saveAdminUsers(adminData);

    // Update user status in database
    await database.run('UPDATE users SET status = ? WHERE id = ?', ['admin', userId]);
  }

  static async removeAdmin(userId) {
    const adminData = await this.loadAdminUsers();
    
    // Remove from admin list
    adminData.admins = adminData.admins.filter(admin => admin.userId !== userId);
    await this.saveAdminUsers(adminData);

    // Update user status in database
    await database.run('UPDATE users SET status = ? WHERE id = ?', ['active', userId]);
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

  static async updateUserStatus(userId, newStatus) {
    const validStatuses = ['pending', 'active', 'admin'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error('Invalid status');
    }

    await database.run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, userId]);

    // If setting to admin, add to admin list
    if (newStatus === 'admin') {
      const adminData = await this.loadAdminUsers();
      if (!adminData.admins.some(admin => admin.userId === parseInt(userId))) {
        const user = await database.get('SELECT username FROM users WHERE id = ?', [userId]);
        adminData.admins.push({
          userId: parseInt(userId),
          username: user.username,
          addedAt: new Date().toISOString(),
          addedBy: 'admin'
        });
        await this.saveAdminUsers(adminData);
      }
    }
    // If removing from admin, remove from admin list
    else if (newStatus !== 'admin') {
      const adminData = await this.loadAdminUsers();
      const wasAdmin = adminData.admins.some(admin => admin.userId === parseInt(userId));
      if (wasAdmin) {
        adminData.admins = adminData.admins.filter(admin => admin.userId !== parseInt(userId));
        await this.saveAdminUsers(adminData);
      }
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