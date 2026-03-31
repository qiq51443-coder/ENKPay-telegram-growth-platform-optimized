import { Context, Markup } from 'telegraf';
import { getOrCreateUser } from '../services/user';
import { getSettings } from '../services/settings';
import { t, isSupportedLang } from '../i18n';
import { clearUserState } from '../utils/state';
import axios from 'axios';
import crypto from 'crypto';

const JT_TOKEN_TTL = 86400; // 24 hours — matches backend Redis TTL

export const handleStart = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    // Extract invite code from start parameter (REF_XXXXXXX format)
    const startPayload = ctx.message && 'text' in ctx.message
      ? ctx.message.text.split(' ')[1]
      : undefined;

    let inviteCodeUsed: string | undefined;
    if (startPayload && startPayload.startsWith('REF_')) {
      inviteCodeUsed = startPayload.substring(4); // Extract invite code after REF_
    }

    // Get or create user
    const user = await getOrCreateUser(ctx, botId, inviteCodeUsed);

    // Clear any in-progress flow state so /start always shows a clean view
    await clearUserState(user.id.toString()).catch((err) =>
      console.error('Failed to clear user state on /start:', err)
    );

    // Language priority: Telegram user language (if supported) > Bot default_language > 'en'
    let lang = 'en';
    const telegramLang = ctx.from.language_code;
    if (telegramLang && isSupportedLang(telegramLang)) {
      lang = telegramLang;
    } else {
      try {
        const botRes = await axios.get(`${backendUrl}/api/bots/${botId}`);
        if (botRes.data?.bot?.default_language) {
          lang = botRes.data.bot.default_language;
        }
      } catch {}
    }

    // Get bot settings (welcome message + webapp url)
    const settings = await getSettings(botId);

    // Build welcome message — fixed header always shown, admin message appended below
    const displayId = (user as any).unique_id || (user as any).robot_user_id || 'N/A';
    const balance = ((user as any).wallet_balance ?? (user as any).balance ?? 0).toFixed(2);
    let welcomeText = `🎉 ${t(lang, 'welcome_title')}\n\n` +
      `🆔 ${t(lang, 'your_unique_id')}: <code>${displayId}</code>\n` +
      `💰 ${t(lang, 'your_balance')}: <b>${balance} USDT</b>`;

    if (settings.welcome_message) {
      let customMsg = '';
      if (typeof settings.welcome_message === 'object') {
        customMsg = (settings.welcome_message as any)[lang]
          || (settings.welcome_message as any)['en']
          || (settings.welcome_message as any)[Object.keys(settings.welcome_message as any)[0]]
          || '';
      } else if (typeof settings.welcome_message === 'string') {
        customMsg = (settings.welcome_message as string).trim();
      }
      if (customMsg) {
        welcomeText += `\n\n${customMsg}`;
      }
    }

    const webAppUrl = (settings as any).webapp_url || process.env.WEBAPP_URL || 'https://example.com';

    // ── Steps 1 & 2: Pre-register user + generate one-time jt token (parallel) ─
    const jtToken = crypto.randomBytes(32).toString('hex');
    const [preregResult, jtStoreResult] = await Promise.allSettled([
      axios.post(
        `${backendUrl}/api/miniapp/preregister`,
        {
          telegram_id: ctx.from.id,
          first_name: ctx.from.first_name || '',
          username: ctx.from.username || null,
          language_code: ctx.from.language_code || lang,
        },
        { headers: { 'X-Bot-Id': botId }, timeout: 8000 }
      ),
      axios.post(
        `${backendUrl}/api/miniapp/jt-store`,
        {
          jt: jtToken,
          telegram_id: ctx.from.id,
          bot_id: botId,
          first_name: ctx.from.first_name || '',
          username: ctx.from.username || null,
          language_code: ctx.from.language_code || lang,
          ttl: JT_TOKEN_TTL,
        },
        { headers: { 'X-Bot-Id': botId }, timeout: 8000 }
      ),
    ]);

    if (preregResult.status === 'rejected') {
      const preregErr = (preregResult as PromiseRejectedResult).reason;
      console.warn(`[bot ${botId}] Failed to preregister user:`, preregErr?.message || String(preregErr));
    }

    let finalWebAppUrl = webAppUrl;
    if (jtStoreResult.status === 'fulfilled') {
      const separator = webAppUrl.includes('?') ? '&' : '?';
      finalWebAppUrl = `${webAppUrl}${separator}jt=${jtToken}`;
    } else {
      const err = (jtStoreResult as PromiseRejectedResult).reason;
      const status = err?.response?.status;
      console.warn(`[bot ${botId}] Failed to store jt token (status=${status ?? 'network'}):`, err?.message);
    }

    // Build official links inline keyboard (if configured)
    const officialLinkButtons: ReturnType<typeof Markup.button.url>[] = [];
    if ((settings as any).official_group_url) {
      officialLinkButtons.push(Markup.button.url(t(lang, 'btn_official_group'), (settings as any).official_group_url));
    }
    if ((settings as any).official_channel_url) {
      officialLinkButtons.push(Markup.button.url(t(lang, 'btn_official_channel'), (settings as any).official_channel_url));
    }
    const officialKeyboard = officialLinkButtons.length > 0
      ? Markup.inlineKeyboard([officialLinkButtons])
      : undefined;

    const replyKeyboard = Markup.keyboard([
      [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
    ]).resize();

    // Send welcome content (photo or text) with reply keyboard, then optional official links
    const imageUrl: string | undefined = (settings as any).welcome_image_url || undefined;
    if (imageUrl) {
      if (imageUrl.startsWith('data:')) {
        // base64 Data URL → decode to Buffer → multipart upload to Telegram
        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
          await ctx.replyWithPhoto(
            { source: buffer },
            {
              caption: welcomeText,
              parse_mode: 'HTML',
              reply_markup: replyKeyboard.reply_markup,
            }
          );
        } else {
          await ctx.replyWithHTML(welcomeText, replyKeyboard);
        }
      } else if (imageUrl.startsWith('http')) {
        // Full HTTP URL (legacy)
        await ctx.replyWithPhoto(imageUrl, {
          caption: welcomeText,
          parse_mode: 'HTML',
          reply_markup: replyKeyboard.reply_markup,
        });
      } else {
        // Relative path or unknown format, fall back to text
        console.warn('[startHandler] welcome_image_url is not a valid URL or base64, falling back to text.');
        await ctx.replyWithHTML(welcomeText, replyKeyboard);
      }
    } else {
      await ctx.replyWithHTML(welcomeText, replyKeyboard);
    }
    if (officialKeyboard) {
      await ctx.replyWithHTML('🔗', officialKeyboard);
    }
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
