interface RedPacketMessages {
  title: string;
  labelTotal: string;
  labelCount: string;
  labelExpires: string;
  claimButton: string;
  clickToClaimInstruction: string;
  creditRequired: string;
}

const REDPACKET_I18N: Record<string, RedPacketMessages> = {
  en: {
    title: '🧧 Red Packet Alert!',
    labelTotal: 'Total',
    labelCount: 'Count',
    labelExpires: 'Expires in',
    claimButton: '🧧 Claim Red Packet',
    clickToClaimInstruction: 'Click the button below to claim!',
    creditRequired: '⚠️ Requires 1 red packet credit to claim',
  },
  zh: {
    title: '🧧 红包来啦！',
    labelTotal: '总金额',
    labelCount: '数量',
    labelExpires: '有效期',
    claimButton: '🧧 领取红包',
    clickToClaimInstruction: '点击下方按钮领取！',
    creditRequired: '⚠️ 需要1个红包积分才能领取',
  },
  fr: {
    title: '🧧 Paquet Rouge !',
    labelTotal: 'Montant total',
    labelCount: 'Nombre',
    labelExpires: 'Expire dans',
    claimButton: '🧧 Réclamer',
    clickToClaimInstruction: 'Cliquez sur le bouton ci-dessous pour réclamer !',
    creditRequired: '⚠️ Nécessite 1 crédit de paquet rouge',
  },
  de: {
    title: '🧧 Rotes Paket!',
    labelTotal: 'Gesamtbetrag',
    labelCount: 'Anzahl',
    labelExpires: 'Läuft ab in',
    claimButton: '🧧 Einlösen',
    clickToClaimInstruction: 'Klicke auf die Schaltfläche unten, um einzulösen!',
    creditRequired: '⚠️ Benötigt 1 Rotes-Paket-Guthaben',
  },
  es: {
    title: '🧧 ¡Sobre Rojo!',
    labelTotal: 'Monto total',
    labelCount: 'Cantidad',
    labelExpires: 'Vence en',
    claimButton: '🧧 Reclamar',
    clickToClaimInstruction: '¡Haz clic en el botón de abajo para reclamar!',
    creditRequired: '⚠️ Requiere 1 crédito de sobre rojo',
  },
  ar: {
    title: '🧧 مغلف أحمر!',
    labelTotal: 'المبلغ الإجمالي',
    labelCount: 'العدد',
    labelExpires: 'ينتهي خلال',
    claimButton: '🧧 استلام',
    clickToClaimInstruction: 'انقر على الزر أدناه للاستلام!',
    creditRequired: '⚠️ يتطلب رصيداً واحداً لاستلام المغلف',
  },
  ja: {
    title: '🧧 紅包アラート！',
    labelTotal: '合計金額',
    labelCount: '数量',
    labelExpires: '有効期限',
    claimButton: '🧧 受け取る',
    clickToClaimInstruction: '下のボタンをクリックして受け取ってください！',
    creditRequired: '⚠️ 受け取りには紅包クレジットが1つ必要です',
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
  lines.push(msgs.clickToClaimInstruction);
  lines.push(msgs.creditRequired);
  return lines.join('\n');
}

export { REDPACKET_I18N };
export type { RedPacketMessages };
