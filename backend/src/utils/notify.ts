import type { EmojiConfig } from './emoji-config';
import { getEmoji, renderHeader } from './emoji-config';

/**
 * Backend-side notification template map and helper utilities.
 * Keeps a minimal copy of the 5 notify keys for all 7 supported languages
 * so that backend services can send localised Telegram messages without
 * importing the bot's i18n module directly.
 */

const NOTIFY_TEMPLATES: Record<string, Record<string, string>> = {
  zh: {
    deposit_credited_notify:
      '{__emoji_success__} *充值成功*\n\n{__field_amount__} 金额：{amount} USDT\n{__field_network__} 网络：{network}\n{__field_txhash__} 交易哈希：`{txHash}`\n\n{__field_balance__} 当前余额：*{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *提现已批准*\n\n{__field_order_id__} 订单号：`{order_id}`\n{__field_network__} 网络：{network}\n{__field_amount__} 提现金额：{amount} USDT\n{__field_fee__} 手续费：{fee} USDT\n{__field_withdraw__} 实际到账：{actual} USDT\n{__field_address__} 到账地址：{address}\n{__field_time__} 申请时间：{created_at}\n{__field_time__} 审核时间：{time}\n\n{__field_balance__} 当前余额：*{balance} USDT*\n\n{__emoji_warning__} 提现成功，实际到账金额已扣除2%手续费，请知晓。',
    withdraw_rejected_notify:
      '{__emoji_reject__} *提现已拒绝*\n\n{__field_order_id__} 订单号：`{order_id}`\n{__field_network__} 网络：{network}\n{__field_amount__} 提现金额：{amount} USDT\n{__field_address__} 地址：{address}\n{__field_time__} 申请时间：{created_at}\n{__field_time__} 时间：{time}\n\n{__field_balance__} 余额已退回：*{balance} USDT*\n\n📝 拒绝原因：{reason}\n\n{__emoji_warning__} 提现失败，资金已退回你的ENK账户。',
    transfer_sent_notify:
      '{__field_transfer_send__} *转账成功*\n\n{__field_order_id__} 订单号：`{order_id}`\n{__field_id__} 收款方：{recipient}\n{__field_amount__} 转账金额：{amount} USDT\n{__field_fee__} 手续费：{fee} USDT\n{__emoji_success__} 实际到账：{actual} USDT\n\n{__field_balance__} 当前余额：*{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *收到转账*\n\n{__field_order_id__} 订单号：`{order_id}`\n{__field_id__} 汇款方：{sender}\n{__emoji_success__} 到账金额：{amount} USDT\n\n{__field_balance__} 当前余额：*{balance} USDT*',
    scan_transfer_type_label: '📲 类型：扫码转账',
  },
  en: {
    deposit_credited_notify:
      '{__emoji_success__} *Deposit Credited*\n\n{__field_amount__} Amount: {amount} USDT\n{__field_network__} Network: {network}\n{__field_txhash__} TX Hash: `{txHash}`\n\n{__field_balance__} Current Balance: *{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *Withdrawal Approved*\n\n{__field_order_id__} Order: `{order_id}`\n{__field_network__} Network: {network}\n{__field_amount__} Amount: {amount} USDT\n{__field_fee__} Fee: {fee} USDT\n{__field_withdraw__} Actual: {actual} USDT\n{__field_address__} To: {address}\n{__field_time__} Submitted: {created_at}\n{__field_time__} Reviewed: {time}\n\n{__field_balance__} Current Balance: *{balance} USDT*\n\n{__emoji_warning__} Withdrawal successful. Please note that the actual amount received has been deducted by a 2% handling fee.',
    withdraw_rejected_notify:
      '{__emoji_reject__} *Withdrawal Rejected*\n\n{__field_order_id__} Order: `{order_id}`\n{__field_network__} Network: {network}\n{__field_amount__} Amount: {amount} USDT\n{__field_address__} Address: {address}\n{__field_time__} Submitted: {created_at}\n{__field_time__} Time: {time}\n\n{__field_balance__} Balance Restored: *{balance} USDT*\n\n📝 Reason: {reason}\n\n{__emoji_warning__} Withdrawal failed. Funds have been returned to your ENK account.',
    transfer_sent_notify:
      '{__field_transfer_send__} *Transfer Sent*\n\n{__field_order_id__} Order: `{order_id}`\n{__field_id__} To: {recipient}\n{__field_amount__} Amount: {amount} USDT\n{__field_fee__} Fee: {fee} USDT\n{__emoji_success__} Delivered: {actual} USDT\n\n{__field_balance__} Current Balance: *{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *Transfer Received*\n\n{__field_order_id__} Order: `{order_id}`\n{__field_id__} From: {sender}\n{__emoji_success__} Amount: {amount} USDT\n\n{__field_balance__} Current Balance: *{balance} USDT*',
    scan_transfer_type_label: '📲 Type: QR Code Transfer',
  },
  fr: {
    deposit_credited_notify:
      '{__emoji_success__} *Dépôt Crédité*\n\n{__field_amount__} Montant : {amount} USDT\n{__field_network__} Réseau : {network}\n{__field_txhash__} Hash TX : `{txHash}`\n\n{__field_balance__} Solde Actuel : *{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *Retrait Approuvé*\n\n{__field_order_id__} Commande: `{order_id}`\n{__field_network__} Réseau: {network}\n{__field_amount__} Montant : {amount} USDT\n{__field_fee__} Frais : {fee} USDT\n{__field_withdraw__} Net : {actual} USDT\n{__field_address__} Adresse : {address}\n{__field_time__} Soumis: {created_at}\n{__field_time__} Examiné: {time}\n\n{__field_balance__} Solde Actuel : *{balance} USDT*\n\n{__emoji_warning__} Retrait réussi. Veuillez noter que le montant réel reçu a été déduit de 2% de frais de traitement.',
    withdraw_rejected_notify:
      '{__emoji_reject__} *Retrait Rejeté*\n\n{__field_order_id__} Commande: `{order_id}`\n{__field_network__} Réseau: {network}\n{__field_amount__} Montant : {amount} USDT\n{__field_address__} Adresse: {address}\n{__field_time__} Soumis: {created_at}\n{__field_time__} Heure: {time}\n\n{__field_balance__} Solde Restauré : *{balance} USDT*\n\n📝 Raison : {reason}\n\n{__emoji_warning__} Retrait échoué. Les fonds ont été retournés à votre compte ENK.',
    transfer_sent_notify:
      '{__field_transfer_send__} *Transfert Envoyé*\n\n{__field_order_id__} Commande: `{order_id}`\n{__field_id__} Vers : {recipient}\n{__field_amount__} Montant : {amount} USDT\n{__field_fee__} Frais : {fee} USDT\n{__emoji_success__} Livré : {actual} USDT\n\n{__field_balance__} Solde Actuel : *{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *Transfert Reçu*\n\n{__field_order_id__} Commande: `{order_id}`\n{__field_id__} De : {sender}\n{__emoji_success__} Montant : {amount} USDT\n\n{__field_balance__} Solde Actuel : *{balance} USDT*',
    scan_transfer_type_label: '📲 Type : Transfert par QR Code',
  },
  de: {
    deposit_credited_notify:
      '{__emoji_success__} *Einzahlung Gutgeschrieben*\n\n{__field_amount__} Betrag: {amount} USDT\n{__field_network__} Netzwerk: {network}\n{__field_txhash__} TX-Hash: `{txHash}`\n\n{__field_balance__} Aktuelles Guthaben: *{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *Auszahlung Genehmigt*\n\n{__field_order_id__} Bestellung: `{order_id}`\n{__field_network__} Netzwerk: {network}\n{__field_amount__} Betrag: {amount} USDT\n{__field_fee__} Gebühr: {fee} USDT\n{__field_withdraw__} Auszahlung: {actual} USDT\n{__field_address__} Adresse: {address}\n{__field_time__} Eingereicht: {created_at}\n{__field_time__} Geprüft: {time}\n\n{__field_balance__} Aktuelles Guthaben: *{balance} USDT*\n\n{__emoji_warning__} Auszahlung erfolgreich. Bitte beachten Sie, dass vom tatsächlich erhaltenen Betrag 2% Bearbeitungsgebühr abgezogen wurde.',
    withdraw_rejected_notify:
      '{__emoji_reject__} *Auszahlung Abgelehnt*\n\n{__field_order_id__} Bestellung: `{order_id}`\n{__field_network__} Netzwerk: {network}\n{__field_amount__} Betrag: {amount} USDT\n{__field_address__} Adresse: {address}\n{__field_time__} Eingereicht: {created_at}\n{__field_time__} Zeit: {time}\n\n{__field_balance__} Guthaben Wiederhergestellt: *{balance} USDT*\n\n📝 Grund: {reason}\n\n{__emoji_warning__} Auszahlung fehlgeschlagen. Das Guthaben wurde auf Ihr ENK-Konto zurückgebucht.',
    transfer_sent_notify:
      '{__field_transfer_send__} *Überweisung Gesendet*\n\n{__field_order_id__} Bestellung: `{order_id}`\n{__field_id__} An: {recipient}\n{__field_amount__} Betrag: {amount} USDT\n{__field_fee__} Gebühr: {fee} USDT\n{__emoji_success__} Übermittelt: {actual} USDT\n\n{__field_balance__} Aktuelles Guthaben: *{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *Überweisung Erhalten*\n\n{__field_order_id__} Bestellung: `{order_id}`\n{__field_id__} Von: {sender}\n{__emoji_success__} Betrag: {amount} USDT\n\n{__field_balance__} Aktuelles Guthaben: *{balance} USDT*',
    scan_transfer_type_label: '📲 Typ: QR-Code-Überweisung',
  },
  es: {
    deposit_credited_notify:
      '{__emoji_success__} *Depósito Acreditado*\n\n{__field_amount__} Monto: {amount} USDT\n{__field_network__} Red: {network}\n{__field_txhash__} Hash TX: `{txHash}`\n\n{__field_balance__} Saldo Actual: *{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *Retiro Aprobado*\n\n{__field_order_id__} Pedido: `{order_id}`\n{__field_network__} Red: {network}\n{__field_amount__} Monto: {amount} USDT\n{__field_fee__} Tarifa: {fee} USDT\n{__field_withdraw__} Neto: {actual} USDT\n{__field_address__} Dirección: {address}\n{__field_time__} Enviado: {created_at}\n{__field_time__} Revisado: {time}\n\n{__field_balance__} Saldo Actual: *{balance} USDT*\n\n{__emoji_warning__} Retiro exitoso. Tenga en cuenta que el monto real recibido ha sido deducido por una tarifa de manejo del 2%.',
    withdraw_rejected_notify:
      '{__emoji_reject__} *Retiro Rechazado*\n\n{__field_order_id__} Pedido: `{order_id}`\n{__field_network__} Red: {network}\n{__field_amount__} Monto: {amount} USDT\n{__field_address__} Dirección: {address}\n{__field_time__} Enviado: {created_at}\n{__field_time__} Hora: {time}\n\n{__field_balance__} Saldo Restaurado: *{balance} USDT*\n\n📝 Razón: {reason}\n\n{__emoji_warning__} Retiro fallido. Los fondos han sido devueltos a tu cuenta ENK.',
    transfer_sent_notify:
      '{__field_transfer_send__} *Transferencia Enviada*\n\n{__field_order_id__} Pedido: `{order_id}`\n{__field_id__} Para: {recipient}\n{__field_amount__} Monto: {amount} USDT\n{__field_fee__} Tarifa: {fee} USDT\n{__emoji_success__} Entregado: {actual} USDT\n\n{__field_balance__} Saldo Actual: *{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *Transferencia Recibida*\n\n{__field_order_id__} Pedido: `{order_id}`\n{__field_id__} De: {sender}\n{__emoji_success__} Monto: {amount} USDT\n\n{__field_balance__} Saldo Actual: *{balance} USDT*',
    scan_transfer_type_label: '📲 Tipo: Transferencia QR',
  },
  ar: {
    deposit_credited_notify:
      '{__emoji_success__} *تم إيداع المبلغ*\n\n{__field_amount__} المبلغ: {amount} USDT\n{__field_network__} الشبكة: {network}\n{__field_txhash__} هاش المعاملة: `{txHash}`\n\n{__field_balance__} الرصيد الحالي: *{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *تمت الموافقة على السحب*\n\n{__field_order_id__} الطلب: `{order_id}`\n{__field_network__} الشبكة: {network}\n{__field_amount__} المبلغ: {amount} USDT\n{__field_fee__} الرسوم: {fee} USDT\n{__field_withdraw__} الصافي: {actual} USDT\n{__field_address__} العنوان: {address}\n{__field_time__} وقت الإرسال: {created_at}\n{__field_time__} وقت المراجعة: {time}\n\n{__field_balance__} الرصيد الحالي: *{balance} USDT*\n\n{__emoji_warning__} تم السحب بنجاح. يرجى العلم أن المبلغ الفعلي المستلم قد خُصم منه 2% كرسوم معالجة.',
    withdraw_rejected_notify:
      '{__emoji_reject__} *تم رفض السحب*\n\n{__field_order_id__} الطلب: `{order_id}`\n{__field_network__} الشبكة: {network}\n{__field_amount__} المبلغ: {amount} USDT\n{__field_address__} العنوان: {address}\n{__field_time__} وقت الإرسال: {created_at}\n{__field_time__} الوقت: {time}\n\n{__field_balance__} تمت استعادة الرصيد: *{balance} USDT*\n\n📝 السبب: {reason}\n\n{__emoji_warning__} فشل السحب. تم إعادة الأموال إلى حسابك في ENK.',
    transfer_sent_notify:
      '{__field_transfer_send__} *تم إرسال التحويل*\n\n{__field_order_id__} الطلب: `{order_id}`\n{__field_id__} إلى: {recipient}\n{__field_amount__} المبلغ: {amount} USDT\n{__field_fee__} الرسوم: {fee} USDT\n{__emoji_success__} المستلم: {actual} USDT\n\n{__field_balance__} الرصيد الحالي: *{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *تم استلام تحويل*\n\n{__field_order_id__} الطلب: `{order_id}`\n{__field_id__} من: {sender}\n{__emoji_success__} المبلغ: {amount} USDT\n\n{__field_balance__} الرصيد الحالي: *{balance} USDT*',
    scan_transfer_type_label: '📲 النوع: تحويل QR',
  },
  ja: {
    deposit_credited_notify:
      '{__emoji_success__} *入金が反映されました*\n\n{__field_amount__} 金額：{amount} USDT\n{__field_network__} ネットワーク：{network}\n{__field_txhash__} TXハッシュ：`{txHash}`\n\n{__field_balance__} 現在の残高：*{balance} USDT*',
    withdraw_approved_notify:
      '{__emoji_success__} *出金が承認されました*\n\n{__field_order_id__} 注文番号：`{order_id}`\n{__field_network__} ネットワーク：{network}\n{__field_amount__} 金額：{amount} USDT\n{__field_fee__} 手数料：{fee} USDT\n{__field_withdraw__} 実際の金額：{actual} USDT\n{__field_address__} アドレス：{address}\n{__field_time__} 申請時間：{created_at}\n{__field_time__} 審査時間：{time}\n\n{__field_balance__} 現在の残高：*{balance} USDT*\n\n{__emoji_warning__} 出金が成功しました。実際の受取金額には2%の手数料が差し引かれていることをご確認ください。',
    withdraw_rejected_notify:
      '{__emoji_reject__} *出金が拒否されました*\n\n{__field_order_id__} 注文番号：`{order_id}`\n{__field_network__} ネットワーク：{network}\n{__field_amount__} 金額：{amount} USDT\n{__field_address__} アドレス：{address}\n{__field_time__} 申請時間：{created_at}\n{__field_time__} 時間：{time}\n\n{__field_balance__} 残高が復元されました：*{balance} USDT*\n\n📝 理由：{reason}\n\n{__emoji_warning__} 出金が失敗しました。資金はENKアカウントに返還されました。',
    transfer_sent_notify:
      '{__field_transfer_send__} *送金が完了しました*\n\n{__field_order_id__} 注文番号：`{order_id}`\n{__field_id__} 送先：{recipient}\n{__field_amount__} 金額：{amount} USDT\n{__field_fee__} 手数料：{fee} USDT\n{__emoji_success__} 到達金額：{actual} USDT\n\n{__field_balance__} 現在の残高：*{balance} USDT*',
    transfer_received_notify:
      '{__field_transfer_recv__} *送金を受け取りました*\n\n{__field_order_id__} 注文番号：`{order_id}`\n{__field_id__} 送信者：{sender}\n{__emoji_success__} 金額：{amount} USDT\n\n{__field_balance__} 現在の残高：*{balance} USDT*',
    scan_transfer_type_label: '📲 種類：QRコード送金',
  },
};

const EMOJI_TOKENS: Record<string, keyof EmojiConfig> = {
  '{__emoji_success__}': 'emoji_success',
  '{__emoji_reject__}': 'emoji_reject',
  '{__emoji_pending__}': 'emoji_pending',
  '{__emoji_warning__}': 'emoji_warning',
  '{__field_order_id__}': 'field_order_id',
  '{__field_network__}': 'field_network',
  '{__field_amount__}': 'field_amount',
  '{__field_address__}': 'field_address',
  '{__field_time__}': 'field_time',
  '{__field_fee__}': 'field_fee',
  '{__field_balance__}': 'field_balance',
  '{__field_id__}': 'field_id',
  '{__field_txhash__}': 'field_txhash',
  '{__field_deposit__}': 'field_deposit',
  '{__field_withdraw__}': 'field_withdraw',
  '{__field_transfer_send__}': 'field_transfer_send',
  '{__field_transfer_recv__}': 'field_transfer_recv',
  '{__field_min__}': 'field_min',
};

/**
 * Normalises a Telegram language_code to one of the keys used in NOTIFY_TEMPLATES.
 * Telegram may send variants like 'zh-hans', 'zh-cn', 'zh-tw', 'zh-hant', etc.
 */
function normaliseLang(lang: string): string {
  const lower = (lang || 'en').toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ar')) return 'ar';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('es')) return 'es';
  // Strip region suffixes for other languages (e.g. 'en-US' → 'en')
  const base = lower.split('-')[0];
  return NOTIFY_TEMPLATES[base] ? base : 'en';
}

/**
 * Returns the notification template for the given language and key.
 * Falls back to English if the language or key is not found.
 */
export function getNotifyTemplate(lang: string, key: string): string {
  const safeLang = normaliseLang(lang);
  return NOTIFY_TEMPLATES[safeLang]?.[key] ?? NOTIFY_TEMPLATES['en'][key] ?? key;
}

/**
 * Replaces `{placeholder}` tokens in a template string with the supplied values.
 */
export function formatNotification(
  template: string,
  vars: Record<string, string | number>
): string {
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return result;
}

function replaceEmojiTokens(template: string, config: EmojiConfig): string {
  let output = template;
  for (const [token, field] of Object.entries(EMOJI_TOKENS)) {
    output = output.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), getEmoji(config, field));
  }
  return output;
}

export function buildNotifyMessage(
  lang: string,
  key: string,
  vars: Record<string, string | number>,
  emojiConfig: EmojiConfig
): string {
  const template = getNotifyTemplate(lang, key);
  const formatted = formatNotification(template, vars);
  const withEmoji = replaceEmojiTokens(formatted, emojiConfig);
  return `${renderHeader(emojiConfig)}${withEmoji}`;
}
