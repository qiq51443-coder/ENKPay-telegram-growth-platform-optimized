# Admin Panel

管理后台前端界面 - React + TypeScript + Vite + Tailwind CSS

## 功能特性

### 🔐 认证
- 登录页面（带密码可见/不可见切换）
- JWT Token 认证
- 自动 Token 过期处理

### 📊 仪表盘
- 用户统计（总数、今日新增、活跃用户）
- 财务统计（总余额、总提现、待审核）
- 红包统计（已发送、已领取、剩余）
- 快捷操作入口

### 👥 用户管理
- 用户列表（分页、搜索、筛选）
- 用户详情（Bot ID、余额、红包积分、绑定状态）
- 用户编辑（余额调整、状态修改）
- 交易记录查看

### 🤖 Bot 管理
- Bot 列表
- 添加/编辑/删除 Bot
- Bot 状态管理
- Webhook 配置

### ✅ 绑定审核
- 待审核列表
- 查看绑定截图
- 审核通过/拒绝
- 审核记录

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

### 📸 收益截图审核
- 待审核截图列表
- 查看大图
- 审核通过/拒绝（通过后增加红包积分）
- 审核记录

### 🏢 交易所管理
- 交易所列表
- 添加/编辑交易所
- 教程内容管理（多语言）
- 排序和启用/禁用

### 💰 提现管理
- 待处理提现
- 审核通过/拒绝
- 提现历史

### ⚙️ 系统设置
- 平台链接配置
- 奖励金额设置
- 频道/群组配置
- 红包规则设置

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **React Router** - 路由管理
- **Axios** - HTTP 客户端
- **Lucide React** - 图标库

## 快速开始

### 安装依赖

```bash
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
│   ├── components/      # 组件
│   │   ├── Layout/      # 布局组件
│   │   ├── Common/      # 通用组件
│   │   └── Forms/       # 表单组件
│   ├── pages/           # 页面组件
│   ├── services/        # API 服务
│   ├── hooks/           # 自定义 Hooks
│   ├── context/         # Context
│   ├── styles/          # 样式文件
│   ├── App.tsx          # 主应用组件
│   └── index.tsx        # 入口文件
├── index.html           # HTML 模板
├── package.json         # 依赖配置
├── tsconfig.json        # TypeScript 配置
├── vite.config.ts       # Vite 配置
└── tailwind.config.js   # Tailwind 配置
```

## 默认登录

使用后端配置的管理员账号登录。

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

## 样式主题

使用紫色渐变主题，与登录页面保持一致：

```css
.gradient-purple {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

## License

MIT
