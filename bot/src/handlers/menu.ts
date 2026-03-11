import { Context } from 'telegraf';
import { getOrCreateUser } from '../services/user';
import { handleInvite } from './invite';
import { handleWallet } from './wallet';
import { handleStart } from './start';
import { t } from '../i18n';

const ALL_LANGS = ['en', 'zh', 'fr', 'de', 'es', 'ar', 'ja'];

function collectButtons(key: string): string[] {
  return ALL_LANGS.map(l => t(l, key));
}

export const handleMenu = async (ctx: Context) => {
  try {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';

    let user;
    try {
      user = await getOrCreateUser(ctx, botId);
    } catch (userError) {
      console.error('Menu handler: getOrCreateUser failed:', userError);
      // Continue without user - handleWallet will use fallback
    }

    const text = ctx.message.text;

    // Match menu buttons in any language
    const buttons = {
      wallet: collectButtons('btn_my_wallet'),
      invite: collectButtons('btn_invite'),
      back: collectButtons('btn_back'),
    };

    if (buttons.wallet.includes(text)) {
      await handleWallet(ctx, user);
    } else if (buttons.invite.includes(text)) {
      await handleInvite(ctx);
    } else if (buttons.back.includes(text)) {
      await handleStart(ctx);
    }
  } catch (error) {
    console.error('Menu handler error:', error);
  }
};
