import React from 'react';
import { theme } from '../theme';

const CLOSE_BUTTON_LABELS: Record<string, string> = {
  zh: '知道了',
  en: 'Got it',
  fr: "J'ai compris",
  de: 'Verstanden',
  es: 'Entendido',
  ar: 'فهمت',
  ja: 'わかりました',
};

interface AnnouncementModalProps {
  title?: string;
  content?: string;
  images?: string[];
  lang?: string;
  onClose: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  title, content, images, lang, onClose,
}) => {
  const closeLabel = (lang && CLOSE_BUTTON_LABELS[lang]) || CLOSE_BUTTON_LABELS['en'];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
      padding: '16px',
    }}>
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '340px',
        width: '100%',
        border: `1px solid ${theme.border}`,
      }}>
        {title && <h2 style={{ color: theme.text, marginBottom: '12px', fontSize: '18px' }}>{title}</h2>}
        {images && images.length > 0 && images.map((img, i) => (
          <img key={i} src={img} alt="announcement" style={{ width: '100%', borderRadius: '8px', marginBottom: '12px' }} />
        ))}
        {content && (
          <p
            style={{ color: theme.textSecondary, lineHeight: '1.6', marginBottom: '16px' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
};
