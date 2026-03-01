interface RedPacketMessages {
  title: string;
  labelTotal: string;
  labelCount: string;
  labelExpires: string;
  claimButton: string;
}

const REDPACKET_I18N: Record<string, RedPacketMessages> = {
  en: {
    title: '🧧 Red Packet Alert!',
    labelTotal: 'Total',
    labelCount: 'Count',
    labelExpires: 'Expires in',
    claimButton: '🧧 Claim Red Packet',
  },
  zh: {
    title: '🧧 红包来啦！',
    labelTotal: '总金额',
    labelCount: '数量',
    labelExpires: '有效期',
    claimButton: '🧧 领取红包',
  },
  fr: {
    title: '🧧 Paquet Rouge !',
    labelTotal: 'Montant total',
    labelCount: 'Nombre',
    labelExpires: 'Expire dans',
    claimButton: '🧧 Réclamer',
  },
  de: {
    title: '🧧 Rotes Paket!',
    labelTotal: 'Gesamtbetrag',
    labelCount: 'Anzahl',
    labelExpires: 'Läuft ab in',
    claimButton: '🧧 Einlösen',
  },
  es: {
    title: '🧧 ¡Sobre Rojo!',
    labelTotal: 'Monto total',
    labelCount: 'Cantidad',
    labelExpires: 'Vence en',
    claimButton: '🧧 Reclamar',
  },
  ar: {
    title: '🧧 مغلف أحمر!',
    labelTotal: 'المبلغ الإجمالي',
    labelCount: 'العدد',
    labelExpires: 'ينتهي خلال',
    claimButton: '🧧 استلام',
  },
  ja: {
    title: '🧧 紅包アラート！',
    labelTotal: '合計金額',
    labelCount: '数量',
    labelExpires: '有効期限',
    claimButton: '🧧 受け取る',
  },
};

export function getRedPacketMessages(language: string): RedPacketMessages {
  return REDPACKET_I18N[language] || REDPACKET_I18N['en'];
}

export function buildRedPacketMessage(params: {
  language?: string;
  title?: string;
  totalAmount: number;
  totalCount: number;
  expiresHours?: number | null;
}): string {
  const msgs = getRedPacketMessages(params.language || 'en');
  const lines = [
    `${msgs.title}`,
    '',
    params.title || msgs.title,
    '',
    `💰 ${msgs.labelTotal}: ${params.totalAmount}`,
    `👥 ${msgs.labelCount}: ${params.totalCount}`,
  ];
  if (params.expiresHours) {
    lines.push(`⏰ ${msgs.labelExpires} ${params.expiresHours} hours`);
  }
  lines.push('');
  lines.push('Click the button below to claim!');
  lines.push('⚠️ Requires 1 red packet credit to claim');
  return lines.join('\n');
}

export { REDPACKET_I18N };
export type { RedPacketMessages };
