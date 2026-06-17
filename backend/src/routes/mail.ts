import express from 'express';
import { getMailServiceConfig } from '../services/email.service';

const router = express.Router();

/**
 * GET /api/mail/status
 * Public endpoint to check if mail service is enabled
 * Frontend uses this to determine whether to show verification code fields
 */
router.get('/status', async (_req, res) => {
  try {
    const config = await getMailServiceConfig();
    res.json({ 
      enabled: config.enabled,
      provider: config.provider 
    });
  } catch (error) {
    console.error('Get mail status error:', error);
    // If there's an error, assume mail is disabled to allow fallback registration
    res.json({ enabled: false, provider: 'none' });
  }
});

export default router;
