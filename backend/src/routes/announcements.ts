import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import TelegramAPI from '../utils/telegram';

const router = express.Router();

router.use(adminLimiter);

/**
 * GET /api/announcements
 * List announcements
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;

    let queryText = `SELECT * FROM announcements WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }

    queryText += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await query(queryText, params);
    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/announcements
 * Create announcement
 */
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      content,
      images,
      targets,
      scheduled_at,
      expires_at,
      is_pinned,
      show_on_app_launch,
      announcement_bot_id,
      target_group_ids,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await query(
      `INSERT INTO announcements
         (title, content, images, targets, scheduled_at, expires_at, is_pinned, show_on_app_launch, status, announcement_bot_id, target_group_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10)
       RETURNING *`,
      [
        title,
        content,
        images || [],
        targets || [],
        scheduled_at || null,
        expires_at || null,
        is_pinned || false,
        show_on_app_launch || false,
        announcement_bot_id || null,
        target_group_ids || [],
      ]
    );

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/announcements/:id
 * Update announcement
 */
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      images,
      targets,
      scheduled_at,
      expires_at,
      is_pinned,
      show_on_app_launch,
      status,
      announcement_bot_id,
      target_group_ids,
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { params.push(title); updates.push(`title = $${params.length}`); }
    if (content !== undefined) { params.push(content); updates.push(`content = $${params.length}`); }
    if (images !== undefined) { params.push(images); updates.push(`images = $${params.length}`); }
    if (targets !== undefined) { params.push(targets); updates.push(`targets = $${params.length}`); }
    if (scheduled_at !== undefined) { params.push(scheduled_at); updates.push(`scheduled_at = $${params.length}`); }
    if (expires_at !== undefined) { params.push(expires_at); updates.push(`expires_at = $${params.length}`); }
    if (is_pinned !== undefined) { params.push(is_pinned); updates.push(`is_pinned = $${params.length}`); }
    if (show_on_app_launch !== undefined) { params.push(show_on_app_launch); updates.push(`show_on_app_launch = $${params.length}`); }
    if (status !== undefined) { params.push(status); updates.push(`status = $${params.length}`); }
    if (announcement_bot_id !== undefined) { params.push(announcement_bot_id || null); updates.push(`announcement_bot_id = $${params.length}`); }
    if (target_group_ids !== undefined) { params.push(target_group_ids); updates.push(`target_group_ids = $${params.length}`); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/announcements/:id/send
 * Send announcement via Telegram and mark as sent
 */
router.post('/:id/send', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const annResult = await query(
      `SELECT * FROM announcements WHERE id = $1`,
      [id]
    );

    if (annResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = annResult.rows[0];
    const targets: string[] = announcement.targets || [];
    const images: string[] = announcement.images || [];
    const targetGroupIds: string[] = announcement.target_group_ids || [];

    let sentCount = 0;
    let failedCount = 0;

    const BATCH_SIZE = 25;
    const BATCH_DELAY_MS = 1000;

    const escapeHtml = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Helper to send a single message to one chatId
    const sendToChat = async (telegram: TelegramAPI, chatId: number | string) => {
      const caption = `<b>${escapeHtml(announcement.title)}</b>\n\n${announcement.content}`;
      if (images.length > 0) {
        await telegram.sendPhoto(chatId, images[0], { caption, parse_mode: 'HTML' });
      } else {
        await telegram.sendMessage(chatId, caption, { parse_mode: 'HTML' });
      }
    };

    // Send to groups/channels
    if (targets.includes('groups') && announcement.announcement_bot_id && targetGroupIds.length > 0) {
      const botResult = await query('SELECT token FROM bots WHERE id = $1', [announcement.announcement_bot_id]);
      if (botResult.rows.length > 0) {
        const telegram = new TelegramAPI(botResult.rows[0].token);
        for (let i = 0; i < targetGroupIds.length; i += BATCH_SIZE) {
          const batch = targetGroupIds.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (chatId) => {
            try {
              await sendToChat(telegram, chatId);
              sentCount++;
            } catch (err) {
              console.error('Failed to send announcement to group:', chatId, err);
              failedCount++;
            }
          }));
          if (i + BATCH_SIZE < targetGroupIds.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }
        }
      }
    }

    // Send to users (via the same announcement_bot_id)
    if (targets.includes('users') && announcement.announcement_bot_id) {
      const botResult = await query('SELECT token FROM bots WHERE id = $1', [announcement.announcement_bot_id]);
      if (botResult.rows.length > 0) {
        const telegram = new TelegramAPI(botResult.rows[0].token);
        const usersResult = await query(
          'SELECT telegram_id FROM users WHERE bot_id = $1',
          [announcement.announcement_bot_id]
        );
        for (let i = 0; i < usersResult.rows.length; i += BATCH_SIZE) {
          const batch = usersResult.rows.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (user) => {
            try {
              await sendToChat(telegram, user.telegram_id);
              sentCount++;
            } catch (err) {
              console.error('Failed to send announcement to user:', user.telegram_id, err);
              failedCount++;
            }
          }));
          if (i + BATCH_SIZE < usersResult.rows.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }
        }
      }
    }

    // 'app' target: just mark as sent (front-end pulls announcements)

    const result = await query(
      `UPDATE announcements SET status = 'sent', sent_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    res.json({ announcement: result.rows[0], sent_count: sentCount, failed_count: failedCount });
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/announcements/:id
 */
router.delete('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM announcements WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
