import { animateEmojis } from '../utils/animated-emojis';

// Notification templates for bot private messages after red packet claim.
// Used by bot-manager.service.ts.

const CLAIM_NOTIFICATION_TEMPLATES: Record<string, { timed: string; permanent: string }> = {
  en: {
    timed: '🎁 Congratulations! You received <b>{amount} USDT</b>!\n\n💰 Amount credited: <b>{amount} USDT</b>\n📊 Complete <b>{multiplier}x</b> trading volume to unlock withdrawal\n⏳ Balance valid for: <b>{days} days</b>\n⚠️ This balance is for <b>instant trading only</b> and expires automatically',
    permanent: '🎁 Congratulations! You received <b>{amount} USDT</b>!\n\n💰 Amount credited: <b>{amount} USDT</b>\n📊 Complete <b>{multiplier}x</b> trading volume to unlock withdrawal\n✅ Balance: <b>permanently valid</b>',
  },
  zh: {
    timed: '🎁 恭喜！您领取了 <b>{amount} USDT</b> 红包！\n\n💰 到账金额：<b>{amount} USDT</b>\n📊 完成 <b>{multiplier} 倍</b>交易流水即可提现\n⏳ 余额有效期：<b>{days} 天</b>\n⚠️ 此余额<b>仅可用于即时交易</b>，到期自动失效',
    permanent: '🎁 恭喜！您领取了 <b>{amount} USDT</b> 红包！\n\n💰 到账金额：<b>{amount} USDT</b>\n📊 完成 <b>{multiplier} 倍</b>交易流水即可提现\n✅ 余额：<b>永久有效</b>',
  },
  fr: {
    timed: '🎁 Félicitations ! Vous avez reçu <b>{amount} USDT</b> !\n\n💰 Montant crédité : <b>{amount} USDT</b>\n📊 Complétez <b>{multiplier}x</b> de volume de trading pour débloquer le retrait\n⏳ Valable pendant : <b>{days} jours</b>\n⚠️ Ce solde est réservé aux <b>transactions instantanées uniquement</b>',
    permanent: '🎁 Félicitations ! Vous avez reçu <b>{amount} USDT</b> !\n\n💰 Montant crédité : <b>{amount} USDT</b>\n📊 Complétez <b>{multiplier}x</b> de volume\n✅ Solde : <b>valide en permanence</b>',
  },
  de: {
    timed: '🎁 Herzlichen Glückwunsch! Sie haben <b>{amount} USDT</b> erhalten!\n\n💰 Gutgeschriebener Betrag: <b>{amount} USDT</b>\n📊 Schließen Sie das <b>{multiplier}x</b> Handelsvolumen ab\n⏳ Gültig für: <b>{days} Tage</b>\n⚠️ Dieses Guthaben ist <b>nur für den Soforthandel</b>',
    permanent: '🎁 Herzlichen Glückwunsch! Sie haben <b>{amount} USDT</b> erhalten!\n\n💰 Gutgeschriebener Betrag: <b>{amount} USDT</b>\n📊 {multiplier}x Handelsvolumen\n✅ Guthaben: <b>dauerhaft gültig</b>',
  },
  es: {
    timed: '🎁 ¡Felicidades! ¡Recibiste <b>{amount} USDT</b>!\n\n💰 Monto acreditado: <b>{amount} USDT</b>\n📊 Completa <b>{multiplier}x</b> de volumen de trading\n⏳ Válido por: <b>{days} días</b>\n⚠️ Este saldo es <b>solo para operaciones instantáneas</b>',
    permanent: '🎁 ¡Felicidades! ¡Recibiste <b>{amount} USDT</b>!\n\n💰 Monto acreditado: <b>{amount} USDT</b>\n📊 {multiplier}x de volumen\n✅ Saldo: <b>válido permanentemente</b>',
  },
  ar: {
    timed: '🎁 تهانينا! لقد تلقيت <b>{amount} USDT</b>!\n\n💰 المبلغ المضاف: <b>{amount} USDT</b>\n📊 أكمل <b>{multiplier}x</b> حجم تداول لإلغاء قفل السحب\n⏳ صالح لمدة: <b>{days} أيام</b>\n⚠️ هذا الرصيد <b>مخصص للتداول الفوري فقط</b>',
    permanent: '🎁 تهانينا! لقد تلقيت <b>{amount} USDT</b>!\n\n💰 المبلغ: <b>{amount} USDT</b>\n📊 {multiplier}x حجم تداول\n✅ الرصيد: <b>صالح بشكل دائم</b>',
  },
  ja: {
    timed: '🎁 おめでとうございます！<b>{amount} USDT</b>を受け取りました！\n\n💰 入金額：<b>{amount} USDT</b>\n📊 <b>{multiplier}倍</b>の取引量を達成してください\n⏳ 有効期間：<b>{days}日</b>\n⚠️ この残高は<b>インスタント取引専用</b>です',
    permanent: '🎁 おめでとうございます！<b>{amount} USDT</b>を受け取りました！\n\n💰 入金額：<b>{amount} USDT</b>\n📊 {multiplier}倍の取引量\n✅ 残高：<b>永久有効</b>',
  },
};

function fill(template: string, vars: Record<string, string>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return s;
}

export function buildRedPacketClaimNotification(params: {
  lang: string;
  amount: string;
  multiplier: string;
  expiryHours?: number | null;
}): string {
  const tpl = CLAIM_NOTIFICATION_TEMPLATES[params.lang] || CLAIM_NOTIFICATION_TEMPLATES['en'];
  let text: string;
  if (!params.expiryHours) {
    text = fill(tpl.permanent, { amount: params.amount, multiplier: params.multiplier });
  } else {
    text = fill(tpl.timed, {
      amount: params.amount,
      multiplier: params.multiplier,
      days: String(Math.ceil(params.expiryHours / 24)),
    });
  }
  return animateEmojis(text);
}
