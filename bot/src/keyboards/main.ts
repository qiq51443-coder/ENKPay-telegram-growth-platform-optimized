import { Markup } from 'telegraf';
import { KeyboardButton } from '@telegraf/types';
import { t } from '../i18n';

export const getMainKeyboard = (lang: string = 'en', webAppUrl?: string) => {
  const rows: KeyboardButton[][] = [
    [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
  ];
  if (webAppUrl) {
    rows.push([Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)]);
  }
  return Markup.keyboard(rows).resize().persistent();
};

export const removeKeyboard = () => {
  return Markup.removeKeyboard();
};
