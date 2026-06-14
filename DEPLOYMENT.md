# ENKPay Telegram 增长平台 — Render 部署操作手册

> 适用版本：内测 v1.0（1000 用户规模）  
> 部署平台：[Render](https://render.com)  
> 最后更新：2026

---

## 目录

1. [内测前检查清单](#一内测前检查清单)
2. [Render 环境变量说明](#二render-环境变量说明)
3. [首次部署步骤](#三首次部署步骤)
4. [数据库初始化说明](#四数据库初始化说明)
5. [Render 计划升级路径](#五render-计划升级路径)
6. [常见问题排查](#六常见问题排查)
7. [内测反馈收集建议](#七内测反馈收集建议)

---

## 一、内测前检查清单

在触发首次 Render 部署前，请逐项确认：

### 基础配置
- [ ] `render.yaml` 已声明 Redis 服务（`telegram-growth-redis`）
- [ ] Web Service `plan` 已设为 `standard`（2 GB RAM）
- [ ] 数据库 `plan` 已设为 `basic-1gb`（1 GB RAM，100 连接）
- [ ] `healthCheckPath: /health` 已配置
- [ ] `autoDeploy: false` 已设置（内测期间手动控制部署）

### 环境变量
- [ ] `BOT_TOKEN` 已在 Render Dashboard 中手动填写
- [ ] `WEBHOOK_DOMAIN` 已填写（格式：`https://your-service.onrender.com`）
- [ ] `BOT_USERNAME` 已填写（格式：`your_bot_username`，不含 `@`）
- [ ] `WEBAPP_URL` 已填写（Mini App 访问地址）
- [ ] `BACKEND_URL` 已填写
- [ ] `CORS_ORIGIN` 已填写（允许访问的前端域名，多个用英文逗号分隔）
- [ ] `WALLET_ENCRYPTION_KEY` 已由 Render 自动生成（勿手动设置）
- [ ] `JWT_SECRET` 已由 Render 自动生成
- [ ] `WEB_JWT_SECRET` 已填写（建议与 `JWT_SECRET` 分离）
- [ ] `ADMIN_PASSWORD` 已由 Render 自动生成（部署后在 Dashboard 查看）
- [ ] 如未通过后台“系统设置 → 邮件服务”配置 Resend，则 `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_FROM_NAME` 已在 Render 中填写

### 代码检查
- [ ] `backend/src/routes/health.ts` 独立健康检查模块已存在
- [ ] `/health` 端点会检查 DB 和 Redis，DB 失败时返回 `503`
- [ ] 数据库连接池默认 `max=10`（Render 会通过环境变量覆盖为 `20`）
- [ ] 所有 migrations 会在 `preDeployCommand` 和服务启动时自动运行

---

## 二、Render 环境变量说明

以下变量在 `render.yaml` 中已预先声明；带 `sync: false` 的变量**必须**在 Render Dashboard 中手动填写，部署前不可遗漏。

| 变量名 | 填写方式 | 说明 |
|---|---|---|
| `NODE_ENV` | 自动（`production`） | 生产环境标志 |
| `USE_WEBHOOK` | 自动（`true`） | 使用 Telegram Webhook 模式 |
| `DATABASE_URL` | 自动（fromDatabase） | Render 管理 DB 自动注入 |
| `REDIS_URL` | 自动（fromService） | Render 管理 Redis 自动注入 |
| `JWT_SECRET` | 自动生成 | 每次部署保持不变，勿手动修改 |
| `WEB_JWT_SECRET` | **手动填写** | 网页端邮箱用户 JWT，建议独立于后台 JWT |
| `ADMIN_USERNAME` | 自动（`admin`） | 管理后台登录用户名 |
| `ADMIN_PASSWORD` | 自动生成 | 首次部署后在 Dashboard 查看 |
| `BINANCE_API_URL` | 自动 | Binance API 地址 |
| `DB_POOL_MAX` | 自动（`20`） | 数据库最大连接数 |
| `DB_POOL_MIN` | 自动（`5`） | 数据库最小连接数 |
| `WALLET_ENCRYPTION_KEY` | 自动生成 | 钱包加密密钥，**切勿丢失** |
| `BETA_MODE` | 自动（`true`） | 内测模式标志 |
| `MAX_USERS` | 自动（`1000`） | 内测用户上限（供业务逻辑读取） |
| `LOG_LEVEL` | 自动（`debug`） | 内测期间输出详细日志 |
| `BOT_TOKEN` | **手动填写** | 从 @BotFather 获取 |
| `WEBHOOK_DOMAIN` | **手动填写** | 如 `https://xxx.onrender.com` |
| `BOT_USERNAME` | **手动填写** | Bot 用户名（不含 `@`） |
| `WEBAPP_URL` | **手动填写** | Mini App 完整 URL |
| `BACKEND_URL` | **手动填写** | 后端服务完整 URL |
| `CORS_ORIGIN` | **手动填写** | 前端域名，多个用英文逗号分隔 |
| `RESEND_API_KEY` | 选填 / 手动填写 | 后台未配置邮件服务时的 Resend 兜底配置 |
| `EMAIL_FROM` | 选填 / 手动填写 | 后台未配置时的默认发件邮箱 |
| `EMAIL_FROM_NAME` | 选填 / 手动填写 | 后台未配置时的默认发件名称 |

---

## 三、首次部署步骤

### 1. 连接 GitHub 仓库

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. 点击 **New → Blueprint**
3. 选择此仓库，Render 会自动读取 `render.yaml`

### 2. 填写手动环境变量

在 Render Dashboard → Web Service → **Environment** 中，填写所有标注为"手动填写"的变量（见上表）。

### 3. 触发首次部署

由于 `autoDeploy: false`，在 Dashboard 中手动点击 **Deploy latest commit** 触发首次部署。

### 4. 等待构建完成

构建日志会依次显示：
```
Building mini-app...
Building admin-panel...
Building web-app...
Building backend...
Running preDeployCommand (DB migrations)...
Starting server...
✓ Database connection established
✓ Redis connected
✓ Backend server running on port ...
```

### 5. 验证健康检查

```bash
curl https://your-service.onrender.com/health
```

期望返回：
```json
{
  "status": "ok",
  "timestamp": "2026-03-24T10:30:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "version": "1.0.0",
  "uptime": 12
}
```

### 6. 注册 Bot Webhook

部署成功后，Render 会通过 `/health` 确认服务就绪，Bot Manager 会在启动时自动注册 Webhook。如需手动验证：

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

确认 `url` 字段已指向你的 Render 服务地址。

---

## 四、数据库初始化说明

### 自动运行（推荐）

Render 的 `preDeployCommand` 会在每次部署时自动执行所有待运行的 migrations：

```yaml
preDeployCommand: cd backend && node -e "require('./dist/db/migrate').runMigrations()..."
```

服务启动时，`startServer()` 也会再次调用 `runMigrations()`，确保双重保障。

### 手动验证 Migrations 状态

如果怀疑 migrations 未正确运行，可在 Render Dashboard → PostgreSQL → **Connect** 中使用 `psql` 检查：

```sql
-- 查看已运行的 migrations
SELECT * FROM migrations ORDER BY applied_at;

-- 确认关键表存在
\dt
```

---

## 五、Render 计划升级路径

随着用户量增长，按以下路径升级 Render 计划：

| 阶段 | 用户量 | Web Service | PostgreSQL | Redis | 估算月费 |
|---|---|---|---|---|---|
| **内测** | ~1,000 | Standard（2 GB） | Basic-1gb | Starter | ~$54/月 |
| **成长期** | ~5,000 | Pro（4 GB） | Pro-4gb | Standard | ~$190/月 |
| **扩张期** | ~10,000 | Pro Plus（8 GB）或 2 × Standard | Pro-8gb | Standard | ~$400/月 |
| **大规模** | 10,000+ | 多实例 + 微服务拆分 | Pro-16gb + 读副本 | 独立集群 | $800+/月 |

### 升级操作步骤

1. 登录 Render Dashboard → 进入对应服务
2. **Settings → Instance Type** → 选择更高规格
3. 同步更新 `render.yaml` 中的 `plan` 字段，保持配置与实际一致
4. 数据库升级前请先创建备份（Dashboard → PostgreSQL → **Backups**）

### 中期扩容建议

- 将高频定时任务（`real-price-snapshot`、`auto-settle`）拆分为独立的 **Render Background Worker**，减轻 Web Service 事件循环压力
- 在 Standard 及以上计划中启用 **Auto-Scaling**（Dashboard → Settings → Scaling），应对突发流量
- 用户量超过 5,000 后考虑将 Bot 模块与 API 分离成独立 Web Service

---

## 六、常见问题排查

### DB 连接失败

**现象**：`/health` 返回 `{"status":"unhealthy","checks":{"database":"error",...}}`，HTTP 503

**排查步骤**：

1. 检查 Render Dashboard → PostgreSQL → **Status** 是否为 `Available`
2. 检查 Web Service 日志：
   ```
   ⚠ DB not ready (attempt 1/10): ...
   ```
3. 确认 `DATABASE_URL` 环境变量已正确注入（应以 `postgres://` 或 `postgresql://` 开头）
4. 若 DB 刚创建，等待约 2 分钟让其完全启动

---

### Redis 不可用

**现象**：`/health` 返回 `{"status":"degraded","checks":{"redis":"unavailable",...}}`，HTTP 200

**说明**：Redis 不可用属于**非致命**状态，服务仍正常运行，但限流器和缓存会退化为内存模式。

**排查步骤**：

1. 检查 Render Dashboard → Redis（`telegram-growth-redis`）→ **Status** 是否为 `Available`
2. 确认 `REDIS_URL` 环境变量已正确注入（应以 `redis://` 或 `rediss://` 开头）
3. 检查 Redis 服务日志，查找连接拒绝等错误

---

### Bot Webhook 未注册

**现象**：Bot 不响应用户消息，Telegram 无法推送更新

**排查步骤**：

1. 确认 `BOT_TOKEN`、`WEBHOOK_DOMAIN` 环境变量均已正确填写
2. 查看服务启动日志，确认以下输出存在：
   ```
   ✓ Webhook registered for bot ...
   ```
3. 手动验证 Webhook 状态：
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
   ```
4. 如果 `url` 为空或指向旧地址，手动重新注册：
   ```bash
   curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-service.onrender.com/webhook/<YOUR_BOT_TOKEN>"}'
   ```

---

### 服务频繁 OOM（内存溢出）重启

**现象**：Render 日志中出现 `Out of memory` 或进程频繁重启

**解决方案**：

1. 确认 Web Service 计划为 `standard`（2 GB），而非 `starter`（512 MB）
2. 检查 `LOG_LEVEL=debug` 是否产生过多日志累积（内测结束后改为 `info`）
3. 若问题持续，升级到 `pro`（4 GB）或将高频 Jobs 拆分为独立 Worker

---

### 管理后台无法登录

**现象**：访问 `/admin` 时用户名密码认证失败

**解决方案**：

1. 在 Render Dashboard → Web Service → **Environment** 中找到 `ADMIN_PASSWORD`（自动生成的值）
2. 使用该密码配合用户名 `admin` 登录

---

## 七、内测反馈收集建议

内测期间建议通过以下方式收集用户反馈：

1. **Telegram 反馈群**：创建专用内测反馈群，引导用户提交 Bug 和建议
2. **Bot 内置反馈命令**：可在 Bot 中添加 `/feedback` 命令，将反馈直接写入数据库或转发到管理群
3. **日志监控**：`LOG_LEVEL=debug` 已开启，通过 Render Dashboard → **Logs** 实时查看异常
4. **健康检查监控**：定期或使用外部服务（如 UptimeRobot）定时访问 `/health`，一旦返回 `503` 即告警
5. **数据库性能**：内测期间定期在 PostgreSQL → **Metrics** 中查看连接数和查询性能，避免连接池耗尽

---

*本文档适用于 Render 付费层 + 内测阶段（1000 用户规模）部署。生产环境正式上线前请根据实际情况调整各项参数。*
