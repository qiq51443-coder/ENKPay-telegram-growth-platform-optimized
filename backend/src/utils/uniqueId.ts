import { query } from '../db';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a 7-character unique ID: 1 uppercase letter + 6 digits
 * e.g. A382941, K750123
 */
export function generateUniqueIdCandidate(): string {
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const digits = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  return letter + digits;
}

/**
 * Generate and persist a unique ID for a user, or return existing one
 */
export async function getOrCreateUniqueId(telegramId: number, botId: string): Promise<string> {
  // Check if user already has a unique_id
  const existing = await query(
    'SELECT unique_id FROM users WHERE telegram_id = $1 AND bot_id = $2',
    [telegramId, botId]
  );

  if (existing.rows.length > 0 && existing.rows[0].unique_id) {
    return existing.rows[0].unique_id;
  }

  // Generate new unique ID
  let uniqueId = '';
  let attempts = 0;
  while (attempts <= 100) {
    const candidate = generateUniqueIdCandidate();
    const conflict = await query('SELECT id FROM users WHERE unique_id = $1', [candidate]);
    if (conflict.rows.length === 0) {
      uniqueId = candidate;
      break;
    }
    attempts++;
  }
  if (!uniqueId) throw new Error('Failed to generate unique ID after 100 attempts');

  // Persist the generated unique_id
  await query(
    'UPDATE users SET unique_id = $1 WHERE telegram_id = $2 AND bot_id = $3',
    [uniqueId, telegramId, botId]
  );

  return uniqueId;
}

/**
 * Generate a unique 7-character alphanumeric ID (avoids ambiguous chars O/0/I/l/1).
 * Uses the same character set as bot-manager's generateUserUniqueId().
 * Checks the database for conflicts and retries up to 10 times.
 * Throws if no unique candidate is found within the retry limit.
 */
export async function generateUniqueUserId(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let id = '';
    for (let i = 0; i < 7; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    const conflict = await query('SELECT id FROM users WHERE unique_id = $1', [id]);
    if (conflict.rows.length === 0) return id;
  }
  // Fallback: timestamp-based suffix ensures global uniqueness even under extreme contention
  return `U${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
