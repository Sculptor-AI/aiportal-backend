#!/bin/bash

# Setup port forwarding from 443 to 3000
# This allows the Node.js server to run on port 3000 while appearing on port 443

echo "🔧 Setting up port forwarding from 443 to 3000..."

if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root"
    echo "💡 Run: sudo ./setup-port-forwarding.sh"
    exit 1
fi

# Check if iptables rule already exists
if iptables -t nat -C PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 3000 2>/dev/null; then
    echo "✅ Port forwarding rule already exists"
else
    # Add the port forwarding rule
    iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 3000
    echo "✅ Added port forwarding rule: 443 → 3000"
fi

# Show current rules
echo "📋 Current NAT rules:"
iptables -t nat -L PREROUTING --line-numbers

echo ""
echo "🚀 Port forwarding setup complete!"
echo "💡 Now you can:"
echo "   1. Start the server normally: npm start"
echo "   2. Access via: https://api.sculptorai.org (will forward to port 3000)"
echo ""
echo "⚠️  Note: This rule will be lost on reboot. To make permanent:"
echo "   sudo iptables-save > /etc/iptables/rules.v4"