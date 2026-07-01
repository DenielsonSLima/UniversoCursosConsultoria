import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];

const ALLOWED_ATTR = [
  'align',
  'class',
  'colspan',
  'data-page-break',
  'height',
  'href',
  'rel',
  'rowspan',
  'style',
  'target',
  'title',
  'width',
];

const ALLOWED_CSS_PROPERTIES = new Set([
  'background-color',
  'border',
  'border-bottom',
  'border-collapse',
  'border-left',
  'border-radius',
  'border-right',
  'border-top',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'text-transform',
  'vertical-align',
  'white-space',
  'width',
]);

const UNSAFE_STYLE_VALUE = /(?:expression\s*\(|url\s*\(|@import|javascript:|vbscript:|data:|behavior\s*:|-moz-binding)/i;

const sanitizeStyleAttribute = (styleValue: string) =>
  styleValue
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex === -1) return '';

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (!ALLOWED_CSS_PROPERTIES.has(property)) return '';
      if (UNSAFE_STYLE_VALUE.test(value)) return '';

      return `${property}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'style') {
    const safeStyle = sanitizeStyleAttribute(data.attrValue || '');
    if (!safeStyle) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = safeStyle;
  }

  if (data.attrName === 'target' && data.attrValue === '_blank') {
    const element = _node as { setAttribute?: (name: string, value: string) => void };
    element.setAttribute?.('rel', 'noopener noreferrer');
  }
});

const SANITIZE_CONFIG = {
  ALLOWED_ATTR,
  ALLOWED_TAGS,
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['iframe', 'math', 'object', 'script', 'svg', 'template'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcdoc'],
};

export const sanitizeHtml = (html: string | null | undefined): string =>
  DOMPurify.sanitize(String(html || ''), SANITIZE_CONFIG);

export const sanitizedHtml = (html: string | null | undefined) => ({
  __html: sanitizeHtml(html),
});

export const sanitizeTemplateFields = <T extends { type?: string; value?: string }>(fields: T[] = []): T[] =>
  fields.map((field) =>
    field.type === 'text'
      ? {
          ...field,
          value: sanitizeHtml(field.value),
        }
      : field
  );
