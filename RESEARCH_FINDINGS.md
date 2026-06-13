# 研究报告：USDT/USDC充值过滤 & 邀请奖励忽略Bug

## 问题一：USDT/USDC充值记录过滤

### Moralis Webhook 入口

- **文件：** `backend/src/routes/webhook-deposit.ts`
- **端点：** `POST /webhook/deposit/moralis`（第51行）

Moralis 推送的 `erc20Transfers` 数组每条记录包含 `tokenAddress`、`tokenSymbol`、`tokenName` 等字段，但**当前代码完全未读取、未校验这些字段**（第107–154行），所有来自任意代币合约的转账均会被处理。

```typescript
// webhook-deposit.ts:73 — 解构 Moralis payload
const { streamId, confirmed, erc20Transfers, block } = req.body;

// webhook-deposit.ts:107 — 遍历 transfers，从不检查 tokenAddress / tokenSymbol
for (const transfer of erc20Transfers) {
  const toAddress: string = transfer.to || '';
  const txHash: string = transfer.transactionHash || '';
  // transfer.tokenAddress 和 transfer.tokenSymbol 从未被读取
  ...
}
```

### 充值记录创建

- **文件：** `backend/src/services/deposit.service.ts`，`processDeposit()` 函数（第407行）

流程：webhook → `processDeposit()` → INSERT `deposit_records` → `creditDeposit()` → UPDATE `users.wallet_balance`

`deposit_records` 表**不存储** `token_symbol` / `token_address` 字段。网络由 `streamId → deposit_networks.moralis_stream_id` 映射确定。

### `deposit_networks` 表的 Token 配置机制

**Schema 文件：**
- `backend/db/migrations/100_nft_platform_schema.sql:368`（基础表结构）
- `backend/db/migrations/700_add_deposit_network_columns.sql:5`（新增 `contract_address`、`decimals`）
- `backend/db/migrations/1031_add_listener_mode_to_deposit_networks.sql`（新增 `moralis_stream_id`、`listener_mode`、`webhook_api_key_encrypted`）

完整字段（累计 migrations 后）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `contract_address` | TEXT | ERC20/TRC20 合约地址（如 USDT 合约） |
| `decimals` | INT DEFAULT 18 | 代币精度 |
| `moralis_stream_id` | VARCHAR(100) | Moralis Stream ID |
| `listener_mode` | VARCHAR(20) | `'polling'` 或 `'stream'` |
| `currency` | VARCHAR(10) DEFAULT 'USDT' | 显示标签，**未做校验用途** |

创建 Moralis Stream 时（`moralis-stream.service.ts:40`），`contract_address` 作为 `contractAddresses: [contractAddress]` 传给 Moralis，由 Moralis 在其端过滤，理论上只推送该合约的转账事件。

**根本问题：** webhook handler 从未校验 `transfer.tokenAddress` 是否与 `deposit_networks.contract_address` 一致，Moralis 端的过滤是唯一防线，后端无二次验证。

### 管理后台展示

- **前端：** `admin-panel/src/pages/DepositRecords.tsx`
- **API：** `GET /api/admin/wallet/deposits`（`backend/src/routes/wallet-admin.ts:441`）
- 金额一律显示为 `USDT`（第97行硬编码），未区分实际代币种类，不支持按代币筛选

### 现有验证逻辑

1. **签名验证：** `verifyMoralisSignature()`（`moralis-stream.service.ts:172`）— SHA3-256(body + secret)
2. **确认数检查：** 仅处理 `confirmed=true` 的交易（`webhook-deposit.ts:76–79`）
3. **Stream→Network 映射：** streamId 必须匹配 `deposit_networks.moralis_stream_id`（`webhook-deposit.ts:87–97`）
4. **地址归属验证：** `toAddress` 必须存在于 `user_deposit_addresses`（`webhook-deposit.ts:125–133`）
5. **幂等性：** 重复的 `tx_hash+network_id` 被跳过（`deposit.service.ts:432–465`）
6. **❌ 缺失：** `transfer.tokenAddress` 从未与 `deposit_networks.contract_address` 比对

### 标准合约地址（需由管理员在后台配置，代码中未硬编码）

| 代币 | 网络 | 合约地址 |
|---|---|---|
| USDT | ERC-20 (ETH) | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| USDT | BEP-20 (BSC) | `0x55d398326f99059fF775485246999027B3197955` |
| USDT | TRC-20 (TRON) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| USDC | ERC-20 (ETH) | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDC | BEP-20 (BSC) | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |

---

## 问题二：邀请奖励忽略/手动下发 Bug

### 自动奖励已禁用

- **文件：** `backend/src/services/invitation-reward.service.ts`（第15行）
- `triggerFirstTradeReward()` 是空函数（no-op），注释说明因充值检测逻辑有已知问题而禁用
- 所有奖励均通过管理后台手动操作

### `invitations` 表 Schema

**基础：** `backend/db/schema.sql:96`

```sql
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reward_amount DECIMAL(10, 2) DEFAULT 0,
  reward_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inviter_id, invitee_id)
);
```

**后续 migrations 新增字段：**
- `backend/db/migrations/963_fix_invitations_columns.sql`：`follow_reward_paid`, `trade_reward_paid`, `trade_reward_paid_l2`, `invitee_first_trade`, `invitee_first_interaction`
- `backend/db/migrations/1106_add_ignore_reward_to_invitations.sql`：`ignore_reward BOOLEAN NOT NULL DEFAULT FALSE`

### API 端点

| 功能 | 端点 | 文件位置 |
|---|---|---|
| 手动下发奖励 | `POST /users/:id/invitees/:inviteeId/grant-reward` | `backend/src/routes/users.ts:497` |
| 忽略奖励 | `POST /users/:id/invitees/:inviteeId/ignore-reward` | `backend/src/routes/users.ts:595` |

前端调用：`admin-panel/src/services/api.ts:733–741`  
前端UI：`admin-panel/src/pages/UserDetail.tsx:367–401`

### 忽略Bug（ignore-reward）根因

**文件：** `backend/src/routes/users.ts:595–607`

```typescript
router.post('/:id/invitees/:inviteeId/ignore-reward', ..., async (req, res) => {
  try {
    const { inviteeId } = req.params;  // ← inviter id (:id) 被忽略
    await query(
      `UPDATE invitations SET ignore_reward = true WHERE invitee_id = $1`,
      [inviteeId]
    );
    res.json({ success: true });  // ← 无论是否更新了行，始终返回成功
  } catch (error) { ... }
});
```

被邀请人列表的查询（`users.ts:434–445`）使用 LEFT JOIN + OR：

```sql
FROM users u
LEFT JOIN invitations inv ON inv.invitee_id = u.id AND inv.inviter_id = $1
WHERE u.invited_by = $1 OR inv.inviter_id = $1
```

若用户仅通过 `users.invited_by` 字段关联（`invitations` 表中无对应行），则：

1. LEFT JOIN 返回 `inv.*` 全为 NULL
2. `COALESCE(inv.ignore_reward, false)` = `false` → 管理员看到操作按钮
3. 点击"忽略"
4. UPDATE 影响 **0 行**（记录不存在）
5. 后端仍返回 `{ success: true }`
6. 前端弹出"已忽略"提示，然后 `fetchInvitees()` 重新拉取
7. 数据不变，按钮依然显示 → 实际上没有忽略任何东西

### 对比：grant-reward 的正确处理方式

`grant-reward`（`users.ts:548–558`）有 upsert 逻辑：

```typescript
if (invResult.rows.length > 0) {
  // 记录存在 → UPDATE
  await client.query(`UPDATE invitations SET reward_paid = true, ... WHERE invitee_id = $2 AND inviter_id = $3`);
} else {
  // 记录不存在 → INSERT
  await client.query(`INSERT INTO invitations (inviter_id, invitee_id, reward_amount, reward_paid) VALUES ($1, $2, $3, true)`);
}
```

`ignore-reward` 缺少这个 INSERT fallback，是根本缺陷。

### 次要Bug

`ignore-reward` 的 UPDATE 仅按 `invitee_id` 过滤，未限制 `inviter_id`，若同一 invitee 在 `invitations` 表中有来自**不同** inviter 的记录，可能错误地忽略另一邀请人的奖励记录。

### 修复方案

在 `ignore-reward` 处理器中，参照 `grant-reward` 增加 upsert 逻辑：

```typescript
const { id: inviterId, inviteeId } = req.params;
const existing = await query(
  `SELECT id FROM invitations WHERE invitee_id = $1 AND inviter_id = $2`,
  [inviteeId, inviterId]
);
if (existing.rows.length > 0) {
  await query(
    `UPDATE invitations SET ignore_reward = true WHERE invitee_id = $1 AND inviter_id = $2`,
    [inviteeId, inviterId]
  );
} else {
  await query(
    `INSERT INTO invitations (inviter_id, invitee_id, ignore_reward) VALUES ($1, $2, true)`,
    [inviterId, inviteeId]
  );
}
```
