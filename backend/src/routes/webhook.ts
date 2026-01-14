import express, { Request } from 'express';
import { query } from '../db';
import { validateWebhook } from '../middleware/auth';

const router = express.Router();

// Extend Request interface to include botId added by validateWebhook middleware
interface WebhookRequest extends Request {
  botId?: string;
}

// Webhook endpoint - Old format (backward compatibility)
// Format: /webhook/:botToken
router.post('/:botToken', validateWebhook, async (req: WebhookRequest, res) => {
  try {
    const botId = req.botId;
    const update = req.body;

    console.log(`Received webhook update for bot ${botId}:`, JSON.stringify(update, null, 2));

    // Webhook received successfully
    // Actual bot logic should be handled by independent bot service
    // This endpoint just receives and confirms
    
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint - New secure format
// Format: /webhook/:botId/:secret
router.post('/:botId/:secret', validateWebhook, async (req: WebhookRequest, res) => {
  try {
    const botId = req.botId;
    const update = req.body;

    console.log(`Received webhook update for bot ${botId}:`, JSON.stringify(update, null, 2));

    // Webhook received successfully
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
