import express from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db';
import { authenticateWebUser, WebAuthRequest } from '../middleware/web-auth';
import { walletLimiter } from '../middleware/rateLimiter';
import { validateWithdrawal } from '../services/balance.service';
import { generateUserDepositAddress } from '../services/deposit.service';
import { generateOrderId } from '../utils/orderId';

const router = express.Router();

const WITHDRAW_PASSWORD_MAX_ATTEMPTS = 5;
const WITHDRAW_PASSWORD_LOCK_MINUTES = 15;

router.use(walletLimiter);
router.use(authenticateWebUser);

async function resolveNetworkId(networkId: string | number): Promise<number | null> {
  if (!isNaN(Number(networkId))) {
    return parseInt(String(networkId), 10);
  }
  const result = await query(
    `SELECT id
       FROM deposit_networks
      WHERE (chain_name = $1 OR network_name = $1) AND is_active = true
      LIMIT 1`,
    [networkId]
  );
  return result.rows[0]?.id ?? null;
}

async function verifyWithdrawPassword(userId: string, password: string) {
  const result = await query(
    `SELECT withdraw_password, withdraw_password_attempts, withdraw_password_locked_until
       FROM users
      WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { valid: false, status: 404, error: '用户不存在' };
  }

  const row = result.rows[0];
  if (!row.withdraw_password) {
    return { valid: false, status: 400, error: '请先在用户中心设置提现密码' };
  }

  if (row.withdraw_password_locked_until && new Date(row.withdraw_password_locked_until).getTime() > Date.now()) {
    const remaining = Math.ceil((new Date(row.withdraw_password_locked_until).getTime() - Date.now()) / 60000);
    return {
      valid: false,
      status: 429,
      error: `提现密码已锁定，请 ${remaining} 分钟后重试`,
    };
  }

  const valid = await bcrypt.compare(password, row.withdraw_password);
  if (!valid) {
    const attempts = Number(row.withdraw_password_attempts || 0) + 1;
    if (attempts >= WITHDRAW_PASSWORD_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + WITHDRAW_PASSWORD_LOCK_MINUTES * 60 * 1000);
      await query(
        `UPDATE users
            SET withdraw_password_attempts = $1,
                withdraw_password_locked_until = $2
          WHERE id = $3`,
        [attempts, lockedUntil, userId]
      );
    } else {
      await query(
        `UPDATE users
            SET withdraw_password_attempts = $1
          WHERE id = $2`,
        [attempts, userId]
      );
    }
    return { valid: false, status: 401, error: '提现密码错误' };
  }

  await query(
    `UPDATE users
        SET withdraw_password_attempts = 0,
            withdraw_password_locked_until = NULL
      WHERE id = $1`,
    [userId]
  );

  return { valid: true, status: 200 };
}

router.get('/networks', async (_req: WebAuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, network_name, network_display, chain_name, currency, min_deposit_amount, explorer_url
         FROM deposit_networks
        WHERE is_active = true
        ORDER BY sort_order, network_name`
    );

    return res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Web wallet networks error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/deposit-address', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const networkId = req.query.network_id;
    if (!userId || !networkId) {
      return res.status(400).json({ error: '请选择充值网络' });
    }

    const numericNetworkId = await resolveNetworkId(String(networkId));
    if (numericNetworkId === null) {
      return res.status(404).json({ error: '充值网络不存在' });
    }

    const [address, networkResult] = await Promise.all([
      generateUserDepositAddress(userId, numericNetworkId),
      query(
        `SELECT id, network_name, network_display, chain_name, currency, min_deposit_amount
           FROM deposit_networks
          WHERE id = $1
          LIMIT 1`,
        [numericNetworkId]
      ),
    ]);

    return res.json({
      success: true,
      data: {
        address,
        network: networkResult.rows[0] || null,
        qr_text: address,
      },
    });
  } catch (error: any) {
    console.error('Web deposit address error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/withdraw', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    let { network_id, amount, to_address, withdraw_password } = req.body;

    if (!userId || !network_id || !amount || !to_address || !withdraw_password) {
      return res.status(400).json({ error: '请完整填写提现信息' });
    }

    const passwordCheck = await verifyWithdrawPassword(userId, String(withdraw_password));
    if (!passwordCheck.valid) {
      return res.status(passwordCheck.status).json({ error: passwordCheck.error });
    }

    const numericNetworkId = await resolveNetworkId(network_id);
    if (numericNetworkId === null) {
      return res.status(404).json({ error: '提现网络不存在' });
    }
    network_id = numericNetworkId;

    const withdrawAmount = parseFloat(String(amount));
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ error: '请输入有效提现金额' });
    }

    const frozenCheckResult = await query(`SELECT is_frozen FROM users WHERE id = $1`, [userId]);
    if (frozenCheckResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (frozenCheckResult.rows[0].is_frozen) {
      return res.status(400).json({ error: '账户已冻结，暂不能提现' });
    }

    const validation = await validateWithdrawal(userId, withdrawAmount);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const configResult = await query(`SELECT value FROM platform_config WHERE key = 'withdraw_fee_rate'`);
    const feeRate = configResult.rows.length > 0 ? parseFloat(configResult.rows[0].value) : 0.02;
    const fee = withdrawAmount * feeRate;
    const actualAmount = withdrawAmount - fee;
    const withdrawOrderId = await generateOrderId('withdrawal_records');

    const result = await transaction(async (client) => {
      const userRow = await client.query(
        `SELECT wallet_balance, frozen_balance
           FROM users
          WHERE id = $1
          FOR UPDATE`,
        [userId]
      );

      if (userRow.rows.length === 0) throw new Error('用户不存在');
      const availableBalance = parseFloat(userRow.rows[0].wallet_balance) || 0;
      if (availableBalance < withdrawAmount) {
        throw new Error(`余额不足，当前可用余额 ${availableBalance.toFixed(2)} USDT`);
      }

      const deductResult = await client.query(
        `UPDATE users
            SET wallet_balance = wallet_balance - $1,
                frozen_balance = frozen_balance + $1
          WHERE id = $2 AND wallet_balance >= $1`,
        [withdrawAmount, userId]
      );

      if (deductResult.rowCount === 0) {
        throw new Error('余额不足');
      }

      const insertResult = await client.query(
        `INSERT INTO withdrawal_records
           (order_id, user_id, network_id, amount, fee, actual_amount, to_address, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING order_id`,
        [withdrawOrderId, userId, network_id, withdrawAmount, fee, actualAmount, to_address]
      );

      return insertResult.rows[0];
    });

    return res.json({
      success: true,
      message: '提现申请已提交，等待审核',
      data: {
        order_id: result.order_id,
        amount: withdrawAmount,
        fee,
        actual_amount: actualAmount,
        status: 'pending',
      },
    });
  } catch (error: any) {
    console.error('Web withdraw error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/transactions', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const { page = 1, limit = 20, type = 'all' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const transactions: any[] = [];

    if (type === 'all' || type === 'deposit') {
      const deposits = await query(
        `SELECT
           'deposit' AS type,
           dr.id,
           dr.order_id,
           dr.amount,
           dr.status,
           dr.created_at,
           dr.tx_hash,
           dn.network_display,
           dn.chain_name
         FROM deposit_records dr
         LEFT JOIN deposit_networks dn ON dn.id = dr.network_id
         WHERE dr.user_id = $1
         ORDER BY dr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, Number(limit), offset]
      );
      transactions.push(...deposits.rows);
    }

    if (type === 'all' || type === 'withdrawal') {
      const withdrawals = await query(
        `SELECT
           'withdrawal' AS type,
           wr.id,
           wr.order_id,
           wr.amount,
           wr.status,
           wr.created_at,
           wr.to_address,
           dn.network_display,
           dn.chain_name
         FROM withdrawal_records wr
         LEFT JOIN deposit_networks dn ON dn.id = wr.network_id
         WHERE wr.user_id = $1
         ORDER BY wr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, Number(limit), offset]
      );
      transactions.push(...withdrawals.rows);
    }

    transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({
      success: true,
      data: transactions.slice(0, Number(limit)),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: transactions.length,
      },
    });
  } catch (error: any) {
    console.error('Web wallet transactions error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/has-withdraw-password', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const result = await query(`SELECT withdraw_password FROM users WHERE id = $1`, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    return res.json({ success: true, has_password: Boolean(result.rows[0].withdraw_password) });
  } catch (error: any) {
    console.error('Web has withdraw password error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/withdraw-password', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const password = String(req.body?.password || '');
    if (!userId || !/^\d{6,}$/.test(password)) {
      return res.status(400).json({ error: '提现密码至少需要 6 位数字' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      `UPDATE users
          SET withdraw_password = $1,
              withdraw_password_attempts = 0,
              withdraw_password_locked_until = NULL
        WHERE id = $2
        RETURNING id`,
      [hashedPassword, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    return res.json({ success: true, message: '提现密码设置成功' });
  } catch (error: any) {
    console.error('Web set withdraw password error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/verify-withdraw-password', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const password = String(req.body?.password || '');
    if (!userId || !password) {
      return res.status(400).json({ error: '请输入提现密码' });
    }

    const result = await verifyWithdrawPassword(userId, password);
    if (!result.valid) {
      return res.status(result.status).json({ valid: false, error: result.error });
    }

    return res.json({ valid: true });
  } catch (error: any) {
    console.error('Web verify withdraw password error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
