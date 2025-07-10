import crypto from 'crypto';

// Generate a key from environment variable or use a default (must be changed in production)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-byte-key-here-change-me!!';
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Encrypt data using AES-256-GCM
 * @param {Object} data - Data to encrypt
 * @returns {string} Encrypted data as base64 string with IV and auth tag
 */
export const encryptPacket = (data) => {
  try {
    // Convert data to JSON string
    const jsonStr = JSON.stringify(data);
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipher('aes-256-gcm', ENCRYPTION_KEY);
    cipher.setAAD(Buffer.from('aiportal-auth', 'utf8'));
    
    // Encrypt the data
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Error encrypting data:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data with IV and auth tag
 * @returns {Object} Decrypted data
 */
export const decryptPacket = (encryptedData) => {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract IV, auth tag, and encrypted data
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = combined.slice(IV_LENGTH + 16);
    
    // Create decipher
    const decipher = crypto.createDecipher('aes-256-gcm', ENCRYPTION_KEY);
    decipher.setAAD(Buffer.from('aiportal-auth', 'utf8'));
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Error decrypting data:', error);
    throw new Error('Failed to decrypt data');
  }
}; 