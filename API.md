# API Documentation

Base URL: `http://localhost:3000` (development) or `https://yourdomain.com` (production)

## Authentication

### Admin Authentication
Most admin endpoints require JWT authentication:
```
Authorization: Bearer <JWT_TOKEN>
```

### Bot Authentication
Bot endpoints require bot token in header:
```
X-Bot-Token: <BOT_ID>
```

## Endpoints

### Authentication

#### POST /api/auth/login
Admin login

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "super_admin"
  }
}
```

#### POST /api/auth/register
Create new admin user

**Request:**
```json
{
  "username": "newadmin",
  "password": "password123",
  "email": "admin@example.com"
}
```

---

### Users

#### GET /api/users
List all users (Admin only)

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20, max: 100)
- `search` - Search by username, name, or Bot ID
- `botId` - Filter by bot ID

**Response:**
```json
{
  "users": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

#### GET /api/users/:id
Get user by ID (Admin only)

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "telegram_id": 123456789,
    "username": "john_doe",
    "first_name": "John",
    "robot_user_id": "BOT123456789",
    "invite_code": "ABC12345",
    "balance": 150.50,
    "red_packet_credits": 5,
    ...
  },
  "transactions": [...]
}
```

#### GET /api/users/telegram/:telegramId
Get user by Telegram ID (Bot only)

**Headers:** `X-Bot-Token: <bot_id>`

**Response:**
```json
{
  "user": { ... }
}
```

#### POST /api/users
Create new user (Bot only)

**Headers:** `X-Bot-Token: <bot_id>`

**Request:**
```json
{
  "telegram_id": 123456789,
  "username": "john_doe",
  "first_name": "John",
  "language_code": "en",
  "invite_code_used": "ABC12345"
}
```

#### PUT /api/users/:id
Update user (Admin only)

**Request:**
```json
{
  "balance": 200,
  "account_status": "active",
  "red_packet_credits": 10
}
```

#### GET /api/users/:id/transactions
Get user transactions

**Query:** `?limit=10`

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "reward",
      "amount": 50,
      "balance_after": 150,
      "description": "Task completion",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### GET /api/users/:id/invites
Get user invitation stats

**Response:**
```json
{
  "total": 10
}
```

#### GET /api/users/stats/overview
Get user statistics (Admin only)

**Response:**
```json
{
  "total_users": 1000,
  "bound_users": 500,
  "new_today": 25,
  "active_today": 300,
  "total_balance": 50000,
  "avg_balance": 50
}
```

---

### Platform Bindings

#### GET /api/bindings
List binding requests (Admin only)

**Query:**
- `page`, `limit`
- `status` - pending, approved, rejected
- `botId`

**Response:**
```json
{
  "bindings": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "platform_username": "user123",
      "screenshot_file_id": "file_id",
      "status": "pending",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### PUT /api/bindings/:id/review
Review binding request (Admin only)

**Request:**
```json
{
  "status": "approved",
  "admin_note": "Verified"
}
```

**Response:**
```json
{
  "binding": { ... }
}
```

---

### Red Packets

#### POST /api/redpackets
Create red packet (Admin only)

**Request:**
```json
{
  "bot_id": "uuid",
  "chat_id": -1001234567890,
  "title": "Lucky Red Packet",
  "total_amount": 100,
  "total_count": 10,
  "expires_in_hours": 24
}
```

#### GET /api/redpackets
List red packets (Admin only)

**Query:** `?botId=uuid&status=active`

#### GET /api/redpackets/:id
Get red packet details

**Response:**
```json
{
  "redPacket": {
    "id": "uuid",
    "total_amount": 100,
    "total_count": 10,
    "claimed_count": 5,
    "claimed_amount": 50,
    "status": "active"
  }
}
```

#### POST /api/redpackets/:id/claim
Claim red packet

**Request:**
```json
{
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "amount": 10.50,
  "claimed_count": 6
}
```

#### GET /api/redpackets/:id/claims
Get claim history (Admin only)

---

### Screenshots

#### POST /api/screenshots
Submit screenshot (Bot only)

**Headers:** `X-Bot-Token: <bot_id>`

**Request:**
```json
{
  "user_id": "uuid",
  "group_id": -1001234567890,
  "message_id": 12345,
  "file_id": "file_id"
}
```

#### GET /api/screenshots
List screenshots (Admin only)

**Query:** `?status=pending&botId=uuid`

#### PUT /api/screenshots/:id/review
Review screenshot (Admin only)

**Request:**
```json
{
  "status": "approved",
  "admin_note": "Valid screenshot"
}
```

---

### Broadcasts

#### POST /api/broadcasts
Create broadcast (Admin only)

**Request:**
```json
{
  "bot_id": "uuid",
  "title": "Update",
  "content": "Important message",
  "target_type": "all",
  "scheduled_at": "2024-01-01T12:00:00Z"
}
```

#### GET /api/broadcasts
List broadcasts (Admin only)

#### POST /api/broadcasts/:id/send
Send broadcast (Admin only)

**Response:**
```json
{
  "success": true,
  "sent_count": 1000,
  "failed_count": 5
}
```

#### DELETE /api/broadcasts/:id
Delete draft broadcast (Admin only)

---

### Exchanges

#### GET /api/exchanges
List exchanges (Public)

**Response:**
```json
{
  "exchanges": [
    {
      "id": "uuid",
      "name": "Binance",
      "name_zh": "币安",
      "logo_url": "https://...",
      "register_url": "https://...",
      "tutorial_content": {
        "en": "Tutorial text...",
        "zh": "教程文本..."
      },
      "is_active": true
    }
  ]
}
```

#### GET /api/exchanges/:id
Get exchange details (Public)

#### POST /api/exchanges
Create exchange (Admin only)

**Request:**
```json
{
  "name": "Binance",
  "name_zh": "币安",
  "logo_url": "https://...",
  "register_url": "https://...",
  "tutorial_content": {
    "en": "...",
    "zh": "..."
  },
  "order_index": 0
}
```

#### PUT /api/exchanges/:id
Update exchange (Admin only)

#### DELETE /api/exchanges/:id
Delete exchange (Admin only)

---

### Settings

#### GET /api/settings/:botId
Get bot settings

**Response:**
```json
{
  "settings": {
    "platform_name": "Platform",
    "platform_url": "https://...",
    "required_channel_id": "@channel",
    "follow_reward": 50,
    "bind_reward": 100,
    "new_user_credits": 3,
    ...
  }
}
```

#### PUT /api/settings/:botId
Update bot settings (Admin only)

**Request:**
```json
{
  "platform_name": "New Name",
  "follow_reward": 75,
  "new_user_credits": 5
}
```

---

### Admin

#### GET /api/admin/bots
List bots (Admin only)

#### POST /api/admin/bots
Create bot (Admin only)

**Request:**
```json
{
  "name": "My Bot",
  "token": "123456:ABC..."
}
```

#### PUT /api/admin/bots/:id
Update bot (Admin only)

#### GET /api/admin/dashboard/stats
Get dashboard statistics (Admin only)

**Response:**
```json
{
  "users": {
    "total_users": 1000,
    "bound_users": 500,
    "new_today": 25,
    "active_today": 300
  },
  "transactions": {
    "total_rewards": 50000,
    "total_transactions": 5000,
    "rewards_today": 1000
  },
  "bindings": {
    "total_bindings": 500,
    "pending_bindings": 10,
    "approved_bindings": 490
  },
  "redPackets": {
    "total_red_packets": 100,
    "total_claimed_amount": 10000,
    "active_red_packets": 5
  }
}
```

---

### Webhook

#### POST /webhook/:botToken
Telegram webhook endpoint

**Headers:** `X-Telegram-Bot-Api-Secret-Token: <secret>`

**Body:** Telegram Update object

---

## Error Responses

All endpoints may return error responses:

```json
{
  "error": "Error message"
}
```

Common HTTP status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

Consider implementing rate limiting for:
- User creation: 10 per minute per IP
- Login attempts: 5 per minute per IP
- Red packet claims: 1 per second per user
- API calls: 100 per minute per token

---

*Last updated: 2024*
