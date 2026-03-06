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

type OrderTable = 'orders' | 'transfer_records' | 'withdrawal_records' | 'deposit_records';

const ALLOWED_ORDER_TABLES: readonly OrderTable[] = [
  'orders',
  'transfer_records',
  'withdrawal_records',
  'deposit_records',
];

/**
 * Generate a unique order ID that doesn't exist in the specified table
 */
export async function generateOrderId(table: OrderTable = 'orders'): Promise<string> {
  if (!ALLOWED_ORDER_TABLES.includes(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  let orderId = '';
  let attempts = 0;
  while (attempts <= 100) {
    const candidate = generateOrderIdCandidate();
    const conflict = await query(
      `SELECT id FROM ${table} WHERE order_id = $1`,
      [candidate]
    );
    if (conflict.rows.length === 0) {
      orderId = candidate;
      break;
    }
    attempts++;
  }
  if (!orderId) throw new Error(`Failed to generate order ID after 100 attempts for table: ${table}`);
  return orderId;
}
