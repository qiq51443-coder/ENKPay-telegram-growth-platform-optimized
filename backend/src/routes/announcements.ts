import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import TelegramAPI from '../utils/telegram';
import { translateToAllLangs } from '../utils/translate';

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
      support_telegram,
      show_open_bot_button,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // If targets don't include 'app', force show_on_app_launch to false
    const effectiveShowOnAppLaunch = (targets || []).includes('app') ? (show_on_app_launch || false) : false;

    const result = await query(
      `INSERT INTO announcements
         (title, content, images, targets, scheduled_at, expires_at, is_pinned, show_on_app_launch, status, announcement_bot_id, target_group_ids, support_telegram, show_open_bot_button)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12)
       RETURNING *`,
      [
        title,
        content,
        images || [],
        targets || [],
        scheduled_at || null,
        expires_at || null,
        is_pinned || false,
        effectiveShowOnAppLaunch,
        announcement_bot_id || null,
        target_group_ids || [],
        support_telegram || null,
        show_open_bot_button || false,
      ]
    );

    const announcement = result.rows[0];

    // Auto-translate content and title, then update DB
    const [contentTranslations, titleTranslations] = await Promise.all([
      translateToAllLangs(content),
      translateToAllLangs(title || ''),
    ]);

    await query(
      'UPDATE announcements SET content_translations = $1, title_translations = $2 WHERE id = $3',
      [JSON.stringify(contentTranslations), JSON.stringify(titleTranslations), announcement.id]
    );

    announcement.content_translations = contentTranslations;
    announcement.title_translations = titleTranslations;

    res.json({ announcement });
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
      support_telegram,
      show_open_bot_button,
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
    if (show_on_app_launch !== undefined) {
      // If targets are being updated, enforce the guard; otherwise read current targets from DB later
      const effectiveTargets = targets !== undefined ? targets : null;
      const effectiveShowOnAppLaunch = effectiveTargets !== null
        ? ((effectiveTargets as string[]).includes('app') ? (show_on_app_launch || false) : false)
        : (show_on_app_launch || false);
      params.push(effectiveShowOnAppLaunch);
      updates.push(`show_on_app_launch = $${params.length}`);
    }
    if (status !== undefined) { params.push(status); updates.push(`status = $${params.length}`); }
    if (announcement_bot_id !== undefined) { params.push(announcement_bot_id || null); updates.push(`announcement_bot_id = $${params.length}`); }
    if (target_group_ids !== undefined) { params.push(target_group_ids); updates.push(`target_group_ids = $${params.length}`); }
    if (support_telegram !== undefined) { params.push(support_telegram || null); updates.push(`support_telegram = $${params.length}`); }
    if (show_open_bot_button !== undefined) { params.push(show_open_bot_button || false); updates.push(`show_open_bot_button = $${params.length}`); }

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

    const announcement = result.rows[0];

    // If content or title changed, re-translate only the changed fields
    if (content !== undefined || title !== undefined) {
      const [newContentTranslations, newTitleTranslations] = await Promise.all([
        content !== undefined ? translateToAllLangs(content || '') : Promise.resolve(announcement.content_translations || {}),
        title !== undefined ? translateToAllLangs(title || '') : Promise.resolve(announcement.title_translations || {}),
      ]);
      await query(
        'UPDATE announcements SET content_translations = $1, title_translations = $2 WHERE id = $3',
        [JSON.stringify(newContentTranslations), JSON.stringify(newTitleTranslations), id]
      );
      announcement.content_translations = newContentTranslations;
      announcement.title_translations = newTitleTranslations;
    }

    res.json({ announcement });
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
    const contentTranslations: Record<string, string> = announcement.content_translations || {};
    const titleTranslations: Record<string, string> = announcement.title_translations || {};

    let sentCount = 0;
    let failedCount = 0;
    const sentMessageIds: Record<string, number> = {};

    const BATCH_SIZE = 25;
    const BATCH_DELAY_MS = 1100;

    const CONTACT_SUPPORT_LABELS: Record<string, string> = {
      zh: '🎧 联系客服', en: '🎧 Contact Support', fr: '🎧 Contacter le support',
      de: '🎧 Support kontaktieren', es: '🎧 Contactar soporte', ar: '🎧 تواصل مع الدعم', ja: '🎧 サポートに連絡',
    };
    const OPEN_BOT_LABELS: Record<string, string> = {
      zh: '🤖 打开Bot', en: '🤖 Open Bot', fr: '🤖 Ouvrir le Bot',
      de: '🤖 Bot öffnen', es: '🤖 Abrir el Bot', ar: '🤖 فتح البوت', ja: '🤖 Botを開く',
    };

    // Pre-fetch bot username if show_open_bot_button is enabled
    let botUsername: string | null = null;
    if (announcement.show_open_bot_button && announcement.announcement_bot_id) {
      const botInfo = await query('SELECT username FROM bots WHERE id = $1', [announcement.announcement_bot_id]);
      botUsername = botInfo.rows[0]?.username || null;
    }

    const getLocalizedMessage = (lang: string | null): string => {
      const safeLang = lang && contentTranslations[lang] ? lang : (contentTranslations['en'] ? 'en' : null);
      const title = (safeLang ? titleTranslations[safeLang] : null) || announcement.title || '';
      const content = (safeLang ? contentTranslations[safeLang] : null) || announcement.content || '';
      return title ? `<b>${title}</b>\n\n${content}` : content;
    };

    // Helper to send a single message to one chatId with optional language
    // Returns the message_id from Telegram response, or null on failure
    const sendToChat = async (
      telegram: TelegramAPI,
      chatId: number | string,
      lang?: string | null,
      isGroupTarget: boolean = false,
    ): Promise<{ message_id: number } | null> => {
      const text = getLocalizedMessage(lang ?? null);
      const safeLang = lang && CONTACT_SUPPORT_LABELS[lang] ? lang : 'en';

      // Build inline keyboard buttons
      const buttons: any[] = [];
      if (announcement.support_telegram) {
        buttons.push({
          text: CONTACT_SUPPORT_LABELS[safeLang] || CONTACT_SUPPORT_LABELS['en'],
          url: `https://t.me/${announcement.support_telegram}`,
        });
      }
      if (isGroupTarget && announcement.show_open_bot_button && botUsername) {
        buttons.push({
          text: OPEN_BOT_LABELS[safeLang] || OPEN_BOT_LABELS['en'],
          url: `https://t.me/${botUsername}?start=ref`,
        });
      }
      const reply_markup = buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined;

      let response: any;
      const imageUrl = images.length > 0 ? images[0] : null;
      const base64Match = imageUrl ? imageUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
      let isGif = false;
      if (base64Match) {
        isGif = base64Match[1] === 'image/gif';
      } else if (imageUrl) {
        isGif = /\.gif(\?|$)/i.test(imageUrl);
      }
      if (imageUrl && base64Match) {
        const mimeType = base64Match[1];
        const buffer = Buffer.from(base64Match[2], 'base64');
        if (isGif) {
          response = await telegram.sendAnimationBuffer(chatId, buffer, mimeType, {
            caption: text,
            parse_mode: 'HTML',
            ...(reply_markup ? { reply_markup } : {}),
          });
        } else {
          response = await telegram.sendPhotoBuffer(chatId, buffer, mimeType, {
            caption: text,
            parse_mode: 'HTML',
            ...(reply_markup ? { reply_markup } : {}),
          });
        }
      } else if (imageUrl && isGif) {
        response = await telegram.sendAnimation(chatId, imageUrl, {
          caption: text,
          parse_mode: 'HTML',
          ...(reply_markup ? { reply_markup } : {}),
        });
      } else if (imageUrl) {
        response = await telegram.sendPhoto(chatId, imageUrl, {
          caption: text,
          parse_mode: 'HTML',
          ...(reply_markup ? { reply_markup } : {}),
        });
      } else {
        response = await telegram.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          ...(reply_markup ? { reply_markup } : {}),
        });
      }

      const messageId = response?.result?.message_id;
      return messageId ? { message_id: messageId } : null;
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
              // Groups use default language (zh if available, else en)
              const groupLang = contentTranslations['zh'] ? 'zh' : 'en';
              const result = await sendToChat(telegram, chatId, groupLang, true);
              if (result) sentMessageIds[String(chatId)] = result.message_id;
              sentCount++;
            } catch (err: any) {
              console.error('Failed to send announcement to group:', chatId, err?.response?.data || err?.message);
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
          'SELECT telegram_id, language_code FROM users WHERE bot_id = $1 AND telegram_id IS NOT NULL',
          [announcement.announcement_bot_id]
        );
        for (let i = 0; i < usersResult.rows.length; i += BATCH_SIZE) {
          const batch = usersResult.rows.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (user) => {
            try {
              const result = await sendToChat(telegram, user.telegram_id, user.language_code, false);
              if (result) sentMessageIds[String(user.telegram_id)] = result.message_id;
              sentCount++;
            } catch (err: any) {
              console.error('Failed to send announcement to user:', user.telegram_id, err?.response?.data || err?.message);
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

    // Store sent_message_ids and mark as sent
    const result = await query(
      `UPDATE announcements SET status = 'sent', sent_at = NOW(), sent_message_ids = $2 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(sentMessageIds)]
    );

    // Pin messages if is_pinned is set
    if (announcement.is_pinned && Object.keys(sentMessageIds).length > 0 && announcement.announcement_bot_id) {
      const botResult = await query('SELECT token FROM bots WHERE id = $1', [announcement.announcement_bot_id]);
      if (botResult.rows.length > 0) {
        const telegram = new TelegramAPI(botResult.rows[0].token);
        for (const [chatId, messageId] of Object.entries(sentMessageIds)) {
          try {
            await telegram.pinChatMessage(chatId, messageId);
          } catch (err: any) {
            console.error('Failed to pin message in chat:', chatId, err?.response?.data || err?.message);
          }
        }
      }
    }

    res.json({ announcement: result.rows[0], sent_count: sentCount, failed_count: failedCount });
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/announcements/:id/messages
 * Delete all Telegram messages sent for this announcement
 */
router.delete('/:id/messages', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const annResult = await query('SELECT sent_message_ids, announcement_bot_id FROM announcements WHERE id = $1', [id]);
    if (annResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = annResult.rows[0];
    const sentMessageIds: Record<string, number> = announcement.sent_message_ids || {};

    if (!announcement.announcement_bot_id) {
      return res.json({ success: true, deleted_count: 0, failed_count: 0 });
    }

    const botResult = await query('SELECT token FROM bots WHERE id = $1', [announcement.announcement_bot_id]);
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const telegram = new TelegramAPI(botResult.rows[0].token);
    let deletedCount = 0;
    let failedCount = 0;

    for (const [chatId, messageId] of Object.entries(sentMessageIds)) {
      try {
        await telegram.deleteMessage(chatId, Number(messageId));
        deletedCount++;
      } catch (err: any) {
        console.error('Failed to delete message in chat:', chatId, messageId, err?.response?.data || err?.message);
        failedCount++;
      }
    }

    await query('UPDATE announcements SET sent_message_ids = $1 WHERE id = $2', [JSON.stringify({}), id]);

    res.json({ success: true, deleted_count: deletedCount, failed_count: failedCount });
  } catch (error) {
    console.error('Delete announcement messages error:', error);
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
