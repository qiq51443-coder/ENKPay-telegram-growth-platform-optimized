import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { authenticateWebUser, WebAuthRequest } from '../middleware/web-auth';
import { translateToAllLangs } from '../utils/translate';

const router = express.Router();

function enrichPosition(row: any) {
  const amount = parseFloat(row.amount || 0);
  const rate = parseFloat(row.daily_yield_rate || 0);
  const claimed = parseFloat(row.total_yield || 0);
  const start = row.start_at ? new Date(row.start_at).getTime() : Date.now();
  const end = row.end_at ? new Date(row.end_at).getTime() : null;
  const now = Date.now();
  const lockDays = Number(row.lock_days || 0);
  const totalDays = lockDays > 0 ? lockDays : end ? Math.max(1, (end - start) / (24 * 3600 * 1000)) : 0;
  const effectiveEnd = end && end < now ? end : now;
  const elapsedRaw = Math.max(0, (effectiveEnd - start) / (24 * 3600 * 1000));
  const days = totalDays > 0 ? Math.min(elapsedRaw, totalDays) : elapsedRaw;
  const accrued = amount * (rate / 100) * days;
  const claimable = Math.max(0, accrued - claimed);
  const is_matured = !!(end && end <= now) || (totalDays > 0 && elapsedRaw >= totalDays);
  const progress_pct = totalDays > 0 ? Math.min(100, Number(((elapsedRaw / totalDays) * 100).toFixed(2))) : is_matured ? 100 : 0;
  const remaining_days = totalDays > 0 ? Math.max(0, Number((totalDays - elapsedRaw).toFixed(2))) : 0;
  return {
    ...row,
    accrued_yield: Number(accrued.toFixed(8)),
    claimable_yield: Number(claimable.toFixed(8)),
    claimed_yield: claimed,
    elapsed_days: Number(elapsedRaw.toFixed(4)),
    total_days: Number(totalDays.toFixed(4)),
    remaining_days,
    progress_pct,
    is_matured,
    principal_returned: row.status === 'completed' || row.status === 'matured_returned',
  };
}

async function addTokenBalance(client: any, userId: string, symbol: string, delta: number) {
  const sym = symbol.toUpperCase();
  if (sym === 'USDT') {
    if (delta < 0) {
      const r = await client.query(
        `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2 AND COALESCE(wallet_balance, 0) >= $3 RETURNING wallet_balance`,
        [delta, userId, Math.abs(delta)]
      );
      if (!r.rows.length) throw new Error('USDT 余额不足');
    } else {
      await client.query(
        `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
        [delta, userId]
      );
    }
    return;
  }
  if (delta < 0) {
    const r = await client.query(
      `UPDATE web_token_balances SET amount = amount + $1, updated_at = NOW() WHERE user_id = $2 AND symbol = $3 AND amount >= $4 RETURNING amount`,
      [delta, userId, sym, Math.abs(delta)]
    );
    if (!r.rows.length) throw new Error(`${sym} 余额不足`);
  } else {
    await client.query(
      `INSERT INTO web_token_balances (user_id, symbol, amount, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, symbol) DO UPDATE SET amount = web_token_balances.amount + $3, updated_at = NOW()`,
      [userId, sym, delta]
    );
  }
}

async function settleMaturedPositions(userId?: string) {
  try {
    const params: any[] = [];
    let sql = `SELECT * FROM depin_positions WHERE status = 'active' AND end_at IS NOT NULL AND end_at <= NOW()`;
    if (userId) { params.push(userId); sql += ` AND user_id = $1`; }
    sql += ` ORDER BY id ASC LIMIT 50`;
    const rows = (await query(sql, params)).rows;
    for (const raw of rows) {
      try {
        await transaction(async (client) => {
          const locked = await client.query(`SELECT * FROM depin_positions WHERE id = $1 AND status = 'active' FOR UPDATE`, [raw.id]);
          if (!locked.rows.length) return;
          const pos = enrichPosition(locked.rows[0]);
          if (!pos.is_matured) return;
          const uid = String(pos.user_id);
          const principal = parseFloat(String(pos.amount || 0));
          const claimable = Number(pos.claimable_yield || 0);
          let totalCredit = 0;
          if (claimable > 0.00000001) {
            await addTokenBalance(client, uid, 'USDT', claimable);
            totalCredit += claimable;
            await client.query(`UPDATE depin_positions SET total_yield = COALESCE(total_yield, 0) + $1 WHERE id = $2`, [claimable, pos.id]);
          }
          if (principal > 0) {
            await addTokenBalance(client, uid, 'USDT', principal);
            totalCredit += principal;
          }
          await client.query(`UPDATE depin_positions SET status = 'completed' WHERE id = $1`, [pos.id]);
          const bal = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [uid]);
          const walletAfter = parseFloat(String(bal.rows[0]?.wallet_balance ?? 0));
          const desc = `DePIN 到期返还 #${pos.id} 本金 ${principal}` + (claimable > 0 ? ` +收益 ${claimable}` : '');
          try {
            await client.query(`INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,'depin_mature_return',$2,$3,$4)`, [uid, totalCredit, walletAfter, desc]);
          } catch {}
        });
      } catch (e: any) {
        console.warn('[depin] settle', raw.id, e.message);
      }
    }
  } catch (e: any) {
    console.warn('[depin] settleMaturedPositions', e.message);
  }
}

let tablesReady = false;
async function ensureWebTables() {
  if (tablesReady) return;
  await query(`CREATE TABLE IF NOT EXISTS web_token_balances (user_id UUID NOT NULL, symbol VARCHAR(32) NOT NULL, amount NUMERIC(24, 8) NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, symbol))`);
  await query(`CREATE TABLE IF NOT EXISTS depin_node_plans (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, description TEXT, price NUMERIC(18, 6) NOT NULL DEFAULT 0, daily_yield_rate NUMERIC(10, 4) NOT NULL DEFAULT 0, term_days INT NOT NULL DEFAULT 30, sort_order INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`ALTER TABLE depin_node_plans ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}'::jsonb`);
  await query(`CREATE TABLE IF NOT EXISTS depin_positions (id SERIAL PRIMARY KEY, user_id UUID NOT NULL, mode VARCHAR(32) NOT NULL, plan_id INT, amount NUMERIC(18, 6) NOT NULL DEFAULT 0, lock_days INT, daily_yield_rate NUMERIC(10, 4), status VARCHAR(32) NOT NULL DEFAULT 'active', start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), end_at TIMESTAMPTZ, total_yield NUMERIC(18, 6) NOT NULL DEFAULT 0, meta JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS depin_swap_orders (id SERIAL PRIMARY KEY, user_id UUID NOT NULL, from_asset VARCHAR(32) NOT NULL DEFAULT 'USDT', to_asset VARCHAR(32) NOT NULL, from_amount NUMERIC(24, 8) NOT NULL, to_amount NUMERIC(24, 8) NOT NULL, rate NUMERIC(24, 10) NOT NULL DEFAULT 1, status VARCHAR(32) NOT NULL DEFAULT 'done', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS depin_market_coins (id SERIAL PRIMARY KEY, coingecko_id VARCHAR(80) NOT NULL UNIQUE, symbol VARCHAR(32) NOT NULL, name VARCHAR(120) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT true, sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  tablesReady = true;
}

async function resolvePriceUsdt(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase();
  if (sym === 'USDT') return 1;
  const r = await query(`SELECT current_price, base_currency, symbol FROM trading_pairs WHERE is_active = true AND (UPPER(base_currency) = $1 OR UPPER(symbol) = $1 OR UPPER(symbol) = $1 || '/USDT' OR UPPER(symbol) LIKE $1 || '/%') ORDER BY sort_order ASC LIMIT 1`, [sym]);
  if (!r.rows.length) throw new Error(`未找到 ${sym} 行情价格`);
  const price = parseFloat(r.rows[0].current_price || 0);
  if (!price || price <= 0) throw new Error(`${sym} 价格无效`);
  return price;
}

router.get('/admin/plans', authenticateAdmin, async (_req, res) => {
  try { await ensureWebTables(); res.json({ success: true, items: (await query(`SELECT * FROM depin_node_plans ORDER BY sort_order ASC, id DESC`)).rows }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/plans', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, description_i18n, price, daily_yield_rate, term_days, sort_order, is_active } = req.body || {};
    if (!name || price == null) return res.status(400).json({ error: 'name and price required' });
    const result = await query(`INSERT INTO depin_node_plans (name, description, description_i18n, price, daily_yield_rate, term_days, sort_order, is_active) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,COALESCE($8,true)) RETURNING *`, [String(name).slice(0, 120), description || null, JSON.stringify(description_i18n || {}), Number(price), Number(daily_yield_rate ?? 0), Number(term_days ?? 30), Number(sort_order ?? 0), is_active]);
    res.json({ success: true, item: result.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/plans/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const result = await query(`UPDATE depin_node_plans SET name = COALESCE($1,name), description = COALESCE($2,description), description_i18n = COALESCE($3::jsonb, description_i18n), price = COALESCE($4,price), daily_yield_rate = COALESCE($5,daily_yield_rate), term_days = COALESCE($6,term_days), sort_order = COALESCE($7,sort_order), is_active = COALESCE($8,is_active), updated_at = NOW() WHERE id = $9 RETURNING *`, [b.name ?? null, b.description ?? null, b.description_i18n != null ? JSON.stringify(b.description_i18n) : null, b.price != null ? Number(b.price) : null, b.daily_yield_rate != null ? Number(b.daily_yield_rate) : null, b.term_days != null ? Number(b.term_days) : null, b.sort_order != null ? Number(b.sort_order) : null, typeof b.is_active === 'boolean' ? b.is_active : null, id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, item: result.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/plans/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try { await query(`DELETE FROM depin_node_plans WHERE id = $1`, [parseInt(req.params.id, 10)]); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/investments', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureWebTables();
    await settleMaturedPositions();
    const { search, mode, limit } = req.query as any;
    const params: any[] = [];
    let sql = `SELECT p.*, u.email AS user_email FROM depin_positions p LEFT JOIN users u ON u.id = p.user_id WHERE 1=1`;
    if (mode) { params.push(mode); sql += ` AND p.mode = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND u.email ILIKE $${params.length}`; }
    params.push(Math.min(parseInt(limit || '50', 10) || 50, 200));
    sql += ` ORDER BY p.id DESC LIMIT $${params.length}`;
    const rows = (await query(sql, params)).rows.map(enrichPosition);
    res.json({ success: true, items: rows, summary: { count: rows.length, total_principal: rows.reduce((s: number, i: any) => s + Number(i.amount || 0), 0), total_claimable: rows.reduce((s: number, i: any) => s + Number(i.claimable_yield || 0), 0), total_claimed: rows.reduce((s: number, i: any) => s + Number(i.claimed_yield || 0), 0) } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/positions/:id/return-principal', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureWebTables();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const result = await transaction(async (client) => {
      const locked = await client.query(`SELECT * FROM depin_positions WHERE id = $1 FOR UPDATE`, [id]);
      if (!locked.rows.length) throw new Error('仓位不存在');
      const pos = enrichPosition(locked.rows[0]);
      if (pos.status === 'completed' || pos.status === 'matured_returned') throw new Error('该仓位已退还本金');
      const uid = String(pos.user_id);
      const principal = parseFloat(String(pos.amount || 0));
      const claimable = Number(pos.claimable_yield || 0);
      let totalCredit = 0;
      if (claimable > 0.00000001) {
        await addTokenBalance(client, uid, 'USDT', claimable);
        totalCredit += claimable;
        await client.query(`UPDATE depin_positions SET total_yield = COALESCE(total_yield, 0) + $1 WHERE id = $2`, [claimable, pos.id]);
      }
      if (principal > 0) {
        await addTokenBalance(client, uid, 'USDT', principal);
        totalCredit += principal;
      }
      await client.query(`UPDATE depin_positions SET status = 'completed' WHERE id = $1`, [pos.id]);
      const bal = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [uid]);
      const walletAfter = parseFloat(String(bal.rows[0]?.wallet_balance ?? 0));
      const desc = `DePIN 手动退还 #${pos.id} 本金 ${principal}` + (claimable > 0 ? ` +收益 ${claimable}` : '');
      try { await client.query(`INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,'depin_mature_return',$2,$3,$4)`, [uid, totalCredit, walletAfter, desc]); } catch {}
      return { principal, claimable, totalCredit, wallet_balance: walletAfter, position_id: id };
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || '退还失败' });
  }
});

router.get('/admin/market-coins', authenticateAdmin, async (_req, res) => {
  try {
    await ensureWebTables();
    res.json({ success: true, items: (await query(`SELECT * FROM depin_market_coins ORDER BY sort_order ASC, id DESC`)).rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/market-coins', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureWebTables();
    const { coingecko_id, symbol, name, sort_order, is_active } = req.body || {};
    if (!coingecko_id || !symbol) return res.status(400).json({ error: 'coingecko_id and symbol required' });
    const result = await query(
      `INSERT INTO depin_market_coins (coingecko_id, symbol, name, sort_order, is_active) VALUES ($1,$2,$3,COALESCE($4,0),COALESCE($5,true))
       ON CONFLICT (coingecko_id) DO UPDATE SET symbol=EXCLUDED.symbol, name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active RETURNING *`,
      [String(coingecko_id).trim().toLowerCase(), String(symbol).trim().toUpperCase(), name || symbol, Number(sort_order || 0), is_active !== false]
    );
    res.json({ success: true, item: result.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/market-coins/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const result = await query(
      `UPDATE depin_market_coins SET coingecko_id=COALESCE($1,coingecko_id), symbol=COALESCE($2,symbol), name=COALESCE($3,name), sort_order=COALESCE($4,sort_order), is_active=COALESCE($5,is_active) WHERE id=$6 RETURNING *`,
      [b.coingecko_id != null ? String(b.coingecko_id).trim().toLowerCase() : null, b.symbol != null ? String(b.symbol).trim().toUpperCase() : null, b.name != null ? String(b.name) : null, b.sort_order != null ? Number(b.sort_order) : null, typeof b.is_active === 'boolean' ? b.is_active : null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, item: result.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/market-coins/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    await query(`DELETE FROM depin_market_coins WHERE id = $1`, [parseInt(req.params.id, 10)]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

let marketCache: { at: number; items: any[] } | null = null;
router.get('/web/market-overview', authenticateWebUser, async (_req, res) => {
  try {
    await ensureWebTables();
    const now = Date.now();
    if (marketCache && now - marketCache.at < 10 * 60 * 1000) {
      return res.json({ success: true, items: marketCache.items, cached: true });
    }
    const coins = (await query(`SELECT coingecko_id, symbol, name FROM depin_market_coins WHERE is_active = true ORDER BY sort_order ASC, id ASC LIMIT 30`)).rows;
    if (!coins.length) {
      marketCache = { at: now, items: [] };
      return res.json({ success: true, items: [] });
    }
    const ids = coins.map((c: any) => c.coingecko_id).join(',');
    let items: any[] = [];
    try {
      const resp = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`, { headers: { Accept: 'application/json' } });
      if (resp.ok) {
        const data: any = await resp.json();
        const byId: Record<string, any> = {};
        for (const row of data || []) byId[row.id] = row;
        items = coins.map((c: any) => {
          const g = byId[c.coingecko_id] || {};
          return { id: c.coingecko_id, symbol: (c.symbol || g.symbol || '').toUpperCase(), name: c.name || g.name || c.coingecko_id, image: g.image || null, price_usd: g.current_price ?? null, change_24h: g.price_change_percentage_24h ?? null, market_cap: g.market_cap ?? null };
        });
      } else {
        items = coins.map((c: any) => ({ id: c.coingecko_id, symbol: c.symbol, name: c.name, image: null, price_usd: null, change_24h: null }));
      }
    } catch {
      items = coins.map((c: any) => ({ id: c.coingecko_id, symbol: c.symbol, name: c.name, image: null, price_usd: null, change_24h: null }));
    }
    marketCache = { at: now, items };
    res.json({ success: true, items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/web/balances', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    const userId = req.webUser!.id;
    const userRes = await query(`SELECT wallet_balance FROM users WHERE id = $1`, [userId]);
    const usdt = userRes.rows.length ? parseFloat(userRes.rows[0].wallet_balance || 0) : 0;
    let tokens: Array<{ symbol: string; amount: number }> = [];
    try { tokens = (await query(`SELECT symbol, amount FROM web_token_balances WHERE user_id = $1 AND amount > 0`, [userId])).rows.map((r: any) => ({ symbol: r.symbol, amount: parseFloat(r.amount || 0) })); } catch { tokens = []; }
    const priceMap: Record<string, number> = { USDT: 1 };
    try {
      for (const p of (await query(`SELECT symbol, base_currency, current_price FROM trading_pairs WHERE is_active = true`)).rows) {
        const base = String(p.base_currency || p.symbol || '').toUpperCase().split('/')[0];
        const price = parseFloat(p.current_price || 0);
        if (base && price > 0) priceMap[base] = price;
      }
    } catch {}
    const assets = [{ symbol: 'USDT', amount: usdt, price_usdt: 1, value_usdt: usdt }, ...tokens.map((t) => ({ symbol: t.symbol, amount: t.amount, price_usdt: priceMap[t.symbol] || 0, value_usdt: t.amount * (priceMap[t.symbol] || 0) }))];
    res.json({ success: true, total_usdt: assets.reduce((s, a) => s + a.value_usdt, 0), assets, prices: priceMap });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/web/swap', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    const userId = req.webUser!.id;
    const fromSymbol = String(req.body?.from_symbol || '').toUpperCase();
    const toSymbol = String(req.body?.to_symbol || '').toUpperCase();
    const fromAmount = Number(req.body?.from_amount);
    if (!fromSymbol || !toSymbol) return res.status(400).json({ error: '请选择币种' });
    if (!fromAmount || fromAmount <= 0 || !Number.isFinite(fromAmount)) return res.status(400).json({ error: '金额无效' });
    if (fromSymbol === toSymbol) return res.status(400).json({ error: '币种不能相同' });
    if (fromSymbol !== 'USDT' && toSymbol !== 'USDT') return res.status(400).json({ error: '仅支持与 USDT 兑换' });
    const tokenSym = fromSymbol === 'USDT' ? toSymbol : fromSymbol;
    const price = await resolvePriceUsdt(tokenSym);
    const toAmount = fromSymbol === 'USDT' ? fromAmount / price : fromAmount * price;
    if (!Number.isFinite(toAmount) || toAmount <= 0) return res.status(400).json({ error: '兑换数量无效' });
    const result = await transaction(async (client) => {
      await addTokenBalance(client, userId, fromSymbol, -fromAmount);
      await addTokenBalance(client, userId, toSymbol, toAmount);
      await client.query(`INSERT INTO depin_swap_orders (user_id, from_asset, to_asset, from_amount, to_amount, rate, status) VALUES ($1,$2,$3,$4,$5,$6,'done')`, [userId, fromSymbol, toSymbol, fromAmount, toAmount, price]);
      const bal = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [userId]);
      const walletAfter = parseFloat(String(bal.rows[0]?.wallet_balance ?? 0));
      try { await client.query(`INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,'depin_swap',$2,$3,$4)`, [userId, fromSymbol === 'USDT' ? -fromAmount : toAmount, walletAfter, `闪兑 ${fromAmount} ${fromSymbol} → ${Number(toAmount).toFixed(8)} ${toSymbol}`]); } catch {}
      return { from_amount: fromAmount, to_amount: toAmount, rate: price, wallet_balance: walletAfter };
    });
    res.json({ success: true, ...result });
  } catch (e: any) { res.status(400).json({ error: e.message || '兑换失败' }); }
});

router.get('/web/plans', authenticateWebUser, async (_req, res) => {
  try { await ensureWebTables(); res.json({ success: true, items: (await query(`SELECT id, name, description, description_i18n, price, daily_yield_rate, term_days FROM depin_node_plans WHERE is_active = true ORDER BY sort_order ASC, id DESC`)).rows }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/web/positions', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    await settleMaturedPositions(req.webUser!.id);
    const rows = (await query(`SELECT * FROM depin_positions WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [req.webUser!.id])).rows;
    const items = rows.map(enrichPosition);
    res.json({ success: true, items, summary: { position_count: items.length, total_principal: items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0), total_claimable: items.reduce((s: number, i: any) => s + Number(i.claimable_yield || 0), 0), total_claimed: items.reduce((s: number, i: any) => s + Number(i.claimed_yield || 0), 0) } });
  } catch (e: any) {
    if (String(e.message || '').includes('does not exist')) return res.json({ success: true, items: [], summary: {} });
    res.status(500).json({ error: e.message });
  }
});

router.post('/web/buy-node', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    const userId = req.webUser!.id;
    const planId = parseInt(String(req.body?.plan_id), 10);
    if (!planId) return res.status(400).json({ error: 'plan_id required' });
    const planRes = await query(`SELECT * FROM depin_node_plans WHERE id = $1 AND is_active = true`, [planId]);
    if (!planRes.rows.length) return res.status(404).json({ error: '套餐不存在' });
    const plan = planRes.rows[0];
    const price = parseFloat(plan.price);
    const termDays = Number(plan.term_days || 30);
    const rate = parseFloat(plan.daily_yield_rate || 0);
    const end = new Date(Date.now() + termDays * 24 * 3600 * 1000);
    await transaction(async (client) => {
      await addTokenBalance(client, userId, 'USDT', -price);
      await client.query(`INSERT INTO depin_positions (user_id, mode, plan_id, amount, lock_days, daily_yield_rate, status, end_at, meta) VALUES ($1,'node_server',$2,$3,$4,$5,'active',$6,$7)`, [userId, planId, price, termDays, rate, end.toISOString(), JSON.stringify({ plan_name: plan.name })]);
      const bal = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [userId]);
      try { await client.query(`INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,'depin_buy_node',$2,$3,$4)`, [userId, -price, parseFloat(String(bal.rows[0]?.wallet_balance ?? 0)), `购买节点 ${plan.name}`]); } catch {}
    });
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message || '购买失败' }); }
});

router.post('/web/stake', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    const userId = req.webUser!.id;
    const amount = Number(req.body?.amount);
    const lockDays = Number(req.body?.lock_days || 30);
    if (!amount || amount <= 0) return res.status(400).json({ error: '金额无效' });
    const rateMap: Record<number, number> = { 30: 0.2, 60: 0.3, 90: 0.4, 180: 0.5 };
    const rate = rateMap[lockDays] || 0.2;
    const end = new Date(Date.now() + lockDays * 24 * 3600 * 1000);
    await transaction(async (client) => {
      await addTokenBalance(client, userId, 'USDT', -amount);
      await client.query(`INSERT INTO depin_positions (user_id, mode, amount, lock_days, daily_yield_rate, status, end_at, meta) VALUES ($1,'asset_stake',$2,$3,$4,'active',$5,$6)`, [userId, amount, lockDays, rate, end.toISOString(), JSON.stringify({ principal_locked: true })]);
      const bal = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [userId]);
      try { await client.query(`INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,'depin_stake',$2,$3,$4)`, [userId, -amount, parseFloat(String(bal.rows[0]?.wallet_balance ?? 0)), `资产质押 ${lockDays}天`]); } catch {}
    });
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message || '质押失败' }); }
});

router.post('/web/claim-yield', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    const userId = req.webUser!.id;
    const positionId = parseInt(String(req.body?.position_id), 10);
    if (!positionId) return res.status(400).json({ error: 'position_id required' });
    const result = await transaction(async (client) => {
      const posRes = await client.query(`SELECT * FROM depin_positions WHERE id = $1 AND user_id = $2 FOR UPDATE`, [positionId, userId]);
      if (!posRes.rows.length) throw new Error('仓位不存在');
      const pos = enrichPosition(posRes.rows[0]);
      if (pos.status === 'completed') throw new Error('仓位已结束');
      const claimable = Number(pos.claimable_yield || 0);
      if (claimable <= 0) throw new Error('暂无可领收益');
      await addTokenBalance(client, userId, 'USDT', claimable);
      await client.query(`UPDATE depin_positions SET total_yield = COALESCE(total_yield, 0) + $1 WHERE id = $2`, [claimable, positionId]);
      const balRes = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [userId]);
      const walletAfter = parseFloat(String(balRes.rows[0].wallet_balance ?? 0));
      try { await client.query(`INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES ($1,'depin_yield',$2,$3,$4)`, [userId, claimable, walletAfter, `DePIN 收益领取 #${positionId}`]); } catch {}
      return { claimed: claimable, wallet_balance: walletAfter };
    });
    res.json({ success: true, ...result });
  } catch (e: any) { res.status(400).json({ error: e.message || '领取失败' }); }
});

router.get('/web/ledger', authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    await ensureWebTables();
    const userId = req.webUser!.id;
    const limit = Math.min(parseInt(String((req.query as any).limit || '50'), 10) || 50, 100);
    const parts = await Promise.all([
      query(`SELECT id::text AS id, type, amount::numeric AS amount, balance_after::numeric AS balance_after, COALESCE(description,'') AS description, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 80`, [userId]).then(r => r.rows).catch(() => []),
      query(`SELECT id::text AS id, 'deposit' AS type, amount::numeric AS amount, NULL::numeric AS balance_after, COALESCE(tx_hash,'') AS description, created_at FROM deposit_records WHERE user_id = $1 AND status IN ('credited','confirmed','completed','success') ORDER BY created_at DESC LIMIT 40`, [userId]).then(r => r.rows).catch(() => []),
      query(`SELECT id::text AS id, 'withdrawal' AS type, amount::numeric AS amount, NULL::numeric AS balance_after, COALESCE(to_address,'') AS description, created_at FROM withdrawal_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40`, [userId]).then(r => r.rows).catch(() => []),
    ]);
    const items = parts.flat().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
    res.json({ success: true, items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/translate', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });
    res.json({ success: true, translations: await translateToAllLangs(text) });
  } catch (e: any) { res.status(500).json({ error: e.message || '翻译失败' }); }
});

export default router;
