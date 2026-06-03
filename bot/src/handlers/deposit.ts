import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { api, getSettings } from '../services/api';
import { t } from '../i18n';
import { getBotMessageEmojiConfig, getEmoji, renderHeader } from '../utils/emoji-config';

// Simple in-memory cache for the networks list to avoid a backend round-trip on every address display
let networksCache: { data: any[]; ts: number } | null = null;
let networksFetchInFlight: Promise<any[]> | null = null;
const NETWORKS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchNetworks(botId: string): Promise<any[]> {
  const now = Date.now();
  if (networksCache && now - networksCache.ts < NETWORKS_CACHE_TTL) {
    return networksCache.data;
  }
  // Deduplicate concurrent in-flight requests (Node.js single-threaded, but async)
  if (!networksFetchInFlight) {
    networksFetchInFlight = api
      .get('/api/wallet/networks', { headers: { 'X-Bot-Token': botId } })
      .then((res) => {
        const networks: any[] = res.data?.data || [];
        networksCache = { data: networks, ts: Date.now() };
        networksFetchInFlight = null;
        return networks;
      })
      .catch((err) => {
        networksFetchInFlight = null;
        throw err;
      });
  }
  return networksFetchInFlight;
}

export const handleDepositSelectNetwork = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    await ctx.answerCbQuery().catch(() => {});

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const emojiConfig = await getBotMessageEmojiConfig();
    const header = renderHeader(emojiConfig);

    // Dynamically load active networks from backend (cached)
    let networkButtons: ReturnType<typeof Markup.button.callback>[][] = [];
    try {
      const networks = await fetchNetworks(botId);
      const active = networks.filter((n: any) => n.is_active);
      networkButtons = active.map((n: any) => [
        Markup.button.callback(
          n.network_display || n.network_name,
          `deposit_net_${n.id}`
        ),
      ]);
    } catch (err) {
      console.error('Failed to load deposit networks:', err);
    }

    if (networkButtons.length === 0) {
      const msg = `${header}${getEmoji(emojiConfig, 'field_deposit')} <b>${t(lang, 'btn_deposit')}</b>\n\n${getEmoji(emojiConfig, 'emoji_warning')} No deposit networks configured.`;
      try {
        await ctx.editMessageText(msg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]]),
        });
      } catch {
        await ctx.replyWithHTML(msg, Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]]));
      }
      return;
    }

    networkButtons.push([Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')]);

    const msgText = `${header}${getEmoji(emojiConfig, 'field_deposit')} <b>${t(lang, 'btn_deposit')}</b>\n\n${t(lang, 'deposit_select_network_title')}`;
    try {
      await ctx.editMessageText(msgText, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(networkButtons),
      });
    } catch {
      await ctx.replyWithHTML(msgText, Markup.inlineKeyboard(networkButtons));
    }
  } catch (error) {
    console.error('Deposit select network error:', error);
  }
};

export const handleDepositShowAddress = async (ctx: Context, networkId: string) => {
  try {
    if (!ctx.from) return;

    await ctx.answerCbQuery().catch(() => {});

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const emojiConfig = await getBotMessageEmojiConfig();
    const header = renderHeader(emojiConfig);

    // Show loading state immediately; track the sent message so we can edit it later
    const loadingMsg = `${header}${getEmoji(emojiConfig, 'field_deposit')} <b>${t(lang, 'deposit_address')}</b>\n\n${getEmoji(emojiConfig, 'emoji_pending')} ${t(lang, 'deposit_generating_address')}`;
    let loadingSent: { chat: { id: number }; message_id: number } | null = null;
    try {
      await ctx.editMessageText(loadingMsg, { parse_mode: 'HTML' });
    } catch {
      loadingSent = (await ctx.replyWithHTML(loadingMsg).catch(() => null)) as { chat: { id: number }; message_id: number } | null;
    }

    // Helper: edit the loading message if we sent one via reply, otherwise use ctx.editMessageText
    const editOrReply = async (html: string, keyboard: any) => {
      if (loadingSent) {
        try {
          await ctx.telegram.editMessageText(
            loadingSent!.chat.id, loadingSent!.message_id, undefined, html,
            { parse_mode: 'HTML', ...keyboard }
          );
          return;
        } catch {}
      }
      try {
        await ctx.editMessageText(html, { parse_mode: 'HTML', ...keyboard });
      } catch {
        await ctx.replyWithHTML(html, keyboard);
      }
    };

    // Get network display info via single-network endpoint (avoids fetching full list)
    let networkLabel = networkId;
    let minDeposit = '';
    try {
      const netRes = await api.get(`/api/wallet/networks/${networkId}`, {
        headers: { 'X-Bot-Token': botId },
      });
      const net = netRes.data?.data;
      if (net) {
        networkLabel = net.network_display || net.network_name;
        if (net.min_deposit_amount) {
          minDeposit = `\n${getEmoji(emojiConfig, 'field_min')} Min: <b>${parseFloat(String(net.min_deposit_amount)).toFixed(2)} USDT</b>`;
        }
      }
    } catch {}

    // Request/fetch deposit address (triggers HD derivation if not yet created)
    let address = '';
    try {
      const res = await api.get(`/api/wallet/deposit-address/${user.id}`, {
        headers: { 'X-Bot-Token': botId },
        params: { network_id: networkId },
      });
      address = res.data?.data?.address || res.data?.address || '';
    } catch (err: any) {
      console.error('Get deposit address error:', err?.response?.data || err.message);
    }

    if (!address) {
      const errMsg =
        `${header}${getEmoji(emojiConfig, 'field_deposit')} <b>${t(lang, 'deposit_address')}</b>\n\n` +
        `${getEmoji(emojiConfig, 'field_network')} ${networkLabel}${minDeposit}\n\n` +
        `${getEmoji(emojiConfig, 'emoji_warning')} ${t(lang, 'deposit_address_not_available')}`;
      await editOrReply(errMsg, Markup.inlineKeyboard([
        [
          Markup.button.callback(t(lang, 'deposit_retry'), `deposit_net_${networkId}`),
          Markup.button.callback(t(lang, 'deposit_change_network'), 'wallet_deposit'),
        ],
        [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
      ]));
      return;
    }

    let botSettings: Record<string, any> = {};
    try {
      botSettings = await getSettings(botId) || {};
    } catch (err) {
      console.warn('[deposit] Failed to fetch bot settings:', err);
    }
    const copyHint = botSettings.wallet_tip_message || t(lang, 'deposit_copy_hint');

    const message =
      `${header}${getEmoji(emojiConfig, 'field_deposit')} <b>${t(lang, 'deposit_address')}</b>\n\n` +
      `${getEmoji(emojiConfig, 'field_network')} ${networkLabel}${minDeposit}\n\n` +
      `${getEmoji(emojiConfig, 'field_order_id')} ${t(lang, 'deposit_address_hint')}\n\n` +
      `<code>${address}</code>\n\n` +
      `${copyHint}`;

    await editOrReply(message, Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'deposit_change_network'), 'wallet_deposit')],
      [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
    ]));
  } catch (error) {
    console.error('Deposit show address error:', error);
  }
};
