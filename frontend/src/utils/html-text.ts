const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '(c)',
  euro: 'EUR',
  gt: '>',
  hellip: '...',
  laquo: '«',
  ldquo: '"',
  lsquo: "'",
  lt: '<',
  mdash: '-',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
  raquo: '»',
  reg: '(R)',
  rdquo: '"',
  rsquo: "'",
  trade: 'TM',
};

const HTML_TAG_NAMES = [
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base',
  'bdi', 'bdo', 'blockquote', 'br', 'button', 'canvas', 'caption', 'cite',
  'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input',
  'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark',
  'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option',
  'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'script', 'section', 'select', 'slot', 'small',
  'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead',
  'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
] as const;
const HTML_TAG_PATTERN = new RegExp(
  `</?(?:${HTML_TAG_NAMES.join('|')})(?:\\s[^<>]*)?/?>`,
  'gi',
);
const HTML_BLOCK_TAG_PATTERN = new RegExp(
  `<(?:script|style|template)(?:\\s[^<>]*)?>[\\s\\S]*?</(?:script|style|template)>`,
  'gi',
);

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    if (body.startsWith('#')) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

export function cleanDisplayText(value: string): string {
  return decodeHtmlEntities(stripHtmlTags(value))
    .replace(HTML_BLOCK_TAG_PATTERN, ' ')
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlTags(value: string): string {
  return value
    .replace(HTML_BLOCK_TAG_PATTERN, ' ')
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
