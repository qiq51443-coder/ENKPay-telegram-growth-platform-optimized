import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getDepositAddress } from '../services/api';
import { t } from '../i18n';

const NETWORKS = [
  { label: 'BSC (BEP20)', id: 'BSC' },
  { label: 'ETH (ERC20)', id: 'ETH' },
  { label: 'TRC (TRC20)', id: 'TRC' },
];

export const handleDepositSelectNetwork = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await ctx.editMessageText(
      `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n${t(lang, 'select_network')}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          NETWORKS.map(n => Markup.button.callback(n.label, `deposit_network:${n.id}`)),
          [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
        ]),
      }
    );
  } catch (error) {
    console.error('Deposit select network error:', error);
  }
};

export const handleDepositShowAddress = async (ctx: Context, networkId: string) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    let address = '';
    try {
      const result = await getDepositAddress(botId, user.id.toString(), networkId);
      address = result.address || '';
    } catch (err) {
      console.error('Get deposit address error:', err);
    }

    if (!address) {
      await ctx.answerCbQuery('Failed to get deposit address');
      return;
    }

    const network = NETWORKS.find(n => n.id === networkId);
    const networkLabel = network ? network.label : networkId;

    const message =
      `📥 <b>${t(lang, 'deposit_address')} (${networkLabel})</b>\n\n` +
      `${t(lang, 'deposit_address_hint')}\n\n` +
      `<code>${address}</code>`;

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'copy_address'), `copy_noop`)],
        [Markup.button.callback('« ' + t(lang, 'btn_deposit'), 'wallet_deposit')],
        [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
      ]),
    });
  } catch (error) {
    console.error('Deposit show address error:', error);
  }
};
