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
    const { bot_id, title, content, target_type, scheduled_at, media_url, target_users, pin_message,
      content_translations: clientContentTranslations, title_translations: clientTitleTranslations } = req.body;

    if (!bot_id || !content) {
      return res.status(400).json({ error: 'Bot ID and content required' });
    }

    const result = await query(
      `INSERT INTO broadcasts (bot_id, title, content, target_type, scheduled_at, created_by, status, media_url, target_users, pin_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [bot_id, title, content, target_type || 'all', scheduled_at, req.user?.id, 'draft', media_url || null,
        target_users || null, pin_message ? true : false]
    );

    const broadcast = result.rows[0];

    // If front-end already provided translations, use them directly and respond immediately
    if (clientContentTranslations && Object.keys(clientContentTranslations).length > 0) {
      await query(
        'UPDATE broadcasts SET content_translations = $1, title_translations = $2 WHERE id = $3',
        [JSON.stringify(clientContentTranslations), JSON.stringify(clientTitleTranslations || {}), broadcast.id]
      );
      broadcast.content_translations = clientContentTranslations;
      broadcast.title_translations = clientTitleTranslations || {};
      return res.json({ broadcast });
    }

    // Respond immediately, then translate in background to avoid blocking / timeout
    broadcast.content_translations = {};
    broadcast.title_translations = {};
    res.json({ broadcast });

    setImmediate(async () => {
      try {
        const [ct, tt] = await Promise.all([
          translateToAllLangs(content),
          translateToAllLangs(title || ''),
        ]);
        await query(
          'UPDATE broadcasts SET content_translations = $1, title_translations = $2 WHERE id = $3',
          [JSON.stringify(ct), JSON.stringify(tt), broadcast.id]
        );
      } catch (err) {
        console.error('Background translate for broadcast failed:', err);
      }
    });
  } catch (error: any) {
    console.error('Create broadcast error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
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
  } catch (error: any) {
    console.error('Get broadcasts error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
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
    let usersResult;
    if (broadcast.target_type === 'specific') {
      // Parse target_users field: comma or newline separated identifiers (telegram_id / @username / unique_id)
      const raw: string = broadcast.target_users || '';
      const identifiers = raw.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
      if (identifiers.length === 0) {
        await query('UPDATE broadcasts SET status = $1 WHERE id = $2', ['failed', id]);
        return res.status(400).json({ error: 'No target users specified' });
      }

      const userRows: any[] = [];
      for (const identifier of identifiers) {
        // Numeric: treat as telegram_id
        const numericId = /^\d+$/.test(identifier) ? parseInt(identifier, 10) : null;
        // @username or plain username
        const usernameClean = identifier.startsWith('@') ? identifier.slice(1) : identifier;
        const found = await query(
          `SELECT telegram_id, language_code FROM users
           WHERE bot_id = $1 AND telegram_id IS NOT NULL
             AND (
               ($2::bigint IS NOT NULL AND telegram_id = $2::bigint)
               OR LOWER(username) = LOWER($3)
               OR LOWER(unique_id) = LOWER($3)
             )
           LIMIT 1`,
          [broadcast.bot_id, numericId, usernameClean]
        );
        if (found.rows.length > 0) {
          userRows.push(found.rows[0]);
        } else {
          console.warn(`Broadcast specific target not found: ${identifier}`);
        }
      }
      usersResult = { rows: userRows };
    } else {
      let userQuery = 'SELECT telegram_id, language_code FROM users WHERE bot_id = $1 AND telegram_id IS NOT NULL';
      const params = [broadcast.bot_id];

      if (broadcast.target_type === 'active') {
        userQuery += " AND last_active_at > NOW() - INTERVAL '7 days'";
      }

      usersResult = await query(userQuery, params);
    }

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

    // Detect base64 media and decode to Buffer once
    let mediaBuffer: Buffer | null = null;
    let mediaMimeType: string = '';
    const isBase64Media = broadcast.media_url && broadcast.media_url.startsWith('data:');
    if (isBase64Media) {
      const match = (broadcast.media_url as string).match(/^data:([^;\n]+);base64,(.+)$/);
      if (match) {
        mediaMimeType = match[1];
        mediaBuffer = Buffer.from(match[2], 'base64');
      }
    }

    const isGif = broadcast.media_url && (
      /\.gif(\?.*)?$/i.test(broadcast.media_url) ||
      broadcast.media_url.includes('animation') ||
      mediaMimeType === 'image/gif'
    );

    for (let i = 0; i < usersResult.rows.length; i += BATCH_SIZE) {
      const batch = usersResult.rows.slice(i, i + BATCH_SIZE);
      const sendPromises = batch.map(async (user) => {
        try {
          const text = getLocalizedText(user.language_code);
          let result: any;
          if (broadcast.media_url) {
            if (mediaBuffer) {
              // base64 encoded media — use Buffer upload
              if (isGif) {
                result = await telegram.sendAnimationBuffer(user.telegram_id, mediaBuffer, mediaMimeType, {
                  caption: text,
                  parse_mode: 'HTML',
                });
              } else {
                result = await telegram.sendPhotoBuffer(user.telegram_id, mediaBuffer, mediaMimeType, {
                  caption: text,
                  parse_mode: 'HTML',
                });
              }
            } else {
              // URL-based media
              if (isGif) {
                result = await telegram.sendAnimation(user.telegram_id, broadcast.media_url, {
                  caption: text,
                  parse_mode: 'HTML',
                });
              } else {
                result = await telegram.sendPhoto(user.telegram_id, broadcast.media_url, {
                  caption: text,
                  parse_mode: 'HTML',
                });
              }
            }
          } else {
            result = await telegram.sendMessage(user.telegram_id, text, { parse_mode: 'HTML' });
          }
          sentCount++;

          // Pin message if requested (ignore errors to avoid affecting delivery stats)
          // Telegram sendPhoto/sendAnimation/sendMessage all return { ok: true, result: { message_id, ... } }
          if (broadcast.pin_message) {
            const msgId = (result?.result as { message_id?: number } | undefined)?.message_id;
            if (msgId) {
              try {
                await telegram.pinChatMessage(user.telegram_id, msgId, { disable_notification: true });
              } catch {
                // Pin failure is non-fatal
              }
            }
          }
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
      'DELETE FROM broadcasts WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete broadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
