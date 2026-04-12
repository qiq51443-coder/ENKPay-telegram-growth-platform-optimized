import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { t } from '../i18n';

/**
 * Fetch invite-category settings from the backend's bot-internal endpoint.
 * Bot has no admin token, so it uses the dedicated /bot/invite route with an
 * optional x-bot-token header for lightweight authentication.
 */
async function getInviteSystemSettings(): Promise<Record<string, string>> {
  try {
    const apiBase = process.env.BACKEND_URL || 'http://localhost:3000';
    const botToken = process.env.BOT_INTERNAL_TOKEN || process.env.BOT_API_KEY || '';
    const res = await fetch(`${apiBase}/api/admin/system-settings/bot/invite`, {
      headers: botToken ? { 'x-bot-token': botToken } : {},
    });
    if (!res.ok) return {};
    const data = await res.json();
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

    const botUsername = process.env.BOT_USERNAME || 'your_bot';
    const uniqueId = user.unique_id || user.robot_user_id || user.invite_code;
    const inviteLink = `https://t.me/${botUsername}?start=REF_${uniqueId}`;

    // 1. Fetch invite settings from system_settings (invite card image + multilingual messages)
    const sysSettings = await getInviteSystemSettings();

    // 2. Invite card image – strip surrounding quotes that JSON serialisation may add
    const rawCardImage = sysSettings['invite_card_image'] || '';
    const cardImageUrl = rawCardImage.replace(/^"|"$/g, '').trim();

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

    // 5. Build share URL (opens Telegram forward/share dialog) and keyboard
    const shareText = (inviteTemplate
      ? inviteTemplate.replace(/\{invite_link\}/g, '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()
      : t(lang, 'invite_description')
    ).slice(0, 200);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url(t(lang, 'btn_join_now'), inviteLink)],
      [Markup.button.url(t(lang, 'btn_share'), shareUrl)],
    ]);

    // 6. Send photo/animation card when available; fall back to plain text if delivery fails
    if (cardImageUrl) {
      const apiBase = process.env.BACKEND_URL || 'http://localhost:3000';
      const photoUrl = cardImageUrl.startsWith('http')
        ? cardImageUrl
        : `${apiBase}${cardImageUrl}`;

      const isGif = /\.gif(\?|$)/i.test(photoUrl);

      try {
        if (isGif) {
          await ctx.replyWithAnimation(photoUrl, {
            caption: inviteText,
            parse_mode: 'HTML',
            ...keyboard,
          });
        } else {
          await ctx.replyWithPhoto(photoUrl, {
            caption: inviteText,
            parse_mode: 'HTML',
            ...keyboard,
          });
        }
        return;
      } catch (mediaErr) {
        console.error('[invite] Media send failed, falling back to text:', mediaErr);
      }
    }

    await ctx.replyWithHTML(inviteText, keyboard);
  } catch (error) {
    console.error('Invite handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

function buildDefaultInviteText(lang: string, inviteLink: string): string {
  return (
    `${t(lang, 'invite_title')}\n\n` +
    `${t(lang, 'invite_description')}\n\n` +
    `🔗 ${t(lang, 'your_invite_link')}:\n` +
    `${inviteLink}\n\n` +
    t(lang, 'invite_share_hint')
  );
}
