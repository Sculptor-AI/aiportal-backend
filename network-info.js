#!/usr/bin/env node

import { networkInterfaces } from 'os';

console.log('🌐 AI Portal Backend - Network Information\n');

const interfaces = networkInterfaces();
const PORT = process.env.PORT || 3000;

console.log('📡 Server Access URLs:');
console.log(`   Local:    http://localhost:${PORT}`);
console.log(`   Local:    http://127.0.0.1:${PORT}`);

// Find network interfaces
Object.keys(interfaces).forEach((name) => {
  interfaces[name].forEach((iface) => {
    // Skip internal/loopback interfaces
    if (iface.internal || iface.family !== 'IPv4') return;
    
    console.log(`   Network:  http://${iface.address}:${PORT} (${name})`);
  });
});

console.log('\n🔧 Quick Test Commands:');
console.log('\n1. Health Check:');
interfaces[Object.keys(interfaces)[0]]?.forEach((iface) => {
  if (!iface.internal && iface.family === 'IPv4') {
    console.log(`   curl http://${iface.address}:${PORT}/health`);
    return false; // Just show first one
  }
});

console.log('\n2. Register User:');
interfaces[Object.keys(interfaces)[0]]?.forEach((iface) => {
  if (!iface.internal && iface.family === 'IPv4') {
    console.log(`   curl -X POST http://${iface.address}:${PORT}/api/auth/register \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"username":"testuser","password":"Test123!","email":"test@example.com"}'`);
    return false;
  }
});

console.log('\n📖 See API_DOCS.md for complete documentation');
console.log('🚀 Start server: npm start');
console.log('🔍 Network access enabled - other devices on your network can now connect!\n');