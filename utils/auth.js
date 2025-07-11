import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import database from '../database/connection.js';

const getJWTSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required and must be set');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return process.env.JWT_SECRET;
};
const JWT_EXPIRES_IN = '7d';
const REFRESH_TOKEN_EXPIRES_DAYS = 30;
const SALT_ROUNDS = 12;

export class AuthService {
  
  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, message: 'Password is required' };
    }
    
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    
    if (password.length > 128) {
      return { valid: false, message: 'Password must be less than 128 characters long' };
    }
    
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    
    if (!/\d/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }
    
    // Check for common weak passwords
    const commonPasswords = [
      'password', '12345678', 'qwerty123', 'admin123', 
      'password123', 'letmein123', 'welcome123', 'abc123456'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      return { valid: false, message: 'Password is too common. Please choose a stronger password' };
    }
    
    return { valid: true };
  }

  static async hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
  }

  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static generateAccessToken(userId, username) {
    return jwt.sign(
      { userId, username, type: 'access' },
      getJWTSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  static generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
  }

  static async verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, getJWTSecret());
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static async createUser(username, password, email = null) {
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    const existingUser = await database.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    const passwordHash = await this.hashPassword(password);
    
    const result = await database.run(
      'INSERT INTO users (username, email, password_hash, status) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, 'pending']
    );

    return result.lastID;
  }

  static async authenticateUser(username, password) {
    const user = await database.get(
      'SELECT id, username, password_hash, status, is_active FROM users WHERE username = ? AND is_active = 1',
      [username]
    );

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user is pending
    if (user.status === 'pending') {
      throw new Error('Account is pending approval. Please contact an administrator.');
    }

    const isValidPassword = await this.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await database.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    return {
      id: user.id,
      username: user.username,
      status: user.status
    };
  }

  static async createRefreshToken(userId) {
    const token = this.generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await database.run(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt.toISOString()]
    );

    return token;
  }

  static async verifyRefreshToken(token, userId) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const storedToken = await database.get(
      'SELECT id FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND expires_at > datetime("now") AND is_revoked = 0',
      [userId, tokenHash]
    );

    return !!storedToken;
  }

  static async revokeRefreshToken(token, userId) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await database.run(
      'UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ? AND token_hash = ?',
      [userId, tokenHash]
    );
  }

  static async generateApiKey(userId, keyName) {
    // Check user status first
    const user = await database.get('SELECT status FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.status === 'pending') {
      throw new Error('Cannot generate API keys for pending users');
    }

    const apiKey = 'ak_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyPrefix = apiKey.substring(0, 8);

    await database.run(
      'INSERT INTO api_keys (user_id, key_name, key_hash, key_prefix) VALUES (?, ?, ?, ?)',
      [userId, keyName, keyHash, keyPrefix]
    );

    return apiKey;
  }

  static async verifyApiKey(apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const result = await database.get(`
      SELECT ak.user_id, u.username, u.status, ak.id as key_id
      FROM api_keys ak 
      JOIN users u ON ak.user_id = u.id 
      WHERE ak.key_hash = ? AND ak.is_active = 1 AND u.is_active = 1
    `, [keyHash]);

    if (result) {
      // Check if user is pending
      if (result.status === 'pending') {
        return null; // Don't allow API access for pending users
      }

      // Update last used timestamp
      await database.run(
        'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
        [result.key_id]
      );
    }

    return result;
  }

  static async getUserApiKeys(userId) {
    return await database.query(
      'SELECT id, key_name, key_prefix, created_at, last_used, is_active FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  static async revokeApiKey(userId, keyId) {
    await database.run(
      'UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?',
      [keyId, userId]
    );
  }
}