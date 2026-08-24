export interface VoterTemplateField {
  token: string;
  markup: string;
}

export const injectMissingVoterFields = (
  html: unknown,
  fields: readonly VoterTemplateField[],
  placement: 'SECTION' | 'INNER_GRID' = 'SECTION',
) => {
  const currentHtml = String(html || '');
  const missingMarkup = fields
    .filter(({ token }) => !currentHtml.includes(token))
    .map(({ markup }) => markup)
    .join('\n');

  if (!missingMarkup) return currentHtml;

  const lowerHtml = currentHtml.toLowerCase();
  const sectionCloseIndex = lowerHtml.lastIndexOf('</section>');
  if (sectionCloseIndex < 0) return `${currentHtml}\n${missingMarkup}`;

  const innerGridCloseIndex = placement === 'INNER_GRID'
    ? lowerHtml.lastIndexOf('</div>', sectionCloseIndex)
    : -1;
  const insertionIndex = innerGridCloseIndex >= 0
    ? innerGridCloseIndex
    : sectionCloseIndex;

  return `${currentHtml.slice(0, insertionIndex)}${missingMarkup}\n${currentHtml.slice(insertionIndex)}`;
};

const fichaVoterCell = (label: string, value: string, span = '') => `
  <div style="${span}min-width:0;min-height:0;overflow:hidden;">
    <strong style="display:block;margin-bottom:3px;font-size:8px;line-height:1.15;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">${label}</strong>
    <span style="display:-webkit-box;font-size:inherit;line-height:1.25;color:#334155;font-weight:400;overflow:hidden;overflow-wrap:anywhere;word-break:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;">${value}</span>
  </div>
`;

interface BalancedDiv {
  start: number;
  end: number;
  openTag: string;
  closeTag: string;
  inner: string;
  full: string;
}

const extractBalancedDiv = (html: string, start: number): BalancedDiv | null => {
  const opening = /^<div\b[^>]*>/i.exec(html.slice(start));
  if (!opening) return null;

  const openTag = opening[0];
  const tokenPattern = /<\/?div\b[^>]*>/ig;
  tokenPattern.lastIndex = start + openTag.length;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    depth += /^<\//.test(token[0]) ? -1 : 1;
    if (depth !== 0) continue;
    const end = token.index + token[0].length;
    return {
      start,
      end,
      openTag,
      closeTag: token[0],
      inner: html.slice(start + openTag.length, token.index),
      full: html.slice(start, end),
    };
  }
  return null;
};

const collectDirectDivs = (html: string) => {
  const cells: BalancedDiv[] = [];
  const tokenPattern = /<\/?div\b[^>]*>/ig;
  let depth = 0;
  let start = -1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    if (!/^<\//.test(token[0])) {
      if (depth === 0) start = token.index;
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      const cell = extractBalancedDiv(html, start);
      if (cell) cells.push(cell);
      start = -1;
    }
  }
  return cells;
};

const templateTextContent = (markup: string) => markup
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, '');

const cellHasToken = (cell: BalancedDiv, token: string) => (
  templateTextContent(cell.inner).includes(token)
);

const fichaVoterGridAnchors = [
  '{{ALUNO_RG}}',
  '{{ALUNO_RG_ORGAO}}',
  '{{ALUNO_RG_EMISSAO}}',
  '{{ALUNO_CPF}}',
  '{{ALUNO_RESERVISTA}}',
] as const;

interface FichaVoterGrid extends BalancedDiv {
  cells: BalancedDiv[];
  anchorCellCount: number;
}

const findFichaVoterGrid = (html: string): FichaVoterGrid | null => {
  const candidates: FichaVoterGrid[] = [];
  const pattern = /<div\b[^>]*>/ig;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const style = match[0].match(/\bstyle=(['"])([\s\S]*?)\1/i)?.[2] || '';
    if (!/display\s*:\s*grid/i.test(style)) continue;

    const grid = extractBalancedDiv(html, match.index);
    if (!grid) continue;
    const cells = collectDirectDivs(grid.inner);
    const anchorCells = fichaVoterGridAnchors.map((token) => (
      cells.filter((cell) => cellHasToken(cell, token))
    ));
    if (
      anchorCells.some((matches) => matches.length !== 1)
      || new Set(anchorCells.map(([cell]) => cell)).size !== fichaVoterGridAnchors.length
    ) continue;

    candidates.push({
      ...grid,
      cells,
      anchorCellCount: cells.filter((cell) => (
        fichaVoterGridAnchors.some((token) => cellHasToken(cell, token))
      )).length,
    });
  }

  if (!candidates.length) return null;
  const bestAnchorCount = Math.max(...candidates.map(({ anchorCellCount }) => anchorCellCount));
  const bestCandidates = candidates.filter(({ anchorCellCount }) => anchorCellCount === bestAnchorCount);
  const innermostCandidates = bestCandidates.filter((candidate) => !bestCandidates.some((other) => (
    other !== candidate
    && other.start > candidate.start
    && other.end < candidate.end
  )));
  if (innermostCandidates.length !== 1) {
    throw new Error('A Ficha de Matrícula possui mais de uma grade eleitoral compatível; o reparo foi recusado.');
  }
  return innermostCandidates[0];
};

const withGridSpan = (markup: string, span = 1) => markup.replace(
  /<div\b[^>]*>/i,
  (openTag) => {
    const styleMatch = openTag.match(/\bstyle=(['"])([\s\S]*?)\1/i);
    const properties = (styleMatch?.[2] || '')
      .split(';')
      .map((property) => property.trim())
      .filter(Boolean)
      .filter((property) => !/^grid-column\s*:/i.test(property));
    if (span > 1) properties.unshift(`grid-column:span ${span}`);
    const style = properties.length ? `${properties.join(';')};` : '';

    if (styleMatch) {
      return openTag.replace(
        styleMatch[0],
        style ? `style=${styleMatch[1]}${style}${styleMatch[1]}` : '',
      );
    }
    return style ? openTag.replace(/^<div\b/i, `<div style="${style}"`) : openTag;
  },
);

type FichaVoterSlot =
  | 'rg'
  | 'issuer'
  | 'issueDate'
  | 'cpf'
  | 'voterId'
  | 'voterZone'
  | 'voterSection'
  | 'voterIssueState'
  | 'reservist';

const fichaVoterSlotTokens: Record<FichaVoterSlot, readonly string[]> = {
  rg: ['{{ALUNO_RG}}'],
  issuer: ['{{ALUNO_RG_ORGAO}}', '{{ALUNO_RG_UF}}'],
  issueDate: ['{{ALUNO_RG_EMISSAO}}'],
  cpf: ['{{ALUNO_CPF}}'],
  voterId: ['{{ALUNO_TITULO_ELEITOR}}'],
  voterZone: ['{{ALUNO_TITULO_ZONA}}'],
  voterSection: ['{{ALUNO_TITULO_SECAO}}'],
  voterIssueState: ['{{ALUNO_TITULO_EMISSAO}}', '{{ALUNO_TITULO_UF}}'],
  reservist: ['{{ALUNO_RESERVISTA}}'],
};

const hasOnlyDirectDivWhitespace = (grid: FichaVoterGrid) => {
  let cursor = 0;
  let remainder = '';
  for (const cell of grid.cells) {
    remainder += grid.inner.slice(cursor, cell.start);
    cursor = cell.end;
  }
  remainder += grid.inner.slice(cursor);
  return !remainder.trim();
};

const canonicalizeFichaVoterCells = (html: string) => {
  const grid = findFichaVoterGrid(html);
  if (!grid?.cells.length || !hasOnlyDirectDivWhitespace(grid)) return null;

  const cellsBySlot = new Map<FichaVoterSlot, BalancedDiv[]>();
  for (const cell of grid.cells) {
    const slots = (Object.entries(fichaVoterSlotTokens) as Array<[
      FichaVoterSlot,
      readonly string[],
    ]>).filter(([, tokens]) => tokens.some((token) => cellHasToken(cell, token)));
    if (slots.length !== 1) return null;
    const [slot] = slots[0];
    cellsBySlot.set(slot, [...(cellsBySlot.get(slot) || []), cell]);
  }

  const requiredSlots: FichaVoterSlot[] = ['rg', 'issuer', 'issueDate', 'cpf', 'reservist'];
  if (requiredSlots.some((slot) => cellsBySlot.get(slot)?.length !== 1)) return null;
  if ([...cellsBySlot].some(([slot, cells]) => slot !== 'voterIssueState' && cells.length !== 1)) {
    return null;
  }

  const voterIssueStateCells = cellsBySlot.get('voterIssueState') || [];
  const hasSafeCombinedIssueState = voterIssueStateCells.length === 0 || (
    voterIssueStateCells.length === 1
    && cellHasToken(voterIssueStateCells[0], '{{ALUNO_TITULO_EMISSAO}}')
    && cellHasToken(voterIssueStateCells[0], '{{ALUNO_TITULO_UF}}')
  );
  if (!hasSafeCombinedIssueState) return null;

  const markupFor = (slot: FichaVoterSlot, label: string, value: string) => (
    cellsBySlot.get(slot)?.[0]?.full || fichaVoterCell(label, value)
  );
  const rg = markupFor('rg', 'RG / documento', '{{ALUNO_RG}}');
  const issuer = markupFor('issuer', 'Órgão expedidor / UF', '{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}');
  const issueDate = markupFor('issueDate', 'Data de expedição', '{{ALUNO_RG_EMISSAO}}');
  const cpf = markupFor('cpf', 'CPF', '{{ALUNO_CPF}}');
  const voterId = markupFor('voterId', 'Título eleitoral', '{{ALUNO_TITULO_ELEITOR}}');
  const voterZone = markupFor('voterZone', 'Zona', '{{ALUNO_TITULO_ZONA}}');
  const voterSection = markupFor('voterSection', 'Seção', '{{ALUNO_TITULO_SECAO}}');
  const reservist = markupFor('reservist', 'Reservista', '{{ALUNO_RESERVISTA}}');
  const combinedIssueState = voterIssueStateCells.length === 1
      && cellHasToken(voterIssueStateCells[0], '{{ALUNO_TITULO_EMISSAO}}')
      && cellHasToken(voterIssueStateCells[0], '{{ALUNO_TITULO_UF}}')
    ? voterIssueStateCells[0].full
    : fichaVoterCell(
        'Emissão / UF',
        '{{ALUNO_TITULO_EMISSAO}} / {{ALUNO_TITULO_UF}}',
      );
  const canonicalCell = (markup: string, span = 1) => withGridSpan(markup, span).trim();

  const canonicalCells = [
    canonicalCell(rg, 2),
    canonicalCell(issuer, 2),
    canonicalCell(issueDate),
    canonicalCell(cpf),
    canonicalCell(voterId, 2),
    canonicalCell(voterZone),
    canonicalCell(voterSection),
    canonicalCell(combinedIssueState),
    canonicalCell(reservist),
  ];
  const canonicalGrid = `${grid.openTag}\n${canonicalCells.join('\n')}\n${grid.closeTag}`;
  return `${html.slice(0, grid.start)}${canonicalGrid}${html.slice(grid.end)}`;
};

const normalizeFichaVoterGrid = (html: string) => {
  const grid = findFichaVoterGrid(html);
  if (!grid) return html;
  const styleMatch = grid.openTag.match(/\bstyle=(['"])([\s\S]*?)\1/i);
  if (!styleMatch || !/grid-template-columns\s*:/i.test(styleMatch[2])) return html;

  let style = styleMatch[2].replace(
    /grid-template-columns\s*:[^;]+;?/i,
    'grid-template-columns:1.15fr 1.15fr .6fr .6fr 1fr 1fr;',
  );
  style = /grid-template-rows\s*:/i.test(style)
    ? style.replace(
        /grid-template-rows\s*:[^;]+;?/i,
        'grid-template-rows:repeat(2,minmax(0,1fr));',
      )
    : `${style};grid-template-rows:repeat(2,minmax(0,1fr));`;
  const normalizedOpenTag = grid.openTag.replace(
    styleMatch[0],
    `style=${styleMatch[1]}${style}${styleMatch[1]}`,
  );
  return `${html.slice(0, grid.start)}${normalizedOpenTag}${html.slice(grid.start + grid.openTag.length)}`;
};

export const repairFichaVoterGrid = (html: unknown) => {
  const currentHtml = String(html || '');
  const canonical = canonicalizeFichaVoterCells(currentHtml);
  if (canonical) return normalizeFichaVoterGrid(canonical);

  const voterTokens = [
    '{{ALUNO_TITULO_ELEITOR}}',
    '{{ALUNO_TITULO_ZONA}}',
    '{{ALUNO_TITULO_SECAO}}',
    '{{ALUNO_TITULO_EMISSAO}}',
    '{{ALUNO_TITULO_UF}}',
  ];
  const grid = findFichaVoterGrid(currentHtml);
  const visibleMarkup = grid
    ? grid.cells.map(({ inner }) => templateTextContent(inner)).join('\n')
    : templateTextContent(currentHtml);
  if (voterTokens.every((token) => visibleMarkup.includes(token))) return currentHtml;

  throw new Error(
    'A grade eleitoral da Ficha de Matrícula não possui uma topologia segura para completar Zona, Seção e UF.',
  );
};
