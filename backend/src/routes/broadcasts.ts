import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';
import cron from 'node-cron';
import { translateToAllLangs } from '../utils/translate';

const router = express.Router();

// Store scheduled tasks
const scheduledTasks = new Map<string, cron.ScheduledTask>();

// Create broadcast
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { bot_id, title, content, target_type, scheduled_at, media_url } = req.body;

    if (!bot_id || !content) {
      return res.status(400).json({ error: 'Bot ID and content required' });
    }

    const result = await query(
      `INSERT INTO broadcasts (bot_id, title, content, target_type, scheduled_at, created_by, status, media_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [bot_id, title, content, target_type || 'all', scheduled_at, req.user?.id, 'draft', media_url || null]
    );

    const broadcast = result.rows[0];

    // Auto-translate content and title in the background, then update DB
    const [contentTranslations, titleTranslations] = await Promise.all([
      translateToAllLangs(content),
      translateToAllLangs(title || ''),
    ]);

    await query(
      'UPDATE broadcasts SET content_translations = $1, title_translations = $2 WHERE id = $3',
      [JSON.stringify(contentTranslations), JSON.stringify(titleTranslations), broadcast.id]
    );

    broadcast.content_translations = contentTranslations;
    broadcast.title_translations = titleTranslations;

    res.json({ broadcast });
  } catch (error) {
    console.error('Create broadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get broadcasts
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId, status } = req.query;

    let queryText = `
      SELECT b.*, 
        bo.name as bot_name,
        au.username as created_by_username
      FROM broadcasts b
      JOIN bots bo ON b.bot_id = bo.id
      LEFT JOIN admin_users au ON b.created_by = au.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (botId) {
      params.push(botId);
      queryText += ` AND b.bot_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND b.status = $${params.length}`;
    }

    queryText += ` ORDER BY b.created_at DESC LIMIT 50`;

    const result = await query(queryText, params);
    res.json({ broadcasts: result.rows });
  } catch (error) {
    console.error('Get broadcasts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send broadcast
router.post('/:id/send', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Get broadcast
    const broadcastResult = await query(
      'SELECT * FROM broadcasts WHERE id = $1',
      [id]
    );

    if (broadcastResult.rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    const broadcast = broadcastResult.rows[0];

    if (broadcast.status === 'sent') {
      return res.status(400).json({ error: 'Broadcast already sent' });
    }

    // Update status to sending
    await query(
      'UPDATE broadcasts SET status = $1 WHERE id = $2',
      ['sending', id]
    );

    // Get target users
    let userQuery = 'SELECT telegram_id, language_code FROM users WHERE bot_id = $1 AND telegram_id IS NOT NULL';
    const params = [broadcast.bot_id];

    if (broadcast.target_type === 'active') {
      userQuery += " AND last_active_at > NOW() - INTERVAL '7 days'";
    } else if (broadcast.target_type === 'bound') {
      userQuery += ' AND platform_bound = true';
    } else if (broadcast.target_type === 'unbound') {
      userQuery += ' AND platform_bound = false';
    }

    const usersResult = await query(userQuery, params);

    // Get bot token
    const botResult = await query('SELECT token FROM bots WHERE id = $1', [broadcast.bot_id]);
    if (botResult.rows.length === 0) {
      throw new Error('Bot not found');
    }

    const telegram = new TelegramAPI(botResult.rows[0].token);

    // Prepare translations for localized sending
    const contentTranslations: Record<string, string> = broadcast.content_translations || {};
    const titleTranslations: Record<string, string> = broadcast.title_translations || {};
    const defaultContent = broadcast.content || '';
    const defaultTitle = broadcast.title || '';

    const getLocalizedText = (lang: string | null): string => {
      // Fallback chain: user's language → English → original content
      const safeLang = lang && contentTranslations[lang] ? lang : (contentTranslations['en'] ? 'en' : null);
      if (!safeLang) {
        console.warn(`No translation found for lang=${lang}, falling back to original content`);
      }
      const content = (safeLang ? contentTranslations[safeLang] : null) || defaultContent;
      const title = (safeLang ? titleTranslations[safeLang] : null) || defaultTitle;
      return title ? `<b>${title}</b>\n\n${content}` : content;
    };

    // Send to all users (with rate limiting to avoid Telegram API limits)
    let sentCount = 0;
    let failedCount = 0;

    const BATCH_SIZE = 25;
    const BATCH_DELAY_MS = 1100;

    const isGif = broadcast.media_url &&
      (/\.gif(\?.*)?$/i.test(broadcast.media_url) || broadcast.media_url.includes('animation'));

    for (let i = 0; i < usersResult.rows.length; i += BATCH_SIZE) {
      const batch = usersResult.rows.slice(i, i + BATCH_SIZE);
      const sendPromises = batch.map(async (user) => {
        try {
          const text = getLocalizedText(user.language_code);
          if (broadcast.media_url) {
            if (isGif) {
              await telegram.sendAnimation(user.telegram_id, broadcast.media_url, {
                caption: text,
                parse_mode: 'HTML',
              });
            } else {
              await telegram.sendPhoto(user.telegram_id, broadcast.media_url, {
                caption: text,
                parse_mode: 'HTML',
              });
            }
          } else {
            await telegram.sendMessage(user.telegram_id, text, { parse_mode: 'HTML' });
          }
          sentCount++;
        } catch (err: any) {
          console.error(`Failed to send broadcast to telegram_id=${user.telegram_id}:`, err?.response?.data || err?.message);
          failedCount++;
        }
      });

      await Promise.all(sendPromises);

      // Wait between batches to respect rate limits
      if (i + BATCH_SIZE < usersResult.rows.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Update broadcast status
    await query(
      `UPDATE broadcasts 
       SET status = 'sent', sent_at = NOW(), sent_count = $1, failed_count = $2
       WHERE id = $3`,
      [sentCount, failedCount, id]
    );

    res.json({ 
      success: true,
      sent_count: sentCount,
      failed_count: failedCount
    });
  } catch (error) {
    console.error('Send broadcast error:', error);
    
    // Update status to failed
    await query(
      'UPDATE broadcasts SET status = $1 WHERE id = $2',
      ['failed', req.params.id]
    );

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Schedule broadcast
router.post('/:id/schedule', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { scheduled_at } = req.body;

    if (!scheduled_at) {
      return res.status(400).json({ error: 'Scheduled time required' });
    }

    const scheduledDate = new Date(scheduled_at);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    await query(
      'UPDATE broadcasts SET scheduled_at = $1, status = $2 WHERE id = $3',
      [scheduled_at, 'draft', id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Schedule broadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete broadcast
router.delete('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM broadcasts WHERE id = $1 AND status IN ($2, $3) RETURNING *',
      [id, 'draft', 'failed']
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Cannot delete sent or sending broadcasts' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete broadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
