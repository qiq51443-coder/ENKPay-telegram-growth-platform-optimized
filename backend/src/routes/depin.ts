import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { authenticateWebUser, WebAuthRequest } from '../middleware/web-auth';

const router = express.Router();

router.get('/admin/plans', authenticateAdmin, async (_req, res) => {
  try {
    const result = await query(`SELECT * FROM depin_node_plans ORDER BY sort_order ASC, id DESC`);
    res.json({ success: true, items: result.rows });
  } catch (e: any) {
    console.error('[depin] list plans', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/plans', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, price, daily_yield_rate, term_days, sort_order, is_active } = req.body || {};
    if (!name || price == null) return res.status(400).json({ error: 'name and price required' });
    const result = await query(
      `INSERT INTO depin_node_plans (name, description, price, daily_yield_rate, term_days, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,true)) RETURNING *`,
      [String(name).slice(0, 120), description || null, Number(price), Number(daily_yield_rate ?? 0), Number(term_days ?? 30), Number(sort_order ?? 0), is_active]
    );
    res.json({ success: true, item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/admin/plans/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, price, daily_yield_rate, term_days, sort_order, is_active } = req.body || {};
    const result = await query(
      `UPDATE depin_node_plans SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         daily_yield_rate = COALESCE($4, daily_yield_rate),
         term_days = COALESCE($5, term_days),
         sort_order = COALESCE($6, sort_order),
         is_active = COALESCE($7, is_active),
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name ?? null, description ?? null, price != null ? Number(price) : null, daily_yield_rate != null ? Number(daily_yield_rate) : null, term_days != null ? Number(term_days) : null, sort_order != null ? Number(sort_order) : null, typeof is_active === 'boolean' ? is_active : null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, item: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/admin/plans/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    await query(`DELETE FROM depin_node_plans WHERE id = $1`, [parseInt(req.params.id, 10)]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/investments', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { search, mode, limit } = req.query as any;
    const params: any[] = [];
    let sql = `SELECT p.*, u.email AS user_email FROM depin_positions p LEFT JOIN users u ON u.id = p.user_id WHERE 1=1`;
    if (mode) { params.push(mode); sql += ` AND p.mode = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND u.email ILIKE $${params.length}`; }
    params.push(Math.min(parseInt(limit || '50', 10) || 50, 200));
    sql += ` ORDER BY p.id DESC LIMIT $${params.length}`;
    const result = await query(sql, params);
    res.json({ success: true, items: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/web/plans', authenticateWebUser, async (_req, res) => {
  try {
    const result = await query(`SELECT id, name, description, price, daily_yield_rate, term_days FROM depin_node_plans WHERE is_active = true ORDER BY sort_order ASC, id DESC`);
    res.json({ success: true, items: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/web/positions', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    const result = await query(`SELECT * FROM depin_positions WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [req.webUser!.id]);
    res.json({ success: true, items: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/web/buy-node', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser!.id;
    const planId = parseInt(String(req.body?.plan_id), 10);
    if (!planId) return res.status(400).json({ error: 'plan_id required' });
    const item = await transaction(async (client) => {
      const planRes = await client.query(`SELECT * FROM depin_node_plans WHERE id = $1 AND is_active = true FOR UPDATE`, [planId]);
      if (!planRes.rows.length) throw new Error('套餐不存在或已下架');
      const plan = planRes.rows[0];
      const price = parseFloat(plan.price);
      const userRes = await client.query(`SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!userRes.rows.length) throw new Error('用户不存在');
      if (parseFloat(userRes.rows[0].wallet_balance || 0) < price) throw new Error('余额不足');
      await client.query(`UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2 AND wallet_balance >= $1`, [price, userId]);
      const end = new Date();
      end.setDate(end.getDate() + Number(plan.term_days || 30));
      const pos = await client.query(
        `INSERT INTO depin_positions (user_id, mode, plan_id, amount, lock_days, daily_yield_rate, status, end_at, meta)
         VALUES ($1,'node_server',$2,$3,$4,$5,'active',$6,$7) RETURNING *`,
        [userId, planId, price, plan.term_days, plan.daily_yield_rate, end.toISOString(), JSON.stringify({ plan_name: plan.name })]
      );
      return pos.rows[0];
    });
    res.json({ success: true, item });
  } catch (e: any) {
    res.status(400).json({ error: e.message || '购买失败' });
  }
});

router.post('/web/stake', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser!.id;
    const amount = Number(req.body?.amount);
    const lockDays = Number(req.body?.lock_days);
    const allowed = [30, 60, 90, 180];
    if (!amount || amount <= 0) return res.status(400).json({ error: '金额无效' });
    if (!allowed.includes(lockDays)) return res.status(400).json({ error: '锁仓天数须为 30/60/90/180' });
    let minAmount = 50;
    try {
      const s = await query(`SELECT value FROM system_settings WHERE key = 'depin_stake_min' LIMIT 1`);
      if (s.rows[0]?.value) minAmount = Number(s.rows[0].value) || 50;
    } catch {}
    if (amount < minAmount) return res.status(400).json({ error: `最低质押 ${minAmount} USDT` });
    const rateMap: Record<number, number> = { 30: 0.2, 60: 0.3, 90: 0.4, 180: 0.5 };
    const dailyRate = rateMap[lockDays] || 0.2;
    const item = await transaction(async (client) => {
      const userRes = await client.query(`SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!userRes.rows.length) throw new Error('用户不存在');
      if (parseFloat(userRes.rows[0].wallet_balance || 0) < amount) throw new Error('余额不足');
      await client.query(`UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2 AND wallet_balance >= $1`, [amount, userId]);
      const end = new Date();
      end.setDate(end.getDate() + lockDays);
      const pos = await client.query(
        `INSERT INTO depin_positions (user_id, mode, amount, lock_days, daily_yield_rate, status, end_at, meta)
         VALUES ($1,'asset_stake',$2,$3,$4,'active',$5,$6) RETURNING *`,
        [userId, amount, lockDays, dailyRate, end.toISOString(), JSON.stringify({ principal_locked: true })]
      );
      return pos.rows[0];
    });
    res.json({ success: true, item });
  } catch (e: any) {
    res.status(400).json({ error: e.message || '质押失败' });
  }
});

router.post('/web/swap', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser!.id;
    const fromAmount = Number(req.body?.from_amount);
    const toAsset = String(req.body?.to_asset || 'ENK-GPU').slice(0, 32);
    if (!fromAmount || fromAmount <= 0) return res.status(400).json({ error: '金额无效' });
    let rate = 1;
    try {
      const s = await query(`SELECT value FROM system_settings WHERE key = 'depin_swap_rate' LIMIT 1`);
      if (s.rows[0]?.value) rate = Number(s.rows[0].value) || 1;
    } catch {}
    const toAmount = fromAmount * rate;
    const order = await transaction(async (client) => {
      const userRes = await client.query(`SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!userRes.rows.length) throw new Error('用户不存在');
      if (parseFloat(userRes.rows[0].wallet_balance || 0) < fromAmount) throw new Error('余额不足');
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance - $1, reward_balance = COALESCE(reward_balance,0) + $2, updated_at = NOW() WHERE id = $3 AND wallet_balance >= $1`,
        [fromAmount, toAmount, userId]
      );
      const ins = await client.query(
        `INSERT INTO depin_swap_orders (user_id, from_asset, to_asset, from_amount, to_amount, rate, status) VALUES ($1,'USDT',$2,$3,$4,$5,'done') RETURNING *`,
        [userId, toAsset, fromAmount, toAmount, rate]
      );
      return ins.rows[0];
    });
    res.json({ success: true, item: order });
  } catch (e: any) {
    res.status(400).json({ error: e.message || '兑换失败' });
  }
});

router.post('/web/token-exchange', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser!.id;
    const fromAmount = Number(req.body?.amount || req.body?.from_amount);
    if (!fromAmount || fromAmount <= 0) return res.status(400).json({ error: '金额无效' });
    let rate = 1;
    try {
      const s = await query(`SELECT value FROM system_settings WHERE key = 'depin_swap_rate' LIMIT 1`);
      if (s.rows[0]?.value) rate = Number(s.rows[0].value) || 1;
    } catch {}
    const toAmount = fromAmount * rate;
    const item = await transaction(async (client) => {
      const userRes = await client.query(`SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!userRes.rows.length) throw new Error('用户不存在');
      if (parseFloat(userRes.rows[0].wallet_balance || 0) < fromAmount) throw new Error('余额不足');
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance - $1, reward_balance = COALESCE(reward_balance,0) + $2, updated_at = NOW() WHERE id = $3 AND wallet_balance >= $1`,
        [fromAmount, toAmount, userId]
      );
      const pos = await client.query(
        `INSERT INTO depin_positions (user_id, mode, amount, status, meta) VALUES ($1,'token_exchange',$2,'done',$3) RETURNING *`,
        [userId, fromAmount, JSON.stringify({ to_asset: 'ENK-GPU', to_amount: toAmount, rate })]
      );
      return pos.rows[0]; 
    });
    res.json({ success: true, item });
  } catch (e: any) {
    res.status(400).json({ error: e.message || '兑换失败' });
  }
});

export default router;
