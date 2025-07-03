import database from '../database/connection.js';
import { AuthService } from '../utils/auth.js';
import { AdminService } from './adminService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureAdminInJsonFile(userId, username) {
  try {
    const adminFilePath = path.join(__dirname, 'admin-users.json');
    let adminData;
    
    try {
      const data = await fs.promises.readFile(adminFilePath, 'utf8');
      adminData = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, create new structure
      adminData = { admins: [] };
    }
    
    // Check if admin already exists in the file
    const existingAdmin = adminData.admins.find(admin => admin.userId === userId);
    
    if (!existingAdmin) {
      adminData.admins.push({
        userId: userId,
        username: username,
        addedAt: new Date().toISOString(),
        addedBy: 'system'
      });
      
      await fs.promises.writeFile(adminFilePath, JSON.stringify(adminData, null, 2));
      console.log(`✅ Added user ${username} (ID: ${userId}) to admin list`);
    } else {
      console.log(`ℹ️ User ${username} (ID: ${userId}) already in admin list`);
    }
  } catch (error) {
    console.error('Error updating admin JSON file:', error);
  }
}

async function setupAdmin() {
  try {
    console.log('🔧 Setting up admin system...');
    
    // Create default admin user if it doesn't exist
    try {
      const adminExists = await database.get('SELECT id FROM users WHERE username = ?', ['admin']);
      
      if (!adminExists) {
        console.log('🔑 Creating default admin user...');
        
        // Create with admin status
        const result = await database.run(
          'INSERT INTO users (username, email, password_hash, status) VALUES (?, ?, ?, ?)',
          ['admin', 'admin@localhost', await AuthService.hashPassword('admin123!'), 'admin']
        );
        
        const adminId = result.lastID;
        
        // Add to admin-users.json file
        await ensureAdminInJsonFile(adminId, 'admin');
        
        console.log('✅ Default admin user created');
        console.log('📋 Username: admin');
        console.log('📋 Password: admin123!');
        console.log('⚠️  Please change the default password immediately!');
      } else {
        console.log('ℹ️ Admin user already exists');
        // Ensure admin status
        await database.run('UPDATE users SET status = ? WHERE username = ?', ['admin', 'admin']);
        
        // Ensure admin is in JSON file
        await ensureAdminInJsonFile(adminExists.id, 'admin');
      }
    } catch (error) {
      console.error('❌ Failed to create admin user:', error.message);
    }
    
    console.log('✅ Admin setup complete');
    console.log('🌐 Admin portal available at: /admin/portal/');
    
  } catch (error) {
    console.error('❌ Admin setup failed:', error);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAdmin().then(() => process.exit(0));
}

export { setupAdmin };