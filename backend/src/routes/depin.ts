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
