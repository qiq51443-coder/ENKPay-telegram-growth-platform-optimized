interface RedPacketMessages {
  title: string;
  labelTotal: string;
  labelCount: string;
  labelExpires: string;
  claimButton: string;
  clickToClaimInstruction: string;
}

const REDPACKET_I18N: Record<string, RedPacketMessages> = {
  en: {
    title: '🧧 Red Packet Alert!',
    labelTotal: 'Total',
    labelCount: 'Count',
    labelExpires: 'Expires in',
    claimButton: '🧧 Claim Red Packet',
    clickToClaimInstruction: 'Click the button below to claim!',
  },
  zh: {
    title: '🧧 红包来啦！',
    labelTotal: '总金额',
    labelCount: '数量',
    labelExpires: '有效期',
    claimButton: '🧧 领取红包',
    clickToClaimInstruction: '点击下方按钮领取！',
  },
  fr: {
    title: '🧧 Paquet Rouge !',
    labelTotal: 'Montant total',
    labelCount: 'Nombre',
    labelExpires: 'Expire dans',
    claimButton: '🧧 Réclamer',
    clickToClaimInstruction: 'Cliquez sur le bouton ci-dessous pour réclamer !',
  },
  de: {
    title: '🧧 Rotes Paket!',
    labelTotal: 'Gesamtbetrag',
    labelCount: 'Anzahl',
    labelExpires: 'Läuft ab in',
    claimButton: '🧧 Einlösen',
    clickToClaimInstruction: 'Klicke auf die Schaltfläche unten, um einzulösen!',
  },
  es: {
    title: '🧧 ¡Sobre Rojo!',
    labelTotal: 'Monto total',
    labelCount: 'Cantidad',
    labelExpires: 'Vence en',
    claimButton: '🧧 Reclamar',
    clickToClaimInstruction: '¡Haz clic en el botón de abajo para reclamar!',
  },
  ar: {
    title: '🧧 مغلف أحمر!',
    labelTotal: 'المبلغ الإجمالي',
    labelCount: 'العدد',
    labelExpires: 'ينتهي خلال',
    claimButton: '🧧 استلام',
    clickToClaimInstruction: 'انقر على الزر أدناه للاستلام!',
  },
  ja: {
    title: '🧧 紅包アラート！',
    labelTotal: '合計金額',
    labelCount: '数量',
    labelExpires: '有効期限',
    claimButton: '🧧 受け取る',
    clickToClaimInstruction: '下のボタンをクリックして受け取ってください！',
  },
};

export function getRedPacketMessages(language: string): RedPacketMessages {
  return REDPACKET_I18N[language] || REDPACKET_I18N['en'];
}

export function buildRedPacketMessage(params: {
  language?: string;
  title?: string;
  totalAmount: number | string;
  totalCount: number | string;
  expiresHours?: number | null;
}): string {
  const msgs = getRedPacketMessages(params.language || 'en');
  const SEP = '━━━━━━━━━━━━━━━━━━━━';
  const expiryDays = params.expiresHours ? Math.ceil(Number(params.expiresHours) / 24) : null;

  const lines = [
    '🎁🎁🎁🎁🎁🎁🎁🎁🎁🎁',
    '',
    `  🎁 ${msgs.title} 🎁`,
    '',
    '🎁🎁🎁🎁🎁🎁🎁🎁🎁🎁',
    '',
    params.title || msgs.title,
    '',
    SEP,
    `💰 ${msgs.labelTotal}: ${Number(params.totalAmount).toFixed(2)} USDT`,
    `👥 ${msgs.labelCount}: ${params.totalCount}`,
  ];

  if (expiryDays) {
    lines.push(`⏰ ${msgs.labelExpires}: ${expiryDays} ${expiryDays === 1 ? 'day' : 'days'}`);
  }

  lines.push(SEP);
  lines.push('');
  lines.push(msgs.clickToClaimInstruction);

  return lines.join('\n');
}

export { REDPACKET_I18N };
export type { RedPacketMessages };
