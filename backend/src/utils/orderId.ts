import { query } from '../db';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

/**
 * Generate an 11-character order ID: digits + letters combination
 * e.g. A3B2941X0KZ
 */
export function generateOrderIdCandidate(): string {
  let result = '';
  for (let i = 0; i < 11; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

/**
 * Generate a unique order ID that doesn't exist in the database
 */
export async function generateOrderId(): Promise<string> {
  let orderId = '';
  let attempts = 0;
  while (attempts <= 100) {
    const candidate = generateOrderIdCandidate();
    const conflict = await query('SELECT id FROM orders WHERE order_id = $1', [candidate]);
    if (conflict.rows.length === 0) {
      orderId = candidate;
      break;
    }
    attempts++;
  }
  if (!orderId) throw new Error('Failed to generate order ID after 100 attempts');

  return orderId;
}
