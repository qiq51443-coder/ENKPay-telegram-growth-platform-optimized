import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage, User } from '../services/user';
import { getSettings } from '../services/settings';
import { t } from '../i18n';
import axios from 'axios';

export const handleWallet = async (ctx: Context, preloadedUser?: User) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    // Use preloaded user if available; otherwise fetch; fall back to ctx.from on failure
    let user: User | undefined = preloadedUser;
    if (!user) {
      try {
        user = await getOrCreateUser(ctx, botId);
      } catch (err) {
        console.error('[handleWallet] getOrCreateUser failed, using fallback:', err);
        user = {
          id: String(ctx.from.id),
          bot_id: botId,
          telegram_id: ctx.from.id,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
          language_code: ctx.from.language_code || 'en',
          robot_user_id: String(ctx.from.id),
          invite_code: '',
          balance: 0,
          platform_bound: false,
          platform_status: 'pending',
          account_status: 'active',
          channel_followed: false,
          group_joined: false,
          follow_reward_unlocked: false,
          bind_reward_unlocked: false,
          red_packet_credits: 0,
          red_packet_balance: 0,
          registered_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        } as User;
      }
    }

    const lang = getUserLanguage(user);

    // Fetch latest balance details from backend
    let balance = parseFloat(String(user.wallet_balance ?? user.balance)) || 0;
    // red_packet_balance is the canonical field; fall back to red_packet_credits for older records
    let redPacketBalance = parseFloat(String(user.red_packet_balance ?? user.red_packet_credits ?? 0)) || 0;
    let nftBalance = 0;
    let balanceFetchFailed = false;
    try {
      const botToken = process.env.BOT_TOKEN || botId;
      const res = await axios.get(`${backendUrl}/api/users/telegram/${ctx.from.id}`, {
        headers: { 'X-Bot-Token': botToken },
        timeout: 5000,
      });
      if (res.data?.user) {
        const u = res.data.user;
        // wallet_balance is the canonical balance field
        if (u.wallet_balance !== undefined) balance = parseFloat(String(u.wallet_balance)) || 0;
        else if (u.balance !== undefined) balance = parseFloat(String(u.balance)) || 0;
        // red_packet_balance is the canonical red packet field (not reward_balance)
        if (u.red_packet_balance !== undefined) redPacketBalance = parseFloat(String(u.red_packet_balance)) || 0;
        else if (u.red_packet_credits !== undefined) redPacketBalance = parseFloat(String(u.red_packet_credits)) || 0;
        // nft_balance is the canonical NFT field
        if (u.nft_balance !== undefined) nftBalance = parseFloat(String(u.nft_balance)) || 0;
      }
    } catch {
      balanceFetchFailed = true;
    }

    // Fetch settings to get support_telegram
    let supportUsername = '';
    try {
      const settings = await getSettings(botId);
      supportUsername = settings?.support_telegram || '';
    } catch {}

    const displayId = user.unique_id || user.robot_user_id || String(ctx.from.id);
    const message =
      `💰 <b>${t(lang, 'wallet_title')}</b>\n\n` +
      `🆔 ${t(lang, 'your_unique_id')}: <code>${displayId}</code>\n` +
      `💵 ${t(lang, 'wallet_balance')} (USDT): <b>${balance.toFixed(2)}</b>\n` +
      `🎁 ${t(lang, 'redpacket_balance')}: <b>${redPacketBalance.toFixed(2)}</b>\n` +
      `🖼 ${t(lang, 'nft_holdings')} (USDT): <b>${nftBalance.toFixed(2)}</b>\n` +
      (balanceFetchFailed ? `\n${t(lang, 'balance_stale_warning')}` : '');

    const supportButton = supportUsername
      ? Markup.button.url(t(lang, 'btn_contact_support'), `https://t.me/${supportUsername}`)
      : Markup.button.callback(t(lang, 'btn_contact_support'), 'wallet_support');

    await ctx.replyWithHTML(message, Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn_deposit'), 'wallet_deposit'),
        Markup.button.callback(t(lang, 'btn_transfer'), 'wallet_transfer'),
      ],
      [
        Markup.button.callback(t(lang, 'btn_withdraw'), 'wallet_withdraw'),
      ],
      [
        supportButton,
        Markup.button.callback('🌐 Language', 'wallet_language'),
      ],
      [
        Markup.button.callback(t(lang, 'btn_back'), 'wallet_back'),
      ],
    ]));
  } catch (error) {
    console.error('Wallet handler error:', error);
    try {
      await ctx.reply(t('en', 'error'));
    } catch {}
  }
};
