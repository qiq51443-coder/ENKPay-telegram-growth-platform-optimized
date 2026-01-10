import { Markup } from 'telegraf';
import { t } from '../i18n';

export const getMainKeyboard = (lang: string = 'en') => {
  return Markup.keyboard([
    [t(lang, 'menu_tasks'), t(lang, 'menu_invites')],
    [t(lang, 'menu_balance'), t(lang, 'menu_tutorials')],
    [t(lang, 'menu_account'), t(lang, 'menu_language')],
    [t(lang, 'menu_exchange'), t(lang, 'menu_help')],
  ]).resize().persistent();
};

export const removeKeyboard = () => {
  return Markup.removeKeyboard();
};
