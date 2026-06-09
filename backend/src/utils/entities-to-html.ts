import type { MessageEntity } from 'telegraf/types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEntity(entity: MessageEntity, innerHtml: string): string {
  switch (entity.type) {
    case 'bold':
      return `<b>${innerHtml}</b>`;
    case 'italic':
      return `<i>${innerHtml}</i>`;
    case 'underline':
      return `<u>${innerHtml}</u>`;
    case 'strikethrough':
      return `<s>${innerHtml}</s>`;
    case 'spoiler':
      return `<span class="tg-spoiler">${innerHtml}</span>`;
    case 'code':
      return `<code>${innerHtml}</code>`;
    case 'pre':
      return `<pre>${innerHtml}</pre>`;
    case 'text_link': {
      const href = typeof (entity as any).url === 'string' ? (entity as any).url : '';
      if (!href) return innerHtml;
      return `<a href="${escapeHtmlAttribute(href)}">${innerHtml}</a>`;
    }
    case 'custom_emoji': {
      const emojiId = typeof (entity as any).custom_emoji_id === 'string' ? (entity as any).custom_emoji_id : '';
      if (!emojiId) return innerHtml;
      return `<tg-emoji emoji-id="${escapeHtmlAttribute(emojiId)}">${innerHtml}</tg-emoji>`;
    }
    default:
      return innerHtml;
  }
}

function renderRange(text: string, start: number, end: number, entities: MessageEntity[]): string {
  const inRange = entities.filter((entity) => {
    const offset = entity.offset;
    const length = entity.length;
    return offset >= start && offset + length <= end;
  });

  if (inRange.length === 0) {
    return escapeHtml(text.slice(start, end));
  }

  const directEntities: MessageEntity[] = [];
  let currentEnd = start;
  for (const entity of inRange) {
    const entityStart = entity.offset;
    const entityEnd = entity.offset + entity.length;
    if (entityStart >= currentEnd) {
      directEntities.push(entity);
      currentEnd = entityEnd;
    }
  }

  let result = '';
  let cursor = start;

  for (const entity of directEntities) {
    const entityStart = entity.offset;
    const entityEnd = entity.offset + entity.length;

    if (entityStart > cursor) {
      result += escapeHtml(text.slice(cursor, entityStart));
    }

    const innerEntities = inRange.filter(
      (candidate) =>
        candidate !== entity
        && candidate.offset >= entityStart
        && candidate.offset + candidate.length <= entityEnd
    );
    const innerHtml = renderRange(text, entityStart, entityEnd, innerEntities);
    result += wrapEntity(entity, innerHtml);
    cursor = entityEnd;
  }

  if (cursor < end) {
    result += escapeHtml(text.slice(cursor, end));
  }

  return result;
}

export function entitiesToHtml(text: string, entities?: MessageEntity[]): string {
  if (!entities || entities.length === 0) {
    return escapeHtml(text);
  }

  const normalizedEntities = entities
    .filter((entity) => Number.isInteger(entity.offset) && Number.isInteger(entity.length))
    .map((entity) => {
      const offset = Math.max(0, entity.offset);
      const entityEnd = Math.min(text.length, entity.offset + entity.length);
      const length = Math.max(0, entityEnd - offset);
      return { ...entity, offset, length };
    })
    .filter((entity) => entity.length > 0)
    .sort((a, b) => (a.offset - b.offset) || (b.length - a.length));

  return renderRange(text, 0, text.length, normalizedEntities);
}
