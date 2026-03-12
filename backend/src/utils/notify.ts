/**
 * Backend-side notification template map and helper utilities.
 * Keeps a minimal copy of the 5 notify keys for all 7 supported languages
 * so that backend services can send localised Telegram messages without
 * importing the bot's i18n module directly.
 */

const NOTIFY_TEMPLATES: Record<string, Record<string, string>> = {
  zh: {
    deposit_credited_notify:
      '✅ *充值成功*\n\n💰 金额：{amount} USDT\n🌐 网络：{network}\n🔗 交易哈希：`{txHash}`\n\n💳 当前余额：*{balance} USDT*\n\n感谢您的充值！',
    withdraw_approved_notify:
      '✅ *提现已批准*\n\n📋 订单号：`{order_id}`\n💰 提现金额：{amount} USDT\n💸 手续费：{fee} USDT\n📤 实际到账：{actual} USDT\n📍 到账地址：{address}\n\n💳 当前余额：*{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *提现已拒绝*\n\n📋 订单号：`{order_id}`\n💰 提现金额：{amount} USDT\n💳 余额已退回：*{balance} USDT*\n\n📝 拒绝原因：{reason}',
    transfer_sent_notify:
      '📤 *转账成功*\n\n📋 订单号：`{order_id}`\n👤 收款方：{recipient}\n💵 转账金额：{amount} USDT\n💸 手续费：{fee} USDT\n✅ 实际到账：{actual} USDT\n\n💳 当前余额：*{balance} USDT*',
    transfer_received_notify:
      '💰 *收到转账*\n\n📋 订单号：`{order_id}`\n👤 汇款方：{sender}\n✅ 到账金额：{amount} USDT\n\n💳 当前余额：*{balance} USDT*',
  },
  en: {
    deposit_credited_notify:
      '✅ *Deposit Credited*\n\n💰 Amount: {amount} USDT\n🌐 Network: {network}\n🔗 TX Hash: `{txHash}`\n\n💳 Current Balance: *{balance} USDT*\n\nThank you for your deposit!',
    withdraw_approved_notify:
      '✅ *Withdrawal Approved*\n\n📋 Order: `{order_id}`\n💰 Amount: {amount} USDT\n💸 Fee: {fee} USDT\n📤 Actual: {actual} USDT\n📍 To: {address}\n\n💳 Current Balance: *{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *Withdrawal Rejected*\n\n📋 Order: `{order_id}`\n💰 Amount: {amount} USDT\n💳 Balance Restored: *{balance} USDT*\n\n📝 Reason: {reason}',
    transfer_sent_notify:
      '📤 *Transfer Sent*\n\n📋 Order: `{order_id}`\n👤 To: {recipient}\n💵 Amount: {amount} USDT\n💸 Fee: {fee} USDT\n✅ Delivered: {actual} USDT\n\n💳 Current Balance: *{balance} USDT*',
    transfer_received_notify:
      '💰 *Transfer Received*\n\n📋 Order: `{order_id}`\n👤 From: {sender}\n✅ Amount: {amount} USDT\n\n💳 Current Balance: *{balance} USDT*',
  },
  fr: {
    deposit_credited_notify:
      '✅ *Dépôt Crédité*\n\n💰 Montant : {amount} USDT\n🌐 Réseau : {network}\n🔗 Hash TX : `{txHash}`\n\n💳 Solde Actuel : *{balance} USDT*\n\nMerci pour votre dépôt !',
    withdraw_approved_notify:
      '✅ *Retrait Approuvé*\n\n📋 Commande: `{order_id}`\n💰 Montant : {amount} USDT\n💸 Frais : {fee} USDT\n📤 Net : {actual} USDT\n📍 Adresse : {address}\n\n💳 Solde Actuel : *{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *Retrait Rejeté*\n\n📋 Commande: `{order_id}`\n💰 Montant : {amount} USDT\n💳 Solde Restauré : *{balance} USDT*\n\n📝 Raison : {reason}',
    transfer_sent_notify:
      '📤 *Transfert Envoyé*\n\n📋 Commande: `{order_id}`\n👤 Vers : {recipient}\n💵 Montant : {amount} USDT\n💸 Frais : {fee} USDT\n✅ Livré : {actual} USDT\n\n💳 Solde Actuel : *{balance} USDT*',
    transfer_received_notify:
      '💰 *Transfert Reçu*\n\n📋 Commande: `{order_id}`\n👤 De : {sender}\n✅ Montant : {amount} USDT\n\n💳 Solde Actuel : *{balance} USDT*',
  },
  de: {
    deposit_credited_notify:
      '✅ *Einzahlung Gutgeschrieben*\n\n💰 Betrag: {amount} USDT\n🌐 Netzwerk: {network}\n🔗 TX-Hash: `{txHash}`\n\n💳 Aktuelles Guthaben: *{balance} USDT*\n\nVielen Dank für Ihre Einzahlung!',
    withdraw_approved_notify:
      '✅ *Auszahlung Genehmigt*\n\n📋 Bestellung: `{order_id}`\n💰 Betrag: {amount} USDT\n💸 Gebühr: {fee} USDT\n📤 Auszahlung: {actual} USDT\n📍 Adresse: {address}\n\n💳 Aktuelles Guthaben: *{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *Auszahlung Abgelehnt*\n\n📋 Bestellung: `{order_id}`\n💰 Betrag: {amount} USDT\n💳 Guthaben Wiederhergestellt: *{balance} USDT*\n\n📝 Grund: {reason}',
    transfer_sent_notify:
      '📤 *Überweisung Gesendet*\n\n📋 Bestellung: `{order_id}`\n👤 An: {recipient}\n💵 Betrag: {amount} USDT\n💸 Gebühr: {fee} USDT\n✅ Übermittelt: {actual} USDT\n\n💳 Aktuelles Guthaben: *{balance} USDT*',
    transfer_received_notify:
      '💰 *Überweisung Erhalten*\n\n📋 Bestellung: `{order_id}`\n👤 Von: {sender}\n✅ Betrag: {amount} USDT\n\n💳 Aktuelles Guthaben: *{balance} USDT*',
  },
  es: {
    deposit_credited_notify:
      '✅ *Depósito Acreditado*\n\n💰 Monto: {amount} USDT\n🌐 Red: {network}\n🔗 Hash TX: `{txHash}`\n\n💳 Saldo Actual: *{balance} USDT*\n\n¡Gracias por tu depósito!',
    withdraw_approved_notify:
      '✅ *Retiro Aprobado*\n\n📋 Pedido: `{order_id}`\n💰 Monto: {amount} USDT\n💸 Tarifa: {fee} USDT\n📤 Neto: {actual} USDT\n📍 Dirección: {address}\n\n💳 Saldo Actual: *{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *Retiro Rechazado*\n\n📋 Pedido: `{order_id}`\n💰 Monto: {amount} USDT\n💳 Saldo Restaurado: *{balance} USDT*\n\n📝 Razón: {reason}',
    transfer_sent_notify:
      '📤 *Transferencia Enviada*\n\n📋 Pedido: `{order_id}`\n👤 Para: {recipient}\n💵 Monto: {amount} USDT\n💸 Tarifa: {fee} USDT\n✅ Entregado: {actual} USDT\n\n💳 Saldo Actual: *{balance} USDT*',
    transfer_received_notify:
      '💰 *Transferencia Recibida*\n\n📋 Pedido: `{order_id}`\n👤 De: {sender}\n✅ Monto: {amount} USDT\n\n💳 Saldo Actual: *{balance} USDT*',
  },
  ar: {
    deposit_credited_notify:
      '✅ *تم إيداع المبلغ*\n\n💰 المبلغ: {amount} USDT\n🌐 الشبكة: {network}\n🔗 هاش المعاملة: `{txHash}`\n\n💳 الرصيد الحالي: *{balance} USDT*\n\nشكراً على إيداعك!',
    withdraw_approved_notify:
      '✅ *تمت الموافقة على السحب*\n\n📋 الطلب: `{order_id}`\n💰 المبلغ: {amount} USDT\n💸 الرسوم: {fee} USDT\n📤 الصافي: {actual} USDT\n📍 العنوان: {address}\n\n💳 الرصيد الحالي: *{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *تم رفض السحب*\n\n📋 الطلب: `{order_id}`\n💰 المبلغ: {amount} USDT\n💳 تمت استعادة الرصيد: *{balance} USDT*\n\n📝 السبب: {reason}',
    transfer_sent_notify:
      '📤 *تم إرسال التحويل*\n\n📋 الطلب: `{order_id}`\n👤 إلى: {recipient}\n💵 المبلغ: {amount} USDT\n💸 الرسوم: {fee} USDT\n✅ المستلم: {actual} USDT\n\n💳 الرصيد الحالي: *{balance} USDT*',
    transfer_received_notify:
      '💰 *تم استلام تحويل*\n\n📋 الطلب: `{order_id}`\n👤 من: {sender}\n✅ المبلغ: {amount} USDT\n\n💳 الرصيد الحالي: *{balance} USDT*',
  },
  ja: {
    deposit_credited_notify:
      '✅ *入金が反映されました*\n\n💰 金額：{amount} USDT\n🌐 ネットワーク：{network}\n🔗 TXハッシュ：`{txHash}`\n\n💳 現在の残高：*{balance} USDT*\n\nご入金ありがとうございます！',
    withdraw_approved_notify:
      '✅ *出金が承認されました*\n\n📋 注文番号：`{order_id}`\n💰 金額：{amount} USDT\n💸 手数料：{fee} USDT\n📤 実際の金額：{actual} USDT\n📍 アドレス：{address}\n\n💳 現在の残高：*{balance} USDT*',
    withdraw_rejected_notify:
      '❌ *出金が拒否されました*\n\n📋 注文番号：`{order_id}`\n💰 金額：{amount} USDT\n💳 残高が復元されました：*{balance} USDT*\n\n📝 理由：{reason}',
    transfer_sent_notify:
      '📤 *送金が完了しました*\n\n📋 注文番号：`{order_id}`\n👤 送先：{recipient}\n💵 金額：{amount} USDT\n💸 手数料：{fee} USDT\n✅ 到達金額：{actual} USDT\n\n💳 現在の残高：*{balance} USDT*',
    transfer_received_notify:
      '💰 *送金を受け取りました*\n\n📋 注文番号：`{order_id}`\n👤 送信者：{sender}\n✅ 金額：{amount} USDT\n\n💳 現在の残高：*{balance} USDT*',
  },
};

/**
 * Returns the notification template for the given language and key.
 * Falls back to English if the language or key is not found.
 */
export function getNotifyTemplate(lang: string, key: string): string {
  const safeLang = NOTIFY_TEMPLATES[lang] ? lang : 'en';
  return NOTIFY_TEMPLATES[safeLang][key] ?? NOTIFY_TEMPLATES['en'][key] ?? key;
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
