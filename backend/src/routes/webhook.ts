import express, { Request } from 'express';
import { validateWebhook } from '../middleware/auth';
import { botManager } from '../services/bot-manager.service';

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

    if (botId) {
      try {
        await botManager.handleUpdate(botId, update);
      } catch (handleError) {
        console.error(`Error handling update for bot ${botId}:`, handleError);
      }
    }

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

    if (botId) {
      try {
        await botManager.handleUpdate(botId, update);
      } catch (handleError) {
        console.error(`Error handling update for bot ${botId}:`, handleError);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

