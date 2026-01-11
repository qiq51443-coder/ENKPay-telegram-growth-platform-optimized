# Deployment Guide

## Production Deployment

### Prerequisites

1. Server with Docker and Docker Compose installed
2. Domain name with SSL certificate
3. Telegram Bot Token from @BotFather
4. PostgreSQL 15+ and Redis 7+ (or use Docker)

### Step 1: Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose -y

# Create app directory
mkdir -p /opt/telegram-growth-platform
cd /opt/telegram-growth-platform
```

### Step 2: Clone Repository

```bash
git clone https://github.com/qiq51443-coder/telegram-growth-platform-optimized.git .
```

### Step 3: Configure Environment

```bash
cp .env.example .env
nano .env
```

**Important environment variables:**

```env
# Database - Use strong password in production
DATABASE_URL=postgresql://telegram:STRONG_PASSWORD_HERE@postgres:5432/telegram_growth

# Backend - Use strong secret
JWT_SECRET=GENERATE_STRONG_SECRET_HERE
BACKEND_PORT=3000

# Bot - Get from @BotFather
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
BOT_ID=bot_unique_id
BOT_WEBHOOK_URL=https://yourdomain.com/webhook/YOUR_BOT_TOKEN
BOT_WEBHOOK_SECRET=GENERATE_WEBHOOK_SECRET

# Admin - Change default credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=STRONG_ADMIN_PASSWORD

# Platform
PLATFORM_NAME=YourPlatform
PLATFORM_URL=https://yourplatform.com
PLATFORM_REGISTER_URL=https://yourplatform.com/register

# Telegram Groups/Channels
REQUIRED_CHANNEL_ID=@yourchannel
REQUIRED_GROUP_ID=-1001234567890
SCREENSHOT_GROUP_ID=-1001234567890

# Rewards
FOLLOW_REWARD=50
BIND_REWARD=100
INVITE_REWARD=25
NEW_USER_RED_PACKET_CREDITS=3
SCREENSHOT_REWARD_CREDITS=1

# Redis
REDIS_URL=redis://redis:6379
```

### Step 4: Setup SSL with Nginx

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/telegram-growth
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Webhook endpoint
    location /webhook/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Admin panel (if implemented)
    location / {
        root /opt/telegram-growth-platform/admin-panel/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and restart nginx:

```bash
sudo ln -s /etc/nginx/sites-available/telegram-growth /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 5: Start Services

```bash
# Build and start containers
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify all services are running
docker-compose ps
```

### Step 6: Initialize Database

The database will be automatically initialized on first startup using the schema.sql file.

### Step 7: Create Admin User

```bash
# Connect to backend container
docker-compose exec backend npm run ts-node

# Then in Node REPL:
```

```javascript
const bcrypt = require('bcryptjs');
const { query } = require('./src/db');

async function createAdmin() {
  const passwordHash = await bcrypt.hash('your-admin-password', 10);
  await query(
    'INSERT INTO admin_users (username, password_hash, email) VALUES ($1, $2, $3)',
    ['admin', passwordHash, 'admin@example.com']
  );
  console.log('Admin user created');
}

createAdmin().then(() => process.exit(0));
```

### Step 8: Register Bot

```bash
# Create a bot in database
docker-compose exec postgres psql -U telegram -d telegram_growth
```

```sql
-- Insert your bot
INSERT INTO bots (name, token, username) 
VALUES ('Your Bot', 'YOUR_BOT_TOKEN', 'your_bot_username');

-- Get the bot ID
SELECT id FROM bots WHERE token = 'YOUR_BOT_TOKEN';

-- Initialize bot settings
INSERT INTO bot_settings (bot_id) VALUES ('BOT_ID_FROM_ABOVE');
```

### Step 9: Set Webhook (Optional)

If using webhooks instead of polling:

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/webhook/YOUR_BOT_TOKEN",
    "secret_token": "YOUR_WEBHOOK_SECRET",
    "allowed_updates": ["message", "callback_query"]
  }'
```

### Step 10: Test Bot

1. Open Telegram
2. Search for your bot (@your_bot_username)
3. Send `/start`
4. Verify welcome message appears
5. Test language switching
6. Test task viewing

## Monitoring

### Check Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f bot
docker-compose logs -f backend
docker-compose logs -f postgres
```

### Check Service Status

```bash
docker-compose ps
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart bot
docker-compose restart backend
```

## Backup

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U telegram telegram_growth > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T postgres psql -U telegram telegram_growth < backup_20240101.sql
```

### Full Backup

```bash
# Backup everything
tar -czf backup_$(date +%Y%m%d).tar.gz \
  .env \
  docker-compose.yml \
  backend/ \
  bot/ \
  admin-panel/

# Upload to remote storage
# aws s3 cp backup_20240101.tar.gz s3://your-bucket/
```

## Updates

### Update Code

```bash
cd /opt/telegram-growth-platform
git pull origin main
docker-compose down
docker-compose build
docker-compose up -d
```

### Update Dependencies

```bash
# Backend
cd backend
npm update
npm run build

# Bot
cd ../bot
npm update
npm run build

# Rebuild containers
cd ..
docker-compose build
docker-compose up -d
```

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET
- [ ] Use strong database password
- [ ] Enable SSL/TLS (HTTPS)
- [ ] Set up firewall (ufw/iptables)
- [ ] Restrict database access
- [ ] Set up webhook secret
- [ ] Regular backups
- [ ] Keep dependencies updated
- [ ] Monitor logs for suspicious activity

## Performance Optimization

### Database

```sql
-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Analyze and vacuum regularly
ANALYZE;
VACUUM;
```

### Redis

```bash
# Set memory limit
docker-compose exec redis redis-cli CONFIG SET maxmemory 256mb
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Nginx

- Enable gzip compression
- Set up caching headers
- Configure rate limiting

## Troubleshooting

### Bot Not Responding

1. Check bot is running: `docker-compose ps`
2. Check logs: `docker-compose logs bot`
3. Verify BOT_TOKEN is correct
4. Check network connectivity
5. Verify webhook is set correctly (if using)

### Database Connection Issues

1. Check PostgreSQL is running
2. Verify DATABASE_URL is correct
3. Check database logs: `docker-compose logs postgres`
4. Test connection: `docker-compose exec postgres psql -U telegram telegram_growth`

### High Memory Usage

1. Check Redis memory: `docker-compose exec redis redis-cli INFO memory`
2. Optimize queries
3. Increase swap space
4. Upgrade server resources

## Support

For issues and support:
- Create issue on GitHub
- Check documentation
- Review logs for errors

---

*Last updated: 2024*
