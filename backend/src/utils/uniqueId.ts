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
  let uniqueId: string;
  let attempts = 0;
  do {
    uniqueId = generateUniqueIdCandidate();
    const conflict = await query('SELECT id FROM users WHERE unique_id = $1', [uniqueId]);
    if (conflict.rows.length === 0) break;
    attempts++;
    if (attempts > 100) throw new Error('Failed to generate unique ID after 100 attempts');
  } while (true);

  // Persist the generated unique_id
  await query(
    'UPDATE users SET unique_id = $1 WHERE telegram_id = $2 AND bot_id = $3',
    [uniqueId, telegramId, botId]
  );

  return uniqueId;
}
