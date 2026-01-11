import express from 'express';
import { query } from '../db';
import { validateWebhook } from '../middleware/auth';

const router = express.Router();

// Webhook endpoint for bot updates
router.post('/:botToken', validateWebhook, async (req, res) => {
  try {
    const { botToken } = req.params;
    const update = req.body;

    // Verify bot exists
    const botResult = await query('SELECT id FROM bots WHERE token = $1 AND is_active = true', [botToken]);
    
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // The actual bot logic will be handled by the bot service
    // This endpoint is just for receiving webhooks and forwarding to the bot service
    // In production, you might want to use a message queue here

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
