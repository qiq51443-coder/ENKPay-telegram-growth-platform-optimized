# Admin Panel - NFT 数字藏品管理后台

管理后台前端界面 - React + TypeScript + Vite + Ant Design

## 功能特性

### 🔐 认证
- 登录页面
- JWT Token 认证
- 自动 Token 过期处理

### 📊 仪表盘
- 用户统计（总数、今日新增、活跃用户）
- 财务统计（总余额、总提现、待审核）
- 红包统计（已发送、已领取、剩余）
- 快捷操作入口

### 🎨 NFT 管理
- **NFT 分类**
  - 分类列表（名称、图标、排序、状态）
  - 创建/编辑/删除分类
  - 排序管理
- **NFT 产品**
  - 产品列表（封面、名称、分类、价格、库存、类型、状态）
  - 创建/编辑产品（定期/即时/限量类型）
  - 设置价格、库存、期限、年化收益率
  - 稀有度和属性管理
  - 上架/下架操作

### 🏆 竞拍管理
- 竞拍活动列表（标题、奖品、份额价格、已售/总份额、状态）
- 创建竞拍（多种奖品类型：NFT、USDT、实物、自定义）
- 开奖操作（随机选择中奖者）
- 查看参与记录

### 📈 交易管理
- **交易币种**
  - 真实币种：添加 Binance/CoinGecko 数据源
  - 自定义币种：管理员设置初始价格
  - 交易对列表（符号、名称、类型、当前价格、24h 涨跌）
  - 启用/禁用/编辑/删除
- **自定义走势**
  - 选择自定义交易对
  - 手动添加价格点
  - 创建价格走势预设
  - 激活预设走势，自动控制价格变化

### ❤️ 公益管理
- 公益项目列表（标题、目标金额、已筹金额、进度百分比）
- 创建/编辑项目（标题、描述、封面、目标金额、组织）
- 查看捐赠记录
- 完成/关闭项目

### 💰 钱包管理
- **充值网络**
  - 网络列表（网络名称、链名、主地址、最低金额、手续费）
  - 添加网络（TRC20、ERC20、BEP20 等）
  - 设置 HD 助记词（AES-256 加密存储）
  - 编辑/删除/启用/禁用网络
- **充值记录**
  - 充值列表（用户、网络、金额、交易哈希、状态、时间）
  - 筛选（按状态、用户、网络）
  - 查看详情
- **提现审核**
  - 待处理提现列表
  - 审核通过/拒绝
  - 提现历史
- **转账记录**
  - 转账列表（发送方、接收方、金额、手续费、实际到账）
  - 筛选（按用户、时间范围）

### 👥 用户管理
- 用户列表（分页、搜索、筛选）
- 用户详情（Bot ID、钱包余额、奖励余额、绑定状态）
- 用户编辑（余额调整、状态修改）
- 交易记录查看

### 🤖 Bot 管理
- Bot 列表
- 添加/编辑/删除 Bot
- Bot 状态管理

### 🎁 红包管理
- 创建红包（随机/固定金额）
- 发送到群组
- 红包列表
- 领取记录

### 📢 广播通知
- 创建广播消息
- 选择目标用户（全部/活跃/已绑定）
- 发送广播
- 发送历史

### 👨‍💼 管理员管理
- 管理员账户列表
- 添加/编辑/删除管理员
- 修改密码
- 角色权限管理

### 📋 审计日志
- 操作日志列表
- 筛选（按操作类型、资源类型、时间）
- 查看详情

### ⚙️ 系统设置
- 平台配置
- 奖励金额设置
- 功能开关
- 系统参数

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Ant Design 5** - UI 组件库
- **React Router 6** - 路由管理
- **Axios** - HTTP 客户端
- **dayjs** - 日期处理

## 快速开始

### 安装依赖

```bash
cd admin-panel
npm install
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置 API 地址：

```
VITE_API_URL=http://localhost:3000/api
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

构建输出在 `dist/` 目录。

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
admin-panel/
├── public/              # 静态资源
├── src/
│   ├── pages/           # 页面组件
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Users.tsx
│   │   ├── Bots.tsx
│   │   ├── NFTCategories.tsx
│   │   ├── NFTProducts.tsx
│   │   ├── Auctions.tsx
│   │   ├── TradingPairs.tsx
│   │   ├── CustomPriceControl.tsx
│   │   ├── CharityProjects.tsx
│   │   ├── WalletNetworks.tsx
│   │   ├── DepositRecords.tsx
│   │   ├── TransferRecords.tsx
│   │   ├── Withdrawals.tsx
│   │   ├── RedPackets.tsx
│   │   ├── Broadcasts.tsx
│   │   ├── AdminUserManager.tsx
│   │   ├── AuditLogs.tsx
│   │   └── SystemSettings.tsx
│   ├── services/        # API 服务
│   │   ├── api.ts       # API 客户端
│   │   ├── auth.ts      # 认证服务
│   │   └── types.ts     # TypeScript 类型定义
│   ├── context/         # React Context
│   │   └── AuthContext.tsx
│   ├── hooks/           # 自定义 Hooks
│   ├── App.tsx          # 主应用组件
│   └── index.tsx        # 入口文件
├── index.html           # HTML 模板
├── package.json         # 依赖配置
├── tsconfig.json        # TypeScript 配置
└── vite.config.ts       # Vite 配置
```

## 默认登录

使用后端配置的管理员账号登录：

- Username: `admin`
- Password: `admin123`
- ⚠️ **首次登录后立即修改密码！**

## API 配置

后端 API 通过 Vite 代理配置：

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
```

## UI 设计

- 使用 Ant Design 组件库
- 深色侧边栏配色
- 响应式布局
- 表格分页和筛选
- Modal/Drawer 表单
- Tag 状态标识

## License

MIT
