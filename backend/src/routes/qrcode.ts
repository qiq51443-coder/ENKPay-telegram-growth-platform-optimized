import express from 'express';
import crypto from 'crypto';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';

const router = express.Router();

function getHmacSecret(): string {
  return process.env.QR_HMAC_SECRET || ((process.env.JWT_SECRET || '') + '_qrcode');
}

function computeSig(uid: string, ts: number): string {
  const secret = getHmacSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(`uid=${uid}&ts=${ts}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * POST /api/admin/qrcode/generate
 * Generate a signed payment QR code content string for a user.
 * Body: { user_id: string, expires_months?: number }
 */
router.post('/generate', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { user_id, expires_months } = req.body as {
      user_id: string;
      expires_months?: number;
    };

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Look up user
    const userResult = await query(
      `SELECT id, unique_id, first_name, username FROM users WHERE id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const uid: string = user.unique_id || String(user.id);
    const name: string = user.first_name || user.username || uid;

    // Calculate expiry timestamp
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (expires_months || 1));
    const ts = Math.floor(expiresAt.getTime() / 1000);

    // Compute HMAC-SHA256 signature (first 16 hex chars)
    const sig = computeSig(uid, ts);

    // Build content URL
    const content = `enkpay://pay?uid=${encodeURIComponent(uid)}&name=${encodeURIComponent(name)}&ts=${ts}&sig=${sig}&v=2`;

    return res.json({
      success: true,
      content,
      expires_at: expiresAt.toISOString(),
      user: {
        uid,
        name,
        unique_id: uid,
      },
    });
  } catch (error: any) {
    console.error('QR generate error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/qrcode/verify
 * Verify a scanned QR code content string.
 * Body: { content: string }
 */
router.post('/verify', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const { content } = req.body as { content: string };

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ valid: false, error: 'content is required' });
    }

    // Parse enkpay://pay?... URL
    let params: URLSearchParams;
    try {
      const url = new URL(content);
      if (url.protocol !== 'enkpay:' || url.pathname.replace(/^\/\/pay/, '').replace('/', '') !== '') {
        // Accept enkpay://pay with any path prefix
        if (!content.startsWith('enkpay://pay')) {
          return res.json({ valid: false, expired: false, error: 'Invalid QR code format' });
        }
      }
      params = url.searchParams;
    } catch {
      return res.json({ valid: false, expired: false, error: 'Invalid QR code format' });
    }

    const uid = params.get('uid');
    const tsStr = params.get('ts');
    const sig = params.get('sig');
    const v = params.get('v');

    if (!uid || !tsStr || !sig || v !== '2') {
      return res.json({ valid: false, expired: false, error: 'Invalid QR code format' });
    }

    const ts = parseInt(tsStr, 10);
    if (isNaN(ts)) {
      return res.json({ valid: false, expired: false, error: 'Invalid QR code format' });
    }

    // Verify HMAC signature
    const expectedSig = computeSig(uid, ts);
    if (sig !== expectedSig) {
      return res.json({ valid: false, expired: false, error: 'Invalid QR code signature' });
    }

    // Check expiry
    if (Math.floor(Date.now() / 1000) > ts) {
      return res.json({ valid: false, expired: true, error: 'QR code has expired' });
    }

    // Look up user in DB
    const userResult = await query(
      `SELECT id, unique_id, first_name, username FROM users WHERE unique_id = $1`,
      [uid]
    );

    if (userResult.rows.length === 0) {
      return res.json({ valid: false, expired: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    return res.json({
      valid: true,
      expired: false,
      user: {
        uid: user.unique_id || String(user.id),
        first_name: user.first_name || '',
        username: user.username || '',
        unique_id: user.unique_id || String(user.id),
      },
    });
  } catch (error: any) {
    console.error('QR verify error:', error);
    return res.status(500).json({ valid: false, error: error.message || 'Internal server error' });
  }
});

export default router;
