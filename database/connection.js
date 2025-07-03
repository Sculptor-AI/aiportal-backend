import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Database {
  constructor() {
    this.db = null;
    this.dbPath = join(__dirname, 'aiportal.db');
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.initializeSchema().then(resolve).catch(reject);
        }
      });
    });
  }

  async initializeSchema() {
    try {
      // First, run migrations to add missing columns to existing tables
      await this.runMigrations();
      
      // Then run the full schema to create any missing tables
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      return new Promise((resolve, reject) => {
        this.db.exec(schema, (err) => {
          if (err) {
            console.error('Error initializing schema:', err);
            reject(err);
          } else {
            console.log('Database schema initialized');
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Error in initializeSchema:', error);
      throw error;
    }
  }

  async runMigrations() {
    try {
      // Check if users table exists
      const tables = await this.query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      
      if (tables.length > 0) {
        // Users table exists, check if status column exists
        const tableInfo = await this.query("PRAGMA table_info(users)");
        const hasStatusColumn = tableInfo.some(col => col.name === 'status');
        
        if (!hasStatusColumn) {
          console.log('Adding status column to users table...');
          await this.run('ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT "pending"');
          console.log('✅ Added status column');
          
          // Update existing users to active status (since they were created before the pending system)
          await this.run('UPDATE users SET status = "active" WHERE status IS NULL OR status = ""');
          console.log('✅ Updated existing users to active status');
        }
      }
      
      // Ensure admin_tokens table exists
      await this.run(`
        CREATE TABLE IF NOT EXISTS admin_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token_hash VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_revoked BOOLEAN DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      
      // Add indexes if they don't exist
      await this.run('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_admin_tokens_user_id ON admin_tokens(user_id)');
      await this.run('CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires ON admin_tokens(expires_at)');
      
      console.log('✅ Database migrations completed');
    } catch (error) {
      console.error('Migration error:', error);
      // Don't throw the error for migrations, just log it
      console.log('⚠️ Some migrations failed, but continuing...');
    }
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

const database = new Database();

export default database;