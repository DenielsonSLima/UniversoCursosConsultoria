export type WhatsAppTextNode =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }
  | {
      type: 'bold' | 'italic' | 'strikethrough' | 'monospace';
      children: WhatsAppTextNode[];
    };

type FormatDefinition = {
  marker: string;
  type: Extract<WhatsAppTextNode, { children: WhatsAppTextNode[] }>['type'];
};

const FORMAT_DEFINITIONS: FormatDefinition[] = [
  { marker: '```', type: 'monospace' },
  { marker: '`', type: 'monospace' },
  { marker: '*', type: 'bold' },
  { marker: '_', type: 'italic' },
  { marker: '~', type: 'strikethrough' },
];

const URL_AT_START_PATTERN = /^(?:https?:\/\/|www\.)[^\s<>]+/iu;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;
const SIMPLE_TRAILING_URL_PUNCTUATION = /[.,!?;:]$/u;

const isWhitespace = (value?: string) => Boolean(value && /\s/u.test(value));
const isWordCharacter = (value?: string) => Boolean(value && WORD_CHARACTER_PATTERN.test(value));

const isOpeningBoundary = (text: string, index: number) =>
  index === 0 || !isWordCharacter(text[index - 1]);

const isClosingBoundary = (text: string, indexAfterMarker: number) =>
  indexAfterMarker >= text.length || !isWordCharacter(text[indexAfterMarker]);

const findClosingMarker = (text: string, start: number, marker: string) => {
  const contentStart = start + marker.length;
  if (contentStart >= text.length || isWhitespace(text[contentStart])) return -1;

  let closingIndex = text.indexOf(marker, contentStart);
  while (closingIndex !== -1) {
    const hasContent = closingIndex > contentStart;
    const endsWithoutWhitespace = !isWhitespace(text[closingIndex - 1]);
    const hasClosingBoundary = isClosingBoundary(text, closingIndex + marker.length);

    if (hasContent && endsWithoutWhitespace && hasClosingBoundary) return closingIndex;
    closingIndex = text.indexOf(marker, closingIndex + marker.length);
  }

  return -1;
};

const countCharacter = (value: string, character: string) =>
  Array.from(value).reduce((total, current) => total + Number(current === character), 0);

const trimTrailingUrlPunctuation = (rawUrl: string) => {
  let url = rawUrl;

  while (SIMPLE_TRAILING_URL_PUNCTUATION.test(url)) {
    url = url.slice(0, -1);
  }

  const pairedCharacters: Array<[string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ];

  let changed = true;
  while (changed && url) {
    changed = false;
    for (const [opening, closing] of pairedCharacters) {
      if (
        url.endsWith(closing)
        && countCharacter(url, closing) > countCharacter(url, opening)
      ) {
        url = url.slice(0, -1);
        changed = true;
      }
    }
  }

  return url;
};

const appendText = (nodes: WhatsAppTextNode[], value: string) => {
  if (!value) return;
  const previous = nodes[nodes.length - 1];
  if (previous?.type === 'text') {
    previous.value += value;
    return;
  }
  nodes.push({ type: 'text', value });
};

const parseSegment = (
  text: string,
  disabledMarkers: ReadonlySet<string>,
): WhatsAppTextNode[] => {
  const nodes: WhatsAppTextNode[] = [];
  let plainText = '';
  let index = 0;

  const flushPlainText = () => {
    appendText(nodes, plainText);
    plainText = '';
  };

  while (index < text.length) {
    const urlMatch = text.slice(index).match(URL_AT_START_PATTERN);
    if (urlMatch) {
      const rawUrl = urlMatch[0];
      const visibleUrl = trimTrailingUrlPunctuation(rawUrl);

      if (visibleUrl) {
        flushPlainText();
        nodes.push({
          type: 'link',
          value: visibleUrl,
          href: visibleUrl.toLocaleLowerCase().startsWith('www.')
            ? `https://${visibleUrl}`
            : visibleUrl,
        });
        index += visibleUrl.length;
        continue;
      }
    }

    let matchedFormat = false;
    for (const definition of FORMAT_DEFINITIONS) {
      const { marker, type } = definition;
      if (
        disabledMarkers.has(marker)
        || !text.startsWith(marker, index)
        || !isOpeningBoundary(text, index)
      ) {
        continue;
      }

      const closingIndex = findClosingMarker(text, index, marker);
      if (closingIndex === -1) continue;

      flushPlainText();
      const contentStart = index + marker.length;
      const innerText = text.slice(contentStart, closingIndex);
      const children = marker === '```' || marker === '`'
        ? [{ type: 'text' as const, value: innerText }]
        : parseSegment(innerText, new Set([...disabledMarkers, marker]));

      nodes.push({ type, children });
      index = closingIndex + marker.length;
      matchedFormat = true;
      break;
    }

    if (matchedFormat) continue;

    plainText += text[index];
    index += 1;
  }

  flushPlainText();
  return nodes;
};

export const parseWhatsAppText = (text?: string | null): WhatsAppTextNode[] =>
  parseSegment(String(text || ''), new Set());
