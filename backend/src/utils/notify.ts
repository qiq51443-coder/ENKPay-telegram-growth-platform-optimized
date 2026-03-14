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
      '✅ *提现已批准*\n\n📋 订单号：`{order_id}`\n🌐 网络：{network}\n💰 提现金额：{amount} USDT\n💸 手续费：{fee} USDT\n📤 实际到账：{actual} USDT\n📍 到账地址：{address}\n🕐 申请时间：{created_at}\n🕐 审核时间：{time}\n\n💳 当前余额：*{balance} USDT*\n\n⚠️ 提现成功，实际到账金额已扣除2%手续费用，请知晓。',
    withdraw_rejected_notify:
      '❌ *提现已拒绝*\n\n📋 订单号：`{order_id}`\n🌐 网络：{network}\n💰 提现金额：{amount} USDT\n📍 地址：{address}\n🕐 申请时间：{created_at}\n🕐 时间：{time}\n\n💳 余额已退回：*{balance} USDT*\n\n📝 拒绝原因：{reason}\n\n⚠️ 提现失败，资金已退回你的ENK账户。',
    transfer_sent_notify:
      '📤 *转账成功*\n\n📋 订单号：`{order_id}`\n👤 收款方：{recipient}\n💵 转账金额：{amount} USDT\n💸 手续费：{fee} USDT\n✅ 实际到账：{actual} USDT\n\n💳 当前余额：*{balance} USDT*',
    transfer_received_notify:
      '💰 *收到转账*\n\n📋 订单号：`{order_id}`\n👤 汇款方：{sender}\n✅ 到账金额：{amount} USDT\n\n💳 当前余额：*{balance} USDT*',
  },
  en: {
    deposit_credited_notify:
      '✅ *Deposit Credited*\n\n💰 Amount: {amount} USDT\n🌐 Network: {network}\n🔗 TX Hash: `{txHash}`\n\n💳 Current Balance: *{balance} USDT*\n\nThank you for your deposit!',
    withdraw_approved_notify:
      '✅ *Withdrawal Approved*\n\n📋 Order: `{order_id}`\n🌐 Network: {network}\n💰 Amount: {amount} USDT\n💸 Fee: {fee} USDT\n📤 Actual: {actual} USDT\n📍 To: {address}\n🕐 Submitted: {created_at}\n🕐 Reviewed: {time}\n\n💳 Current Balance: *{balance} USDT*\n\n⚠️ Withdrawal successful. Please note that the actual amount received has been deducted by a 2% handling fee.',
    withdraw_rejected_notify:
      '❌ *Withdrawal Rejected*\n\n📋 Order: `{order_id}`\n🌐 Network: {network}\n💰 Amount: {amount} USDT\n📍 Address: {address}\n🕐 Submitted: {created_at}\n🕐 Time: {time}\n\n💳 Balance Restored: *{balance} USDT*\n\n📝 Reason: {reason}\n\n⚠️ Withdrawal failed. Funds have been returned to your ENK account.',
    transfer_sent_notify:
      '📤 *Transfer Sent*\n\n📋 Order: `{order_id}`\n👤 To: {recipient}\n💵 Amount: {amount} USDT\n💸 Fee: {fee} USDT\n✅ Delivered: {actual} USDT\n\n💳 Current Balance: *{balance} USDT*',
    transfer_received_notify:
      '💰 *Transfer Received*\n\n📋 Order: `{order_id}`\n👤 From: {sender}\n✅ Amount: {amount} USDT\n\n💳 Current Balance: *{balance} USDT*',
  },
  fr: {
    deposit_credited_notify:
      '✅ *Dépôt Crédité*\n\n💰 Montant : {amount} USDT\n🌐 Réseau : {network}\n🔗 Hash TX : `{txHash}`\n\n💳 Solde Actuel : *{balance} USDT*\n\nMerci pour votre dépôt !',
    withdraw_approved_notify:
      '✅ *Retrait Approuvé*\n\n📋 Commande: `{order_id}`\n🌐 Réseau: {network}\n💰 Montant : {amount} USDT\n💸 Frais : {fee} USDT\n📤 Net : {actual} USDT\n📍 Adresse : {address}\n🕐 Soumis: {created_at}\n🕐 Examiné: {time}\n\n💳 Solde Actuel : *{balance} USDT*\n\n⚠️ Retrait réussi. Veuillez noter que le montant réel reçu a été déduit de 2% de frais de traitement.',
    withdraw_rejected_notify:
      '❌ *Retrait Rejeté*\n\n📋 Commande: `{order_id}`\n🌐 Réseau: {network}\n💰 Montant : {amount} USDT\n📍 Adresse: {address}\n🕐 Soumis: {created_at}\n🕐 Heure: {time}\n\n💳 Solde Restauré : *{balance} USDT*\n\n📝 Raison : {reason}\n\n⚠️ Retrait échoué. Les fonds ont été retournés à votre compte ENK.',
    transfer_sent_notify:
      '📤 *Transfert Envoyé*\n\n📋 Commande: `{order_id}`\n👤 Vers : {recipient}\n💵 Montant : {amount} USDT\n💸 Frais : {fee} USDT\n✅ Livré : {actual} USDT\n\n💳 Solde Actuel : *{balance} USDT*',
    transfer_received_notify:
      '💰 *Transfert Reçu*\n\n📋 Commande: `{order_id}`\n👤 De : {sender}\n✅ Montant : {amount} USDT\n\n💳 Solde Actuel : *{balance} USDT*',
  },
  de: {
    deposit_credited_notify:
      '✅ *Einzahlung Gutgeschrieben*\n\n💰 Betrag: {amount} USDT\n🌐 Netzwerk: {network}\n🔗 TX-Hash: `{txHash}`\n\n💳 Aktuelles Guthaben: *{balance} USDT*\n\nVielen Dank für Ihre Einzahlung!',
    withdraw_approved_notify:
      '✅ *Auszahlung Genehmigt*\n\n📋 Bestellung: `{order_id}`\n🌐 Netzwerk: {network}\n💰 Betrag: {amount} USDT\n💸 Gebühr: {fee} USDT\n📤 Auszahlung: {actual} USDT\n📍 Adresse: {address}\n🕐 Eingereicht: {created_at}\n🕐 Geprüft: {time}\n\n💳 Aktuelles Guthaben: *{balance} USDT*\n\n⚠️ Auszahlung erfolgreich. Bitte beachten Sie, dass vom tatsächlich erhaltenen Betrag 2% Bearbeitungsgebühr abgezogen wurde.',
    withdraw_rejected_notify:
      '❌ *Auszahlung Abgelehnt*\n\n📋 Bestellung: `{order_id}`\n🌐 Netzwerk: {network}\n💰 Betrag: {amount} USDT\n📍 Adresse: {address}\n🕐 Eingereicht: {created_at}\n🕐 Zeit: {time}\n\n💳 Guthaben Wiederhergestellt: *{balance} USDT*\n\n📝 Grund: {reason}\n\n⚠️ Auszahlung fehlgeschlagen. Das Guthaben wurde auf Ihr ENK-Konto zurückgebucht.',
    transfer_sent_notify:
      '📤 *Überweisung Gesendet*\n\n📋 Bestellung: `{order_id}`\n👤 An: {recipient}\n💵 Betrag: {amount} USDT\n💸 Gebühr: {fee} USDT\n✅ Übermittelt: {actual} USDT\n\n💳 Aktuelles Guthaben: *{balance} USDT*',
    transfer_received_notify:
      '💰 *Überweisung Erhalten*\n\n📋 Bestellung: `{order_id}`\n👤 Von: {sender}\n✅ Betrag: {amount} USDT\n\n💳 Aktuelles Guthaben: *{balance} USDT*',
  },
  es: {
    deposit_credited_notify:
      '✅ *Depósito Acreditado*\n\n💰 Monto: {amount} USDT\n🌐 Red: {network}\n🔗 Hash TX: `{txHash}`\n\n💳 Saldo Actual: *{balance} USDT*\n\n¡Gracias por tu depósito!',
    withdraw_approved_notify:
      '✅ *Retiro Aprobado*\n\n📋 Pedido: `{order_id}`\n🌐 Red: {network}\n💰 Monto: {amount} USDT\n💸 Tarifa: {fee} USDT\n📤 Neto: {actual} USDT\n📍 Dirección: {address}\n🕐 Enviado: {created_at}\n🕐 Revisado: {time}\n\n💳 Saldo Actual: *{balance} USDT*\n\n⚠️ Retiro exitoso. Tenga en cuenta que el monto real recibido ha sido deducido por una tarifa de manejo del 2%.',
    withdraw_rejected_notify:
      '❌ *Retiro Rechazado*\n\n📋 Pedido: `{order_id}`\n🌐 Red: {network}\n💰 Monto: {amount} USDT\n📍 Dirección: {address}\n🕐 Enviado: {created_at}\n🕐 Hora: {time}\n\n💳 Saldo Restaurado: *{balance} USDT*\n\n📝 Razón: {reason}\n\n⚠️ Retiro fallido. Los fondos han sido devueltos a tu cuenta ENK.',
    transfer_sent_notify:
      '📤 *Transferencia Enviada*\n\n📋 Pedido: `{order_id}`\n👤 Para: {recipient}\n💵 Monto: {amount} USDT\n💸 Tarifa: {fee} USDT\n✅ Entregado: {actual} USDT\n\n💳 Saldo Actual: *{balance} USDT*',
    transfer_received_notify:
      '💰 *Transferencia Recibida*\n\n📋 Pedido: `{order_id}`\n👤 De: {sender}\n✅ Monto: {amount} USDT\n\n💳 Saldo Actual: *{balance} USDT*',
  },
  ar: {
    deposit_credited_notify:
      '✅ *تم إيداع المبلغ*\n\n💰 المبلغ: {amount} USDT\n🌐 الشبكة: {network}\n🔗 هاش المعاملة: `{txHash}`\n\n💳 الرصيد الحالي: *{balance} USDT*\n\nشكراً على إيداعك!',
    withdraw_approved_notify:
      '✅ *تمت الموافقة على السحب*\n\n📋 الطلب: `{order_id}`\n🌐 الشبكة: {network}\n💰 المبلغ: {amount} USDT\n💸 الرسوم: {fee} USDT\n📤 الصافي: {actual} USDT\n📍 العنوان: {address}\n🕐 وقت الإرسال: {created_at}\n🕐 وقت المراجعة: {time}\n\n💳 الرصيد الحالي: *{balance} USDT*\n\n⚠️ تم السحب بنجاح. يرجى العلم أن المبلغ الفعلي المستلم قد خُصم منه 2% كرسوم معالجة.',
    withdraw_rejected_notify:
      '❌ *تم رفض السحب*\n\n📋 الطلب: `{order_id}`\n🌐 الشبكة: {network}\n💰 المبلغ: {amount} USDT\n📍 العنوان: {address}\n🕐 وقت الإرسال: {created_at}\n🕐 الوقت: {time}\n\n💳 تمت استعادة الرصيد: *{balance} USDT*\n\n📝 السبب: {reason}\n\n⚠️ فشل السحب. تم إعادة الأموال إلى حسابك في ENK.',
    transfer_sent_notify:
      '📤 *تم إرسال التحويل*\n\n📋 الطلب: `{order_id}`\n👤 إلى: {recipient}\n💵 المبلغ: {amount} USDT\n💸 الرسوم: {fee} USDT\n✅ المستلم: {actual} USDT\n\n💳 الرصيد الحالي: *{balance} USDT*',
    transfer_received_notify:
      '💰 *تم استلام تحويل*\n\n📋 الطلب: `{order_id}`\n👤 من: {sender}\n✅ المبلغ: {amount} USDT\n\n💳 الرصيد الحالي: *{balance} USDT*',
  },
  ja: {
    deposit_credited_notify:
      '✅ *入金が反映されました*\n\n💰 金額：{amount} USDT\n🌐 ネットワーク：{network}\n🔗 TXハッシュ：`{txHash}`\n\n💳 現在の残高：*{balance} USDT*\n\nご入金ありがとうございます！',
    withdraw_approved_notify:
      '✅ *出金が承認されました*\n\n📋 注文番号：`{order_id}`\n🌐 ネットワーク：{network}\n💰 金額：{amount} USDT\n💸 手数料：{fee} USDT\n📤 実際の金額：{actual} USDT\n📍 アドレス：{address}\n🕐 申請時間：{created_at}\n🕐 審査時間：{time}\n\n💳 現在の残高：*{balance} USDT*\n\n⚠️ 出金が成功しました。実際の受取金額には2%の手数料が差し引かれていることをご確認ください。',
    withdraw_rejected_notify:
      '❌ *出金が拒否されました*\n\n📋 注文番号：`{order_id}`\n🌐 ネットワーク：{network}\n💰 金額：{amount} USDT\n📍 アドレス：{address}\n🕐 申請時間：{created_at}\n🕐 時間：{time}\n\n💳 残高が復元されました：*{balance} USDT*\n\n📝 理由：{reason}\n\n⚠️ 出金が失敗しました。資金はENKアカウントに返還されました。',
    transfer_sent_notify:
      '📤 *送金が完了しました*\n\n📋 注文番号：`{order_id}`\n👤 送先：{recipient}\n💵 金額：{amount} USDT\n💸 手数料：{fee} USDT\n✅ 到達金額：{actual} USDT\n\n💳 現在の残高：*{balance} USDT*',
    transfer_received_notify:
      '💰 *送金を受け取りました*\n\n📋 注文番号：`{order_id}`\n👤 送信者：{sender}\n✅ 金額：{amount} USDT\n\n💳 現在の残高：*{balance} USDT*',
  },
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
