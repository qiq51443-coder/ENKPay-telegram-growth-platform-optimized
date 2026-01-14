# Bot Authorization Guide

## 概述

本指南将帮助您完成 Telegram Bot 的授权和配置流程，使其能够与后端系统正常交互。

## 准备工作

在开始之前，您需要：

1. ✅ 一个 Telegram 账号
2. ✅ 访问管理面板的权限
3. ✅ 基本的命令行操作知识

## 第一步：创建 Telegram Bot

### 1.1 通过 @BotFather 创建 Bot

1. 在 Telegram 中搜索并打开 [@BotFather](https://t.me/botfather)
2. 发送 `/newbot` 命令
3. 按照提示输入 Bot 名称（例如：`My Growth Bot`）
4. 输入 Bot 用户名（必须以 `bot` 结尾，例如：`my_growth_bot`）
5. 创建成功后，BotFather 会返回您的 **Bot Token**

```
例如: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

⚠️ **重要：请妥善保管您的 Bot Token，不要泄露给他人！**

### 1.2 配置 Bot 设置（可选）

您可以通过 @BotFather 设置以下内容：

- `/setdescription` - 设置 Bot 描述
- `/setabouttext` - 设置"关于"文本
- `/setuserpic` - 设置 Bot 头像
- `/setcommands` - 设置命令列表

## 第二步：在管理面板授权 Bot

### 2.1 登录管理面板

1. 访问管理面板（默认：`http://localhost:5173`）
2. 使用管理员账号登录
   - 默认用户名：`admin`
   - 默认密码：`admin123`（⚠️ 首次登录后请立即修改）

### 2.2 授权新 Bot

1. 在左侧菜单中点击 **"Bot 管理"**
2. 点击右上角的 **"创建 Bot"** 按钮
3. 填写 Bot 信息：
   - **名称**：为 Bot 起一个易识别的名称（例如：`Production Bot`）
   - **Token**：粘贴从 @BotFather 获取的 Bot Token

4. 点击 **"确定"** 提交

### 2.3 获取 Bot ID

授权成功后，您将看到：

- ✅ Bot 列表中显示新添加的 Bot
- ✅ Bot ID（UUID 格式，类似：`550e8400-e29b-41d4-a716-446655440000`）
- ✅ Webhook URL（已自动配置）
- ✅ Bot 状态为"激活"

**复制并保存 Bot ID**，您将在下一步中使用它。

## 第三步：配置 Bot 环境变量

### 3.1 创建环境变量文件

在项目根目录创建 `.env` 文件（如果尚不存在）：

```bash
cp .env.example .env
```

### 3.2 配置必要的环境变量

编辑 `.env` 文件，填入以下信息：

```env
# Bot Configuration
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz  # 从 @BotFather 获取
BOT_ID=550e8400-e29b-41d4-a716-446655440000        # 从管理面板获取

# Backend Configuration
BACKEND_URL=http://localhost:3000

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/telegram_growth

# JWT Secret
JWT_SECRET=your-secret-key-here

# Telegram Groups/Channels (可选)
REQUIRED_CHANNEL_ID=@yourchannel
REQUIRED_GROUP_ID=-1001234567890
SCREENSHOT_GROUP_ID=-1001234567890
```

### 3.3 配置说明

| 变量 | 说明 | 必需 |
|------|------|------|
| `BOT_TOKEN` | Telegram Bot Token | ✅ 是 |
| `BOT_ID` | 管理面板生成的 Bot ID | ✅ 是 |
| `BACKEND_URL` | 后端 API 地址 | ✅ 是 |
| `DATABASE_URL` | PostgreSQL 数据库连接字符串 | ✅ 是 |
| `JWT_SECRET` | JWT 签名密钥 | ✅ 是 |
| `REQUIRED_CHANNEL_ID` | 必须关注的频道 ID | ❌ 否 |
| `REQUIRED_GROUP_ID` | 必须加入的群组 ID | ❌ 否 |

## 第四步：启动 Bot

### 4.1 安装依赖

```bash
cd bot
npm install
```

### 4.2 启动开发模式

```bash
npm run dev
```

### 4.3 启动生产模式

```bash
npm run build
npm start
```

### 4.4 使用 Docker

```bash
docker-compose up -d bot
```

## 第五步：测试 Bot

### 5.1 在 Telegram 中打开 Bot

在 Telegram 中搜索您的 Bot 用户名（例如：`@my_growth_bot`）

### 5.2 发送 `/start` 命令

Bot 应该回复欢迎消息并显示主菜单。

### 5.3 验证功能

测试以下功能是否正常：

- ✅ `/start` - 显示欢迎消息
- ✅ `/balance` - 查询余额
- ✅ `/invite` - 获取邀请链接
- ✅ `/help` - 查看帮助信息

## 常见问题

### Q1: Bot 没有响应？

**可能原因：**

1. Bot Token 错误
2. Bot ID 配置错误
3. 后端服务未启动
4. Webhook 配置失败

**解决方法：**

```bash
# 检查后端日志
docker-compose logs backend

# 检查 Bot 日志
docker-compose logs bot

# 重启服务
docker-compose restart bot
```

### Q2: Bot 返回 "Bot token required" 错误？

**原因：** Bot ID 未正确配置或未传递给后端

**解决方法：**

1. 确认 `.env` 文件中 `BOT_ID` 已正确设置
2. 确认 `bot/src/services/api.ts` 中读取了 `BOT_ID` 环境变量
3. 重启 Bot 服务

### Q3: 如何获取频道或群组 ID？

**方法 1：使用 @userinfobot**

1. 将 @userinfobot 添加到频道/群组
2. 转发一条消息给 @userinfobot
3. Bot 会显示频道/群组 ID

**方法 2：通过 Bot API**

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

### Q4: Webhook 设置失败？

**原因：** `BACKEND_URL` 未配置或无法访问

**解决方法：**

1. 确保 `BACKEND_URL` 配置为可从互联网访问的 HTTPS 地址
2. 本地开发可以使用 ngrok 等工具创建隧道
3. 如果不使用 Webhook，可以使用轮询模式（需修改代码）

### Q5: 管理面板显示 "获取 Bot 列表失败"？

**原因：** 后端 API 路由问题或权限不足

**解决方法：**

1. 检查后端是否正常运行
2. 确认管理员权限
3. 查看浏览器控制台错误
4. 检查后端日志

## 高级配置

### 多 Bot 部署

系统支持同时运行多个 Bot：

1. 在管理面板中授权多个 Bot
2. 为每个 Bot 创建单独的配置文件
3. 启动多个 Bot 实例，每个使用不同的 `BOT_ID`

### Bot 状态管理

在管理面板中，您可以：

- **启用/停用 Bot**：控制 Bot 是否接受请求
- **查看 Bot 信息**：Token、Webhook URL、创建时间等
- **删除 Bot**：移除 Bot（会同时删除 Webhook）

### Webhook vs 轮询

**Webhook（推荐）：**
- ✅ 实时响应
- ✅ 服务器资源占用少
- ❌ 需要 HTTPS 域名

**轮询（开发环境）：**
- ✅ 无需公网 IP
- ✅ 配置简单
- ❌ 有延迟
- ❌ 消耗更多资源

## 安全建议

1. 🔒 **保护 Bot Token**：
   - 不要提交到 Git 仓库
   - 不要在日志中输出
   - 定期更换（通过 @BotFather）

2. 🔒 **保护 Bot ID**：
   - 仅授权的应用可以访问
   - 不要在客户端代码中暴露

3. 🔒 **使用 HTTPS**：
   - 生产环境必须使用 HTTPS
   - 配置 SSL 证书

4. 🔒 **限制访问**：
   - 使用防火墙规则
   - 配置 API 速率限制
   - 启用 IP 白名单（可选）

5. 🔒 **监控日志**：
   - 定期检查异常活动
   - 启用审计日志
   - 设置告警

## 支持

如遇到问题，请：

1. 查看 [API 文档](./API.md)
2. 检查 [部署文档](./DEPLOYMENT.md)
3. 查看项目 Issues
4. 联系技术支持

## 更新日志

- **2026-01-14**：初始版本，包含完整的 Bot 授权流程
