import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { api } from '../services/api';
import { t } from '../i18n';

export const handleDepositSelectNetwork = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    // Dynamically load active networks from backend
    let networkButtons: ReturnType<typeof Markup.button.callback>[][] = [];
    try {
      const res = await api.get('/api/wallet/networks', {
        headers: { 'X-Bot-Token': botId },
      });
      const networks: any[] = res.data?.data || [];
      const active = networks.filter((n: any) => n.is_active);
      networkButtons = active.map((n: any) => [
        Markup.button.callback(
          n.network_display || n.network_name,
          `deposit_network:${n.id}`
        ),
      ]);
    } catch (err) {
      console.error('Failed to load deposit networks:', err);
    }

    if (networkButtons.length === 0) {
      const msg = `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n⚠️ No deposit networks configured.`;
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

    networkButtons.push([Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]);

    const msgText = `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n${t(lang, 'select_network')}`;
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

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await ctx.answerCbQuery();

    // Get network display info
    let networkLabel = networkId;
    let minDeposit = '';
    try {
      const netRes = await api.get('/api/wallet/networks', {
        headers: { 'X-Bot-Token': botId },
      });
      const networks: any[] = netRes.data?.data || [];
      const net = networks.find((n: any) => String(n.id) === String(networkId));
      if (net) {
        networkLabel = net.network_display || net.network_name;
        if (net.min_deposit_amount) {
          minDeposit = `\n💡 Min: <b>${parseFloat(String(net.min_deposit_amount)).toFixed(2)} USDT</b>`;
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
        `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
        `🌐 ${networkLabel}${minDeposit}\n\n` +
        `⚠️ ${t(lang, 'deposit_address_hint')}`;
      try {
        await ctx.editMessageText(errMsg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 ' + t(lang, 'btn_deposit'), `deposit_network:${networkId}`)],
            [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
          ]),
        });
      } catch {
        await ctx.replyWithHTML(errMsg, Markup.inlineKeyboard([
          [Markup.button.callback('🔄 ' + t(lang, 'btn_deposit'), `deposit_network:${networkId}`)],
          [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
        ]));
      }
      return;
    }

    const message =
      `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
      `🌐 ${networkLabel}${minDeposit}\n\n` +
      `📋 ${t(lang, 'deposit_address_hint')}\n\n` +
      `<code>${address}</code>`;

    try {
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 ' + t(lang, 'copy_address'), 'copy_noop')],
          [Markup.button.callback('« ' + t(lang, 'btn_deposit'), 'wallet_deposit')],
          [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
        ]),
      });
    } catch {
      await ctx.replyWithHTML(message, Markup.inlineKeyboard([
        [Markup.button.callback('📋 ' + t(lang, 'copy_address'), 'copy_noop')],
        [Markup.button.callback('« ' + t(lang, 'btn_deposit'), 'wallet_deposit')],
        [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
      ]));
    }
  } catch (error) {
    console.error('Deposit show address error:', error);
  }
};
