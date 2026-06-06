import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage, User } from '../services/user';
import { getUser as getUserFromAPI } from '../services/api';
import { t } from '../i18n';
import { animateEmojis } from '../utils/animate-emojis';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

/**
 * Fetch the bot's Telegram username from the backend API.
 * Used as a fallback when ctx.botInfo is unavailable.
 */
async function fetchBotUsername(botId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/bots/${botId}`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return (data?.bot?.username as string) || null;
  } catch {
    return null;
  }
}

/**
 * Fetch invite-category settings from the backend's bot-internal endpoint.
 * Bot has no admin token, so it uses the dedicated /bot/invite route with an
 * optional x-bot-token header for lightweight authentication.
 */
async function getInviteSystemSettings(botId: string): Promise<Record<string, string>> {
  try {
    const botToken = process.env.BOT_INTERNAL_TOKEN || process.env.BOT_API_KEY || '';
    const res = await fetch(`${BACKEND_URL}/api/admin/system-settings/bot/invite`, {
      headers: {
        ...(botToken ? { 'x-bot-token': botToken } : {}),
        'x-bot-id': botId,
      },
    });
    if (!res.ok) return {};
    const data = await res.json() as Record<string, string>;
    return data || {};
  } catch {
    return {};
  }
}

export const handleInvite = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    await sendInviteCard(ctx, user, botId, lang);
  } catch (error) {
    console.error('Invite handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

/**
 * Sends invite card message (GIF/image + caption + buttons).
 * Can be called from invite handler and start handler
 * (when new user registers via invite link).
 */
export async function sendInviteCard(
  ctx: Context,
  user: User,
  botId: string,
  lang: string
): Promise<void> {
  try {
    // Bot username resolution priority:
    // 1. Telegraf runtime ctx.botInfo (most reliable in multi-bot mode)
    // 2. Backend API GET /api/bots/{botId}
    // 3. BOT_USERNAME env var
    const botUsername =
      (ctx as any).botInfo?.username ||
      (await fetchBotUsername(botId)) ||
      process.env.BOT_USERNAME ||
      'your_bot';

    const uniqueId = user.unique_id || user.robot_user_id || user.invite_code;
    const inviteLink = `https://t.me/${botUsername}?start=REF_${uniqueId}`;

    // 1. Fetch invite settings from system_settings (invite card image + multilingual messages)
    const sysSettings = await getInviteSystemSettings(botId);

    // 2. Invite card image – strip surrounding quotes that JSON serialisation may add
    const rawCardImage = sysSettings['invite_card_image'] || '';
    const cardImageUrl = rawCardImage.replace(/^"|"$/g, '').trim();
    let mediaUrl = '';
    if (cardImageUrl) {
      mediaUrl = cardImageUrl.startsWith('http') ? cardImageUrl : `${BACKEND_URL}${cardImageUrl}`;
    }

    // 3. Multilingual invite message – priority: user lang → English → generic → built-in
    const langKey = `invite_message_${lang}`;
    const rawMessage =
      sysSettings[langKey] ||
      sysSettings['invite_message_en'] ||
      sysSettings['invite_message'] ||
      '';
    const inviteTemplate = rawMessage.replace(/^"|"$/g, '').trim();

    // 4. Replace {invite_link} placeholder; fall back to built-in i18n text
    const inviteText = inviteTemplate
      ? inviteTemplate.replace(/\{invite_link\}/g, inviteLink)
      : buildDefaultInviteText(lang, inviteLink);
    const animatedInviteText = await animateEmojis(inviteText);

    // 5. Build share URL (opens Telegram forward/share dialog) and keyboard
    // Strip {invite_link} placeholder, HTML tags, HTML entities, and extra whitespace
    const shareText = (inviteTemplate
      ? inviteTemplate
          .replace(/\{invite_link\}/g, '')
          .replace(/&(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);/g, '')
          .replace(/[<>]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : t(lang, 'invite_description')
    ).slice(0, 200);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url(t(lang, 'btn_join_now'), inviteLink)],
      [Markup.button.switchToChat(t(lang, 'btn_share'), `inv_${uniqueId}`)],
    ]);

    // 6. Send photo/animation card when available; fall back to plain text if delivery fails
    if (mediaUrl) {
      const isGif = /\.gif(\?|$)/i.test(mediaUrl);

      try {
        if (isGif) {
          await ctx.replyWithAnimation(mediaUrl, {
          caption: animatedInviteText,
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        } else {
          await ctx.replyWithPhoto(mediaUrl, {
          caption: animatedInviteText,
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        }
        return;
      } catch (mediaErr) {
        console.error('[inviteCard] Media send failed, falling back to text:', mediaErr);
      }
    }

    await ctx.replyWithHTML(animatedInviteText, keyboard);
  } catch (err) {
    console.error('[sendInviteCard] Unexpected error:', err);
    try {
      const uniqueId = user.unique_id || user.robot_user_id || user.invite_code || '';
      const fallbackLink = `https://t.me/${process.env.BOT_USERNAME || 'your_bot'}?start=REF_${uniqueId}`;
      const fallbackText = await animateEmojis(buildDefaultInviteText(lang, fallbackLink));
      await ctx.replyWithHTML(fallbackText);
    } catch {
      // Swallow all fallback errors to ensure this helper never crashes caller flow.
    }
  }
}

export async function handleInlineQuery(ctx: Context, botId: string): Promise<void> {
  const inlineQuery = (ctx as any).inlineQuery;
  const queryText = (inlineQuery?.query || '').trim();
  if (!queryText.startsWith('inv_')) {
    await ctx.answerInlineQuery([]);
    return;
  }

  const uniqueId = queryText.slice(4).trim();
  if (!uniqueId) {
    await ctx.answerInlineQuery([], { cache_time: 0 });
    return;
  }

  const botUsername =
    (ctx as any).botInfo?.username ||
    (await fetchBotUsername(botId)) ||
    process.env.BOT_USERNAME ||
    'your_bot';
  const inviteLink = `https://t.me/${botUsername}?start=REF_${uniqueId}`;

  const sysSettings = await getInviteSystemSettings(botId);
  const rawCardImage = sysSettings['invite_card_image'] || '';
  const cardImageUrl = rawCardImage.replace(/^"|"$/g, '').trim();
  const mediaUrl = cardImageUrl
    ? (cardImageUrl.startsWith('http') ? cardImageUrl : `${BACKEND_URL}${cardImageUrl}`)
    : '';

  let lang = 'en';
  try {
    if (ctx.from?.id) {
      const dbUser = await getUserFromAPI(botId, ctx.from.id);
      lang = dbUser?.language_code || ctx.from.language_code || 'en';
    }
  } catch {
    lang = ctx.from?.language_code || 'en';
  }

  const langKey = `invite_message_${lang}`;
  const rawMessage =
    sysSettings[langKey] ||
    sysSettings['invite_message_en'] ||
    sysSettings['invite_message'] ||
    '';
  const inviteTemplate = rawMessage.replace(/^"|"$/g, '').trim();
  const inviteText = inviteTemplate
    ? inviteTemplate.replace(/\{invite_link\}/g, inviteLink)
    : buildDefaultInviteText(lang, inviteLink);
  const plainCaption = inviteText
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .slice(0, 1024);

  const joinKeyboard = Markup.inlineKeyboard([
    [Markup.button.url(t(lang, 'btn_join_now'), inviteLink)],
  ]);

  if (mediaUrl) {
    const isGif = /\.gif(\?|$)/i.test(mediaUrl);
    if (isGif) {
      try {
        await ctx.answerInlineQuery([
          {
            type: 'gif',
            id: `invite_gif_${uniqueId}`,
            gif_url: mediaUrl,
            gif_mime_type: 'image/gif',
            thumbnail_url: mediaUrl,
            thumbnail_mime_type: 'image/gif',
            title: t(lang, 'invite_title'),
            caption: plainCaption,
            reply_markup: joinKeyboard.reply_markup,
          } as any,
        ], { cache_time: 0 });
        return;
      } catch (gifErr) {
        console.warn('[inline] GIF result failed, falling back to article:', gifErr);
      }
    }

    try {
      await ctx.answerInlineQuery([
        {
          type: 'photo',
          id: `invite_photo_${uniqueId}`,
          photo_url: mediaUrl,
          thumbnail_url: mediaUrl,
          title: t(lang, 'invite_title'),
          caption: plainCaption,
          reply_markup: joinKeyboard.reply_markup,
        },
      ], { cache_time: 0 });
      return;
    } catch (photoErr) {
      console.warn('[inline] Photo result failed, falling back to article:', photoErr);
    }
  }

  await ctx.answerInlineQuery([
    {
      type: 'article',
      id: `invite_text_${uniqueId}`,
      title: t(lang, 'invite_title'),
      description: t(lang, 'invite_description'),
      input_message_content: {
        message_text: plainCaption || inviteLink,
      },
      reply_markup: joinKeyboard.reply_markup,
    },
  ], { cache_time: 0 });
}

function buildDefaultInviteText(lang: string, inviteLink: string): string {
  return (
    `${t(lang, 'invite_title')}\n\n` +
    `${t(lang, 'invite_description')}\n\n` +
    `🔗 ${t(lang, 'your_invite_link')}:\n` +
    `${inviteLink}\n\n` +
    t(lang, 'invite_share_hint')
  );
}
