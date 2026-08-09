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

const normalizeFichaVoterGrid = (html: string) => {
  let normalized = false;
  return html.replace(/<div\b[^>]*>/gi, (tag) => {
    if (normalized) return tag;
    const styleMatch = tag.match(/\bstyle=(['"])([\s\S]*?)\1/i);
    if (!styleMatch || !/display\s*:\s*grid/i.test(styleMatch[2])) return tag;
    if (!/grid-template-columns\s*:/i.test(styleMatch[2])) return tag;

    normalized = true;
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
    return tag.replace(styleMatch[0], `style=${styleMatch[1]}${style}${styleMatch[1]}`);
  });
};

export const repairFichaVoterGrid = (html: unknown) => {
  const currentHtml = String(html || '');
  const issueToken = '{{ALUNO_TITULO_EMISSAO}}';
  const stateToken = '{{ALUNO_TITULO_UF}}';
  const fields: VoterTemplateField[] = [
    {
      token: '{{ALUNO_TITULO_ELEITOR}}',
      markup: fichaVoterCell(
        'Título eleitoral',
        '{{ALUNO_TITULO_ELEITOR}}',
        'grid-column:span 2;',
      ),
    },
    {
      token: '{{ALUNO_TITULO_ZONA}}',
      markup: fichaVoterCell('Zona', '{{ALUNO_TITULO_ZONA}}'),
    },
    {
      token: '{{ALUNO_TITULO_SECAO}}',
      markup: fichaVoterCell('Seção', '{{ALUNO_TITULO_SECAO}}'),
    },
  ];

  if (!currentHtml.includes(issueToken) && !currentHtml.includes(stateToken)) {
    fields.push({
      token: issueToken,
      markup: fichaVoterCell(
        'Emissão / UF',
        `${issueToken} / ${stateToken}`,
        'grid-column:span 2;',
      ),
    });
  } else {
    if (!currentHtml.includes(issueToken)) {
      fields.push({ token: issueToken, markup: fichaVoterCell('Emissão', issueToken) });
    }
    if (!currentHtml.includes(stateToken)) {
      fields.push({ token: stateToken, markup: fichaVoterCell('UF', stateToken) });
    }
  }

  return injectMissingVoterFields(
    normalizeFichaVoterGrid(currentHtml),
    fields,
    'INNER_GRID',
  );
};
