// NFT-specific notification templates for bot messages.
// Used by the NFT daily settlement job.

const NFT_DAILY_INCOME_TEMPLATES: Record<string, string> = {
  en: '💰 You earned <b>{amount} USDT</b> today!\n\n📌 Source: NFT - {product_name}\n⏰ Day {current_day}/{term_days}\n🕙 Settled daily at UTC 10:00',
  zh: '💰 您今日获得 <b>{amount} USDT</b> 收益！\n\n📌 来源：NFT - {product_name}\n⏰ 第 {current_day}/{term_days} 天\n🕙 每天UTC10：00自动结算',
  ja: '💰 本日 <b>{amount} USDT</b> の収益を獲得しました！\n\n📌 出典：NFT - {product_name}\n⏰ {current_day}日目/{term_days}日\n🕙 毎日UTC10:00に自動決済',
  ar: '💰 لقد حصلت على <b>{amount} USDT</b> اليوم!\n\n📌 المصدر: NFT - {product_name}\n⏰ اليوم {current_day}/{term_days}',
  fr: '💰 Vous avez gagné <b>{amount} USDT</b> aujourd\'hui!\n\n📌 Source: NFT - {product_name}\n⏰ Jour {current_day}/{term_days}',
  de: '💰 Sie haben heute <b>{amount} USDT</b> verdient!\n\n📌 Quelle: NFT - {product_name}\n⏰ Tag {current_day}/{term_days}',
  es: '💰 ¡Ganaste <b>{amount} USDT</b> hoy!\n\n📌 Fuente: NFT - {product_name}\n⏰ Día {current_day}/{term_days}',
};

const NFT_MATURITY_RETURN_TEMPLATES: Record<string, string> = {
  en: '✅ Your NFT holding has matured!\n\n💰 Principal returned: <b>{amount} USDT</b>\n📌 NFT: {product_name}\n📝 Note: Principal returned upon maturity!',
  zh: '✅ 您的NFT定期产品已到期！\n\n💰 返还本金：<b>{amount} USDT</b>\n📌 NFT：{product_name}\n📝 说明：到期返还本金！',
  ja: '✅ あなたのNFT定期商品が満期になりました！\n\n💰 元本返還：<b>{amount} USDT</b>\n📌 NFT：{product_name}\n📝 メモ：満期時に元本を返還！',
  ar: '✅ اكتمل استحقاق منتج NFT الخاص بك!\n\n💰 رأس المال المعاد: <b>{amount} USDT</b>\n📌 NFT: {product_name}\n📝 ملاحظة: إعادة رأس المال عند الاستحقاق!',
  fr: '✅ Votre produit NFT à terme est arrivé à échéance!\n\n💰 Principal retourné: <b>{amount} USDT</b>\n📌 NFT: {product_name}\n📝 Remarque: Principal retourné à l\'échéance!',
  de: '✅ Ihr NFT-Festlaufzeitprodukt ist fällig!\n\n💰 Kapital zurückgegeben: <b>{amount} USDT</b>\n📌 NFT: {product_name}\n📝 Hinweis: Kapital bei Fälligkeit zurückgegeben!',
  es: '✅ ¡Su producto NFT a plazo ha vencido!\n\n💰 Principal devuelto: <b>{amount} USDT</b>\n📌 NFT: {product_name}\n📝 Nota: ¡Principal devuelto al vencimiento!',
};

function fill(template: string, vars: Record<string, string>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return s;
}

export function buildNFTDailyIncomeNotification(params: {
  lang: string;
  amount: string;
  product_name: string;
  current_day: number;
  term_days: number;
}): string {
  const tpl = NFT_DAILY_INCOME_TEMPLATES[params.lang] || NFT_DAILY_INCOME_TEMPLATES['en'];
  return fill(tpl, {
    amount: params.amount,
    product_name: params.product_name,
    current_day: String(params.current_day),
    term_days: String(params.term_days),
  });
}

export function buildNFTMaturityReturnNotification(params: {
  lang: string;
  amount: string;
  product_name: string;
}): string {
  const tpl = NFT_MATURITY_RETURN_TEMPLATES[params.lang] || NFT_MATURITY_RETURN_TEMPLATES['en'];
  return fill(tpl, {
    amount: params.amount,
    product_name: params.product_name,
  });
}

// ── Transaction description templates ─────────────────────────────────────────

const NFT_PURCHASE_DESC_TEMPLATES: Record<string, string> = {
  en: 'Purchased NFT product: {product_name}',
  zh: '购买定期产品：{product_name}',
  ja: 'NFT定期商品を購入しました：{product_name}',
  ar: 'تم شراء منتج NFT: {product_name}',
  fr: 'Produit NFT acheté: {product_name}',
  de: 'NFT-Produkt gekauft: {product_name}',
  es: 'Producto NFT comprado: {product_name}',
};

const NFT_INCOME_DESC_TEMPLATES: Record<string, string> = {
  en: 'Day {day} yield from NFT product: {product_name}',
  zh: '第{day}天收益 - {product_name}',
  ja: '{product_name} {day}日目の収益',
  ar: 'عائد اليوم {day} من منتج NFT: {product_name}',
  fr: 'Rendement jour {day} du produit NFT: {product_name}',
  de: 'Tag {day} Ertrag aus NFT-Produkt: {product_name}',
  es: 'Rendimiento del día {day} del producto NFT: {product_name}',
};

const NFT_PRINCIPAL_RETURN_DESC_TEMPLATES: Record<string, string> = {
  en: 'Principal returned for NFT product: {product_name}',
  zh: '本金返还 - {product_name}',
  ja: 'NFT商品の元本返還：{product_name}',
  ar: 'إعادة رأس المال لمنتج NFT: {product_name}',
  fr: 'Capital remboursé pour le produit NFT: {product_name}',
  de: 'Kapitalrückgabe für NFT-Produkt: {product_name}',
  es: 'Capital devuelto para el producto NFT: {product_name}',
};

const NFT_PURCHASE_SUCCESS_TEMPLATES: Record<string, string> = {
  en: 'Purchase successful. Yield starts from the next day.',
  zh: '购买成功，次日起收益自动到账',
  ja: '購入成功。翌日から収益が自動入金されます。',
  ar: 'تم الشراء بنجاح. يبدأ العائد من اليوم التالي.',
  fr: 'Achat réussi. Le rendement commence dès le lendemain.',
  de: 'Kauf erfolgreich. Der Ertrag beginnt ab dem nächsten Tag.',
  es: 'Compra exitosa. El rendimiento comienza a partir del día siguiente.',
};

export function buildNFTPurchaseDescription(params: {
  lang: string;
  product_name: string;
}): string {
  const tpl = NFT_PURCHASE_DESC_TEMPLATES[params.lang] || NFT_PURCHASE_DESC_TEMPLATES['en'];
  return fill(tpl, { product_name: params.product_name });
}

export function buildNFTIncomeDescription(params: {
  lang: string;
  product_name: string;
  day: number;
}): string {
  const tpl = NFT_INCOME_DESC_TEMPLATES[params.lang] || NFT_INCOME_DESC_TEMPLATES['en'];
  return fill(tpl, { product_name: params.product_name, day: String(params.day) });
}

export function buildNFTPrincipalReturnDescription(params: {
  lang: string;
  product_name: string;
}): string {
  const tpl = NFT_PRINCIPAL_RETURN_DESC_TEMPLATES[params.lang] || NFT_PRINCIPAL_RETURN_DESC_TEMPLATES['en'];
  return fill(tpl, { product_name: params.product_name });
}

export function buildNFTPurchaseSuccessMessage(params: {
  lang: string;
}): string {
  return NFT_PURCHASE_SUCCESS_TEMPLATES[params.lang] || NFT_PURCHASE_SUCCESS_TEMPLATES['en'];
}
