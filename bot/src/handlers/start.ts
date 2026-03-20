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

    // Build welcome message
    const welcomeText = settings.welcome_message ||
      `🎉 ${t(lang, 'welcome_title')}\n\n` +
      `🆔 ${t(lang, 'your_unique_id')}: <b>${user.unique_id || user.robot_user_id || 'N/A'}</b>\n` +
      `💰 ${t(lang, 'your_balance')}: <b>${((user as any).wallet_balance ?? user.balance ?? 0).toFixed(2)}</b>\n\n` +
      t(lang, 'welcome_description');

    const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL || 'https://example.com';

    // ── Steps 1 & 2: Pre-register user + generate one-time jt token (parallel) ─
    // Running both requests concurrently reduces Bot response latency.
    // Generate the jt token upfront so we can build the WebApp URL after the call.
    const jtToken = crypto.randomBytes(32).toString('hex');
    const [preregResult, jtStoreResult] = await Promise.allSettled([
      // Step 1: Pre-register / refresh user info (fire-and-forget)
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
      // Step 2: Store jt token in backend Redis so Mini App can exchange it for a session.
      // This bypasses Telegram initData HMAC entirely — the Mini App reads ?jt=
      // from the URL on mount (no SDK needed) and exchanges it for a session.
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
      // Append ?jt= to WebApp URL so Mini App can read it on mount
      const separator = webAppUrl.includes('?') ? '&' : '?';
      finalWebAppUrl = `${webAppUrl}${separator}jt=${jtToken}`;
    } else {
      const err = (jtStoreResult as PromiseRejectedResult).reason;
      const status = err?.response?.status;
      console.warn(`[bot ${botId}] Failed to store jt token (status=${status ?? 'network'}):`, err?.message);
      // Graceful degradation: Mini App falls back to initData auth
    }

    // Send welcome text with reply keyboard (wallet + invite buttons only).
    // The "Open App" WebApp button is now in the wallet card inline keyboard,
    // where it properly injects initData AND includes a fresh ?jt= token.
    await ctx.replyWithHTML(
      welcomeText,
      Markup.keyboard([
        [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
      ]).resize()
    );
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
