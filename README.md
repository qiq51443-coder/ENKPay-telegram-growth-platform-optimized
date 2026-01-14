# Telegram Growth Platform (Optimized)

🚀 A comprehensive Telegram multi-bot growth & reward platform with advanced features.

## ✨ Features

### Core Features
- **Multi-language Support**: English, Chinese, French, Spanish, Arabic
- **Reply Keyboard**: Quick access buttons with 2-column layout
- **Red Packet System**: Credits-based claiming system
- **Platform Binding**: Step-by-step verification workflow
- **Exchange Tutorials**: Detailed guides for multiple exchanges
- **Admin Broadcast**: Real-time notifications to all users
- **Real-time Settings Sync**: Backend changes instantly reflect in bot
- **Earnings Screenshot Sharing**: Share and earn red packet credits

### User Features
- Automatic Bot ID and Invite Code generation
- Task completion tracking (Follow, Join, Bind)
- Invitation rewards system
- Balance management and transaction history
- Enhanced account information display
- Red packet credits management

### Admin Features
- User management and statistics
- Platform binding approval
- Screenshot approval for credits
- Red packet creation and distribution
- Broadcast message system
- Exchange tutorial management
- Real-time settings configuration

## 📋 Requirements

- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 15+
- Redis 7+
- Telegram Bot Token

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/qiq51443-coder/telegram-growth-platform-optimized.git
cd telegram-growth-platform-optimized
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://telegram:telegram123@postgres:5432/telegram_growth

# Backend
BACKEND_PORT=3000
JWT_SECRET=your-secret-key-here

# Bot
BOT_TOKEN=your-telegram-bot-token
BOT_ID=your-bot-id

# Platform
PLATFORM_NAME=YourPlatform
PLATFORM_URL=https://platform.example.com
PLATFORM_REGISTER_URL=https://platform.example.com/register

# Telegram
REQUIRED_CHANNEL_ID=@yourchannel
REQUIRED_GROUP_ID=-1001234567890
SCREENSHOT_GROUP_ID=-1001234567890

# Rewards
FOLLOW_REWARD=50
BIND_REWARD=100
INVITE_REWARD=25
NEW_USER_RED_PACKET_CREDITS=3
```

### 3. Start with Docker

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- Redis cache
- Backend API server
- Admin panel (port 5173)

### 4. Initialize Database

The database schema will be automatically created on first startup. Run migrations:

```bash
docker-compose exec backend npm run migrate
```

### 5. Access Admin Panel

1. Open `http://localhost:5173` in your browser
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin123`
   - ⚠️ **Change password immediately after first login!**

### 6. Authorize Your Telegram Bot

Before starting the bot, you need to authorize it through the admin panel:

1. **Create a Bot via @BotFather**:
   - Open [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow instructions
   - Save the **Bot Token** you receive

2. **Authorize Bot in Admin Panel**:
   - Go to "Bot 管理" (Bot Management)
   - Click "创建 Bot" (Create Bot)
   - Enter Bot name and paste the Bot Token
   - Click "确定" (OK)
   - **Copy the Bot ID** displayed in the list

3. **Configure Bot Environment**:
   - Edit your `.env` file
   - Set `BOT_TOKEN` to your Telegram bot token
   - Set `BOT_ID` to the ID from the admin panel
   - Example:
     ```env
     BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
     BOT_ID=550e8400-e29b-41d4-a716-446655440000
     ```

4. **Start the Bot**:
   ```bash
   docker-compose up -d bot
   # or for development
   cd bot && npm run dev
   ```

📖 **For detailed instructions, see [Bot Authorization Guide](./BOT_AUTHORIZATION_GUIDE.md)**

### 7. Verify Everything Works

## 🏗️ Architecture

```
telegram-growth-platform-optimized/
├── backend/              # Backend API (Express + TypeScript)
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── middleware/   # Authentication, etc.
│   │   ├── utils/        # Utilities (Telegram API, rewards, cache)
│   │   └── db/           # Database connection
│   └── db/
│       └── schema.sql    # Database schema
│
├── bot/                  # Telegram Bot (Telegraf + TypeScript)
│   └── src/
│       ├── handlers/     # Command and message handlers
│       ├── keyboards/    # Reply keyboards
│       ├── i18n/         # Multi-language support
│       ├── services/     # API client, settings sync
│       └── utils/        # State management
│
└── docker-compose.yml    # Docker configuration
```

## 🔧 Development

### Backend Development

```bash
cd backend
npm install
npm run dev
```

### Bot Development

```bash
cd bot
npm install
npm run dev
```

## 📱 Bot Features

### Reply Keyboard Layout

```
🎯 Tasks      👥 Invites
💰 Balance    📚 Tutorials  
👤 Account    🌐 Language
🏦 Exchange   ❓ Help
```

### Welcome Flow

1. User starts bot → Shows welcome message
2. Display platform registration link
3. Tasks shown as locked 🔒
4. After completing tasks → Rewards unlocked

### Task System

- **Follow Channel**: Verify membership, unlock rewards
- **Join Group**: Verify membership, unlock rewards
- **Bind Platform**: Step-by-step binding with screenshot
- **Share Screenshot**: Post earnings screenshot for credits

### Red Packet Credits

- New users: 3 credits
- Screenshot approval: +1 credit
- Required to claim red packets
- Displayed in account info

### Language Switch

When user changes language:
1. Update user preference
2. Send new Reply Keyboard with translated buttons
3. All subsequent messages in new language

## 🔐 Security

- JWT authentication for admin API
- Bot token authentication for bot API
- Webhook secret validation
- Password hashing with bcrypt
- SQL injection protection with parameterized queries

## 📊 Database Schema

Key tables:
- `users` - User accounts with credits
- `platform_bindings` - Platform verification requests
- `earnings_screenshots` - Screenshot submissions
- `red_packets` - Red packet campaigns
- `red_packet_claims` - Claim history
- `broadcasts` - Broadcast messages
- `exchanges` - Exchange tutorials
- `bot_settings` - Real-time configuration

## 🌐 API Endpoints

### Public Endpoints
- `POST /api/auth/login` - Admin login
- `GET /api/exchanges` - List exchanges
- `GET /api/exchanges/:id` - Get exchange details

### Admin Endpoints (Requires JWT)
- `GET /api/admin/bots` - List bots
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/users` - List users
- `PUT /api/users/:id` - Update user
- `GET /api/bindings` - List binding requests
- `PUT /api/bindings/:id/review` - Review binding
- `GET /api/screenshots` - List screenshots
- `PUT /api/screenshots/:id/review` - Review screenshot
- `POST /api/redpackets` - Create red packet
- `POST /api/broadcasts` - Create broadcast
- `PUT /api/settings/:botId` - Update settings

### Bot Endpoints (Requires Bot Token)
- `GET /api/users/telegram/:id` - Get user by Telegram ID
- `POST /api/users` - Create user
- `POST /api/screenshots` - Submit screenshot
- `POST /api/redpackets/:id/claim` - Claim red packet

## 🎯 Key Features Implementation

### Real-time Settings Sync

Settings are cached in Redis with pub/sub:
1. Admin updates settings
2. Backend publishes update event
3. All bot instances receive event
4. Bots clear cache and fetch new settings

### Red Packet Distribution

Random distribution algorithm:
- Ensures fairness across claims
- Last claimer gets exact remaining amount
- Requires credits to prevent abuse

### Screenshot Workflow

1. User clicks "Share Screenshot"
2. Bot provides group link
3. User posts screenshot in group
4. Bot records (doesn't delete)
5. Admin reviews and approves
6. User receives credit

### Platform Binding Flow

1. User clicks "Bind Platform"
2. Enter username
3. Upload screenshot
4. Submit for review
5. Admin approves/rejects
6. User receives notification and reward

## 🐛 Troubleshooting

### Bot not responding
- Check BOT_TOKEN is correct
- Verify bot is started: `docker-compose ps`
- Check logs: `docker-compose logs bot`

### Database connection errors
- Ensure PostgreSQL is running
- Check DATABASE_URL is correct
- Verify schema is initialized

### Redis connection errors
- Ensure Redis is running
- Check REDIS_URL is correct

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For support, please contact: @support

---

*Optimized from telegram-growth-platform*