# 管理后台快速开始指南

## 📦 安装和运行

### 1. 安装依赖

```bash
cd admin-panel
npm install
```

### 2. 配置环境变量

复制环境变量模板文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置后端 API 地址：

```env
VITE_API_URL=http://localhost:3000/api
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 4. 构建生产版本

```bash
npm run build
```

构建完成后，可以使用任何静态文件服务器部署 `dist` 目录。

## 🔐 登录

使用后端配置的管理员账号登录。默认账号需要在后端数据库中创建。

### 登录页面功能
- ✅ 用户名输入
- ✅ 密码输入（支持显示/隐藏切换）
- ✅ 错误提示（连接失败、密码错误等）
- ✅ 紫色渐变背景主题

## 🎨 界面预览

### 主要页面

1. **仪表盘** (`/dashboard`)
   - 用户统计卡片
   - 财务统计
   - 红包统计
   - 快捷操作入口

2. **用户管理** (`/users`)
   - 用户列表（分页）
   - 搜索功能
   - 查看用户详情
   - 编辑用户信息

3. **Bot 管理** (`/bots`)
   - Bot 列表
   - 添加新 Bot
   - 编辑/删除 Bot
   - Webhook 配置

4. **绑定审核** (`/bindings`)
   - 待审核列表
   - 查看绑定截图
   - 批准/拒绝申请
   - 添加审核备注

5. **红包管理** (`/red-packets`)
   - 创建红包
   - 红包列表
   - 查看领取记录
   - 红包状态管理

6. **广播通知** (`/broadcasts`)
   - 创建广播
   - 选择目标用户
   - 发送广播
   - 查看发送历史

7. **截图审核** (`/screenshots`)
   - 待审核截图列表
   - 查看大图
   - 批准/拒绝（通过后增加积分）
   - 审核记录

8. **交易所管理** (`/exchanges`)
   - 交易所列表
   - 添加/编辑交易所
   - 多语言教程内容
   - 排序设置

9. **提现管理** (`/withdrawals`)
   - 待处理提现列表
   - 审核提现申请
   - 查看提现历史

10. **系统设置** (`/settings`)
    - 平台配置
    - 奖励金额设置
    - 红包规则设置
    - 频道/群组配置

## 🛠️ 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Tailwind CSS** - 原子化 CSS 框架
- **React Router v6** - 路由管理
- **Axios** - HTTP 客户端
- **Lucide React** - 现代图标库

## 📋 主要功能特性

### 认证与安全
- JWT Token 认证
- 自动 Token 过期处理
- 受保护的路由
- 安全的退出登录

### 用户界面
- 响应式设计（支持移动端）
- 紫色渐变主题
- 直观的侧边栏导航
- 清晰的面包屑导航

### 数据管理
- 分页支持
- 搜索和筛选
- 数据表格展示
- CRUD 操作

### 审核流程
- 绑定审核
- 截图审核
- 提现审核
- 审核备注功能

### 多语言支持
- 中文界面
- 支持多语言内容编辑（交易所教程）

## 🔧 开发建议

### 代码结构
```
src/
├── components/      # 可复用组件
│   ├── Layout/     # 布局组件
│   ├── Common/     # 通用组件
│   └── Forms/      # 表单组件
├── pages/          # 页面组件
├── services/       # API 服务
├── hooks/          # 自定义 Hooks
├── context/        # React Context
└── styles/         # 样式文件
```

### API 集成
所有 API 调用通过 `services/api.ts` 统一管理，支持：
- 自动添加 JWT Token
- 统一错误处理
- Token 过期自动跳转

### 添加新页面
1. 在 `src/pages/` 创建新组件
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/Layout/Sidebar.tsx` 添加菜单项

## 🐛 常见问题

### 1. 连接服务器失败
- 检查后端服务是否运行
- 确认 `.env` 中的 API 地址正确
- 检查 CORS 配置

### 2. 图片无法加载
- 确认 Telegram Bot Token 正确
- 检查文件 ID 是否有效
- 验证网络连接

### 3. 构建失败
- 清除 node_modules 重新安装
- 检查 Node.js 版本（建议 18+）
- 查看错误日志

## 📝 部署

### 使用 Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /path/to/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 使用 Docker
```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 📞 支持

如有问题，请查看：
- 后端 API 文档：`API.md`
- 项目根目录 README
- GitHub Issues

---

祝使用愉快！ 🎉
