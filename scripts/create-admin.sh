#!/bin/bash

# Create Admin User Script

echo "=== Create Admin User ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

# Load environment variables
source .env

# Prompt for admin details
read -p "Enter admin username [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

read -sp "Enter admin password: " ADMIN_PASS
echo ""

read -p "Enter admin email: " ADMIN_EMAIL

# Hash password using Node.js
PASSWORD_HASH=$(node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('$ADMIN_PASS', 10).then(hash => console.log(hash));
")

# Insert into database
docker-compose exec -T postgres psql -U telegram telegram_growth <<EOF
INSERT INTO admin_users (username, password_hash, email, role)
VALUES ('$ADMIN_USER', '$PASSWORD_HASH', '$ADMIN_EMAIL', 'super_admin')
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    email = EXCLUDED.email;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Admin user created successfully!"
    echo "  Username: $ADMIN_USER"
    echo "  Email: $ADMIN_EMAIL"
else
    echo ""
    echo "✗ Failed to create admin user"
    exit 1
fi
