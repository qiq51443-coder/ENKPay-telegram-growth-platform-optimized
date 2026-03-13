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

## Trading Feature Setup

The instant-trading (Quick Session) feature requires additional database
migrations and background services beyond the base setup.

### Required Migration

Run the trading schema migration **before** starting the backend:

```bash
docker-compose exec postgres psql -U telegram -d telegram_growth \
  -f /migrations/200_trading_rules_and_settlement.sql
```

Or directly:
```bash
psql "$DATABASE_URL" -f backend/db/migrations/200_trading_rules_and_settlement.sql
```

> If this step is skipped the `/api/trading/quick-session` endpoint returns
> `503 Trading feature is not ready`.  Check `/api/trading/health` to confirm
> which tables are missing.

### Required: At Least One Trading Pair + Rule

After running the migration, seed at least one active pair and one rule:

```sql
-- Insert a BTC/USDT trading pair (real = live Binance price)
INSERT INTO trading_pairs (symbol, display_name, pair_type, binance_symbol, is_active)
VALUES ('BTC', 'BTC/USDT', 'real', 'BTCUSDT', true);

-- Insert a 1-minute trading rule for the pair (replace <pair_id> with the id above)
INSERT INTO trading_rules (pair_id, duration_seconds, odds, min_bet, max_bet, is_active)
VALUES (<pair_id>, 60, 1.95, 1, 10000, true);
```

### Required Background Job: Auto-Settle

Trading orders are settled by the `auto-settle` job which runs every 10 seconds.
Make sure the backend process starts this job (it is started automatically in
`backend/src/index.ts` via `startAutoSettle()`).  Confirm it is running:

```bash
docker-compose logs backend | grep "auto-settle"
```

### Optional: Redis for Price Cache

Real-time prices are cached in Redis (`REDIS_URL` env var).  Without Redis the
platform falls back to direct Binance API calls for each request.  Set:

```env
REDIS_URL=redis://redis:6379
```

### Verify Trading Readiness

```bash
curl https://yourdomain.com/api/trading/health
# Returns: {"status":"ok",...} when ready
# Returns: {"status":"migration_required",...} when migrations are missing
```

---

## Multi-Bot + MiniApp Configuration

When running **multiple bots**, the Telegram Mini App authenticates the user via
`initData` signed with the **bot token that opened the WebApp**.

### How Token Validation Works

The backend (`backend/src/middleware/miniapp-auth.ts`) tries tokens in order:

1. `BOT_TOKEN` environment variable (highest priority)
2. All tokens from `bots` table where `is_active = true` (DB-sourced)

The first token that produces a matching HMAC hash is accepted.

### Correct Multi-Bot Setup

1. **Add every bot token to the `bots` table** with `is_active = true`.
2. Keep `BOT_TOKEN` set to the **primary / default bot token** in `.env`.
3. All additional bots must be registered in DB (Step 8 of this guide).

```sql
-- Verify active bots
SELECT id, name, username, is_active FROM bots WHERE is_active = true;
```

### Common Mistake: Token Mismatch

If `BOT_TOKEN` in `.env` belongs to Bot A but the user opens the Mini App via
Bot B, authentication fails with `401 Invalid init data signature`.

Fix: ensure Bot B's token is present in the `bots` table with `is_active = true`
(the middleware will try it as a fallback candidate).

```sql
UPDATE bots SET is_active = true WHERE username = 'your_bot_b_username';
```

### Nginx: Preserve X-Telegram-Init-Data Header

Make sure your Nginx proxy does **not** strip or modify custom headers:

```nginx
location /api/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # Do NOT add proxy_hide_header or header filtering here
}
```

---

## Troubleshooting

### MiniApp Shows ID:#N/A or Balance = 0

**Cause A – App opened outside Telegram (development/testing)**

The Telegram WebApp SDK is not available in a regular browser, so `initData` is
empty and `tgUser` is `undefined`.  This is expected behaviour outside Telegram.

Fix: always test the Mini App via the bot link inside Telegram.

**Cause B – Bot token mismatch (production)**

The `X-Telegram-Init-Data` signature cannot be verified because `BOT_TOKEN` or
the DB tokens do not match the bot that opened the WebApp.

Diagnosis:
```bash
# Check backend logs for the exact error
docker-compose logs backend | grep "miniapp-auth"
# Look for: REJECTED: HMAC hash mismatch  or  No bot tokens available
```

Fix: add the correct bot token to the `bots` table (see Multi-Bot section above).

**Cause C – Duplicate telegram_id records in the database**

The miniApp reads the oldest user record (`ORDER BY created_at ASC LIMIT 1`)
but a newer duplicate record holds the actual balance.

Diagnosis:
```sql
SELECT telegram_id, COUNT(*), SUM(wallet_balance)
FROM users
GROUP BY telegram_id HAVING COUNT(*) > 1;
```

Fix: run the one-time deduplication helper:
```bash
psql "$DATABASE_URL" -f scripts/fix_duplicate_users.sql
```
Uncomment the `BEGIN … COMMIT` block in that file first; review the preview
output before committing.

---

### Instant Trading Not Working

**Symptom:** Button disabled, or API returns 503 / 500.

1. **Check trading readiness endpoint:**
   ```bash
   curl https://yourdomain.com/api/trading/health
   ```
   If `status` is `migration_required`, run the `200_trading_rules_and_settlement.sql`
   migration (see Trading Feature Setup above).

2. **No active trading pairs or rules:**
   ```sql
   SELECT * FROM trading_pairs WHERE is_active = true;
   SELECT * FROM trading_rules WHERE is_active = true;
   ```
   Seed at least one pair + rule if the tables are empty.

3. **Auth failure when placing order:**
   Check backend logs for `[miniapp-auth] REJECTED`.  The order API uses the
   same Telegram initData auth as the profile page – fix the token mismatch first.

4. **Auto-settle job not running:**
   Orders stay in `active` state indefinitely if the settle job is down.
   ```bash
   docker-compose logs backend | grep -E "(auto-settle|settlement)"
   ```

---

*Last updated: 2026*
