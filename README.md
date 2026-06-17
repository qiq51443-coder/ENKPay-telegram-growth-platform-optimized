# ENK Pay

💳 支付 · 🏆 竞拍 · 📈 即时交易 · ❤️ 公益援助 — 全链路互动 / 可追溯 / 高参与

ENK Pay 是一个基于 Telegram 的综合支付与数字资产管理平台，集成了 NFT 交易、多人竞拍、即时交易、公益援助和完整的钱包系统。

## ✨ 核心功能

### 🎨 NFT 定期产品
- **分类管理**: 组织和展示不同类型的 NFT 产品
- **产品类型**: 
  - 定期产品：固定期限，自动计算年化收益
  - 即时产品：即买即得，立即拥有
  - 限量产品：稀缺性，先到先得
- **智能收益**: 自动计算到期收益并返还用户账户
- **持仓追踪**: 完整的 NFT 持有记录和收益日志

### 🏆 多人竞拍系统
- **份额制竞拍**: 用户购买份额参与抽奖，公平透明
- **多种奖品**: 支持 NFT、USDT、实物、自定义奖品
- **随机开奖**: 加密随机算法选择中奖者
- **参与记录**: 完整的竞拍历史和中奖记录

### 📈 即时交易
- **真实币种**: 实时同步 Binance API 价格数据
- **自定义币种**: 管理员可控制价格走势，设置预设曲线
- **交易会话**: 基于时间的交易轮次，支持上涨/下跌预测
- **即时结算**: 自动计算盈亏，实时到账

### ❤️ 公益援助
- **项目管理**: 创建和管理公益筹款项目
- **透明捐赠**: 每笔捐赠可追溯，实时显示筹款进度
- **组织认证**: 支持显示发起组织信息

### 💰 钱包系统
- **双余额机制**:
  - `wallet_balance`: 钱包余额（可提现、可转账）
  - `reward_balance`: 奖励余额（需交易解锁）
- **HD 钱包**: 为每个用户生成独立的区块链充值地址
- **多链支持**: TRC20, ERC20, BEP20 等多个网络
- **自动充值检测**: 后台任务定期检测链上充值
- **安全提现**: 管理员审核机制，防止欺诈
- **用户转账**: 2% 手续费的内部转账系统

### 👥 邀请系统
- **二级奖励**:
  - L1: 邀请人关注奖励 5 USDT，首次交易奖励 5 USDT
  - L2: 二级邀请人也可获得首次交易奖励 5 USDT
- **解锁机制**: 完成交易 100% 奖励金额后才能提现
- **邀请追踪**: 完整的邀请链和奖励记录

## 📋 环境要求

- **Docker** & **Docker Compose**
- **Node.js** 20+ (本地开发)
- **PostgreSQL** 15+
- **Redis** 7+
- **Telegram Bot Token**

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/qiq51443-coder/telegram-growth-platform-optimized.git
cd telegram-growth-platform-optimized
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库
DATABASE_URL=postgresql://telegram:telegram123@postgres:5432/telegram_growth

# 后端
BACKEND_PORT=3000
JWT_SECRET=your-secret-key-here-change-me

# 钱包加密密钥（至少 32 字符）
WALLET_ENCRYPTION_KEY=your-32-character-encryption-key-here-change-me

# Telegram Bot
BOT_TOKEN=your-telegram-bot-token
BOT_USERNAME=your_bot_username

# WebApp URL
WEBAPP_URL=https://your-webapp-url.com

# 区块链 API 密钥（可选，用于链上查询）
ETHERSCAN_API_KEY=your-etherscan-api-key
BSCSCAN_API_KEY=your-bscscan-api-key
TRONGRID_API_KEY=your-trongrid-api-key

# Redis
REDIS_URL=redis://redis:6379

# 网页端邮箱登录 JWT（建议单独配置）
WEB_JWT_SECRET=your-web-jwt-secret

# 邮件服务兜底配置（后台“系统设置 → 邮件服务”未配置时使用）
MAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@example.com
EMAIL_FROM_NAME=ENKPay
```

### 2.1 网页端邮箱登录 / 邮件服务配置说明

- 网页端入口位于 `/web/#/login` 与 `/web/#/register`，官网落地页按钮也会跳转到这里。
- 邮箱验证码默认通过 **Resend** 发送。
- 推荐在管理后台 **系统设置 → 邮件服务** 中配置 `Resend API Key`、发件邮箱、发件名称和启用状态；后台配置优先于环境变量。
- `.env` 中的 `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_FROM_NAME` 仅作为后台未配置时的兜底值。
- 新增网页 JWT 使用 `WEB_JWT_SECRET`（未设置时回退到 `JWT_SECRET`）。

#### 邮件服务动态开关

- **启用邮件服务**: 注册页面显示验证码输入框，用户必须验证邮箱才能完成注册
- **禁用邮件服务**: 注册页面隐藏验证码输入框，用户可直接注册无需邮件验证
- 前端通过 `/api/mail/status` API 动态检测邮件服务状态，自动调整注册流程
- 管理员可在后台"系统设置 → 邮件服务"中切换启用/禁用状态

#### 多语言邮件模板管理

- 支持 9 种语言的邮件模板：中文、英文、法语、德语、西班牙语、阿拉伯语、日语、韩语、俄语
- 管理员可在后台"系统设置 → 邮件服务 → 邮件模板管理"中编辑各语言的邮件内容
- 包含邮件主题、HTML内容、纯文本内容三部分
- 支持变量替换：`{{code}}`（验证码）、`{{platform_name}}`（平台名称）、`{{valid_minutes}}`（有效分钟数）
- 系统自动根据用户语言（Accept-Language header）选择对应模板发送
- 模板回退链：用户语言 → 英文 → 中文 → 默认硬编码模板

### 3. 启动服务

```bash
docker-compose up -d
```

这将启动：
- PostgreSQL 数据库
- Redis 缓存
- 后端 API 服务器
- 管理面板 (端口 5173)
- Telegram Bot

### 4. 初始化数据库

```bash
# 运行迁移脚本
docker-compose exec backend npm run migrate
```

### 5. 访问管理面板

1. 打开浏览器访问 `http://localhost:5173`
2. 使用默认凭据登录:
   - 用户名: `admin`
   - 密码: `admin123`
   - ⚠️ **首次登录后立即修改密码！**

### 6. 配置你的 Telegram Bot

详见 [Bot Authorization Guide](./BOT_AUTHORIZATION_GUIDE.md)

## 🏗️ 项目架构

```
telegram-growth-platform-optimized/
├── backend/                    # 后端 API (Express + TypeScript)
│   ├── src/
│   │   ├── routes/            # API 路由
│   │   │   ├── nft.ts         # NFT 产品和持仓
│   │   │   ├── auction.ts     # 竞拍系统
│   │   │   ├── trading.ts     # 用户交易
│   │   │   ├── trading-admin.ts # 交易管理
│   │   │   ├── charity.ts     # 公益项目
│   │   │   ├── wallet.ts      # 用户钱包
│   │   │   ├── wallet-admin.ts # 钱包管理
│   │   │   ├── redpackets.ts  # 红包系统
│   │   │   └── ...
│   │   ├── services/          # 业务服务
│   │   │   ├── balance.service.ts    # 余额计算
│   │   │   ├── price.service.ts      # 价格服务
│   │   │   ├── deposit.service.ts    # HD 钱包地址生成
│   │   │   └── deposit-checker.ts    # 自动充值检测
│   │   ├── middleware/        # 中间件
│   │   ├── utils/             # 工具函数
│   │   └── db/                # 数据库连接
│   └── db/
│       └── migrations/        # 数据库迁移
│
├── admin-panel/               # 管理面板 (React + Ant Design)
│   └── src/
│       ├── pages/             # 页面组件
│       │   ├── NFTCategories.tsx
│       │   ├── NFTProducts.tsx
│       │   ├── Auctions.tsx
│       │   ├── TradingPairs.tsx
│       │   ├── CustomPriceControl.tsx
│       │   ├── CharityProjects.tsx
│       │   ├── WalletNetworks.tsx
│       │   ├── DepositRecords.tsx
│       │   ├── TransferRecords.tsx
│       │   └── ...
│       └── services/          # API 客户端
│
├── web-app/                   # 网页端登录后应用 (React + Vite)
│   └── src/
│
├── bot/                       # Telegram Bot (Telegraf + TypeScript)
│   └── src/
│       ├── handlers/          # 命令和消息处理
│       │   ├── start.ts
│       │   ├── wallet.ts
│       │   ├── invite.ts
│       │   └── ...
│       ├── keyboards/         # 键盘布局
│       ├── i18n/              # 多语言支持
│       └── services/          # API 客户端
│
└── docker-compose.yml         # Docker 配置
```

## 📊 数据库表

平台使用 23 张数据表，主要包括：

### 核心表
- `users` - 用户账户（包含钱包和奖励余额）
- `transactions` - 交易流水
- `invitations` - 邀请关系和奖励记录

### NFT 相关
- `nft_categories` - NFT 分类
- `nft_products` - NFT 产品
- `nft_holdings` - NFT 持仓
- `nft_yield_logs` - 收益日志

### 竞拍相关
- `auctions` - 竞拍活动
- `auction_entries` - 竞拍参与记录

### 交易相关
- `trading_pairs` - 交易对
- `price_points` - 价格数据点
- `price_presets` - 价格走势预设
- `trading_sessions` - 交易会话
- `trading_orders` - 交易订单
- `trading_history` - 交易历史

### 公益相关
- `charity_projects` - 公益项目
- `charity_donations` - 捐赠记录

### 钱包相关
- `wallet_networks` - 充值网络
- `wallet_addresses` - 用户充值地址
- `wallet_deposits` - 充值记录
- `wallet_withdrawals` - 提现记录
- `wallet_transfers` - 转账记录

### 其他
- `red_packets` - 红包
- `red_packet_claims` - 红包领取记录
- `platform_config` - 平台配置

## 🌐 API 文档

### NFT API
- `GET /api/nft/categories` - 获取分类列表
- `POST /api/nft/categories` - 创建分类 (管理员)
- `GET /api/nft/products` - 获取产品列表
- `POST /api/nft/products` - 创建产品 (管理员)
- `POST /api/nft/purchase` - 购买 NFT
- `GET /api/nft/my-holdings` - 我的持仓

### 竞拍 API
- `GET /api/auctions` - 获取竞拍列表
- `POST /api/auctions` - 创建竞拍 (管理员)
- `POST /api/auctions/:id/enter` - 参与竞拍
- `POST /api/auctions/:id/draw` - 开奖 (管理员)

### 交易 API
- `GET /api/trading/pairs` - 获取交易对
- `GET /api/trading/sessions` - 获取交易会话
- `POST /api/trading/sessions/:id/order` - 下单
- `GET /api/trading/my-orders` - 我的订单
- `GET /api/admin/trading/pairs` - 管理交易对
- `POST /api/admin/trading/pairs/:id/price-points` - 添加价格点
- `POST /api/admin/trading/pairs/:id/presets` - 创建预设走势

### 公益 API
- `GET /api/charity/projects` - 获取项目列表
- `POST /api/charity/projects` - 创建项目 (管理员)
- `POST /api/charity/donate` - 捐赠

### 钱包 API
- `GET /api/wallet/balance` - 查询余额
- `POST /api/wallet/transfer` - 转账
- `POST /api/wallet/withdraw` - 申请提现
- `GET /api/wallet/deposit-address` - 获取充值地址
- `GET /api/admin/wallet/networks` - 管理充值网络
- `GET /api/admin/wallet/deposits` - 充值记录
- `GET /api/admin/wallet/withdrawals` - 提现记录
- `PUT /api/admin/wallet/withdrawals/:id/review` - 审核提现

## 💼 业务规则

### 转账规则
- 手续费: 2% (最低 0.01 USDT)
- 最低转账金额: 1 USDT
- 实时到账，扣除手续费后的金额进入接收方账户

### 提现规则
- 需要完成交易解锁奖励余额
- 解锁条件: 交易金额 ≥ reward_balance
- 管理员审核通过后处理

### 充值规则
- 支持多链（TRC20, ERC20, BEP20 等）
- 每个用户每个网络有独立的充值地址
- 后台自动检测充值，30 秒一次
- 最低充值金额由管理员设置

### 邀请奖励规则
- 关注奖励: 被邀请人首次领取红包时，邀请人获得 5 USDT
- 交易奖励: 被邀请人首次交易（购买 NFT 或即时交易）时：
  - L1 邀请人: 5 USDT
  - L2 邀请人: 5 USDT
- 奖励进入 `reward_balance`，需完成交易解锁后才能提现

## 🔐 安全

- **JWT 认证**: 管理员 API 使用 JWT 令牌
- **Bot 认证**: Bot API 使用 Bot Token 认证
- **AES-256 加密**: HD 钱包助记词使用 AES-256 加密存储
- **bcrypt 密码**: 管理员密码使用 bcrypt 哈希
- **参数化查询**: 所有数据库查询使用参数化，防止 SQL 注入
- **审核机制**: 提现需管理员审核，防止欺诈

## 🐛 故障排查

### Bot 无响应
- 检查 BOT_TOKEN 是否正确
- 验证 bot 已启动: `docker-compose ps`
- 查看日志: `docker-compose logs bot`

### 数据库连接错误
- 确保 PostgreSQL 正在运行
- 检查 DATABASE_URL 是否正确
- 验证数据库已初始化

### 充值检测不工作
- 检查 WALLET_ENCRYPTION_KEY 是否设置
- 验证区块链 API 密钥是否正确
- 查看 deposit-checker 日志

### Redis 连接错误
- 确保 Redis 正在运行
- 检查 REDIS_URL 是否正确

## 📝 License

MIT License - 详见 LICENSE 文件

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

---

*从 telegram-growth-platform 优化升级为 NFT 数字藏品互动平台*