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

const decodeHtmlEntities = (raw: string): string => raw.replace(
  /&lt;|&gt;|&amp;|&quot;|&#39;/g,
  (entity) => ({
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': '\'',
  }[entity] || entity)
);

const styleContentImages = (raw: string): string => raw.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
  const imageStyle = 'max-width:100%;width:100%;height:auto;object-fit:cover;border-radius:10px;display:block;margin:0 0 12px;';
  const styleMatch = attrs.match(/\sstyle=(["'])(.*?)\1/i);

  if (styleMatch) {
    const quote = styleMatch[1];
    const existingStyle = styleMatch[2].trim();
    const mergedStyle = `${existingStyle}${existingStyle && !existingStyle.endsWith(';') ? ';' : ''}${imageStyle}`;
    return `<img${attrs.replace(styleMatch[0], ` style=${quote}${mergedStyle}${quote}`)}>`;
  }

  return `<img${attrs} style="${imageStyle}">`;
});

const sanitizeContent = (raw?: string): string => {
  if (!raw) return '';
  return styleContentImages(
    decodeHtmlEntities(raw).replace(
      /<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/gi,
      (_match, inner: string) => inner || ''
    )
  );
};

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  title, content, images, lang, onClose,
}) => {
  const closeLabel = (lang && CLOSE_BUTTON_LABELS[lang]) || CLOSE_BUTTON_LABELS['en'];
  const sanitizedContent = sanitizeContent(content);

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
    }}
    onClick={onClose}
    >
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        maxWidth: '400px',
        width: '100%',
        maxHeight: 'min(80vh, 720px)',
        border: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 20px 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {title && <h2 style={{ color: theme.text, margin: '0 0 12px', fontSize: '18px' }}>{title}</h2>}
          {images && images.length > 0 && images.map((img, i) => (
            <img
              key={i}
              src={img}
              alt="announcement"
              style={{
                width: '100%',
                maxWidth: '100%',
                borderRadius: '10px',
                marginBottom: '12px',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ))}
          {sanitizedContent && (
            <div
              style={{ color: theme.textSecondary, lineHeight: '1.6', paddingBottom: '20px', wordBreak: 'break-word' }}
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          )}
        </div>
        <div style={{ padding: '16px 20px 20px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
};
