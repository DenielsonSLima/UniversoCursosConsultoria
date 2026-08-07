export interface ContratoAlunoClosingParty {
  label: string;
  value: string;
}

export interface ContratoAlunoClosingLayout {
  /** Texto de encerramento para modelos que não seguem a estrutura da minuta. */
  fallbackText: string | null;
  location: string | null;
  parties: ContratoAlunoClosingParty[];
  witnesses: ContratoAlunoClosingParty[];
  additionalLines: string[];
}

const normalizeLineBreaks = (value: string) => value
  .replace(/\r\n?/g, '\n')
  .replace(/\\r\\n/g, '\n')
  .replace(/\\n/g, '\n');

const normalizeLabel = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const toVisibleValue = (value: string) => value
  .replace(/[_–—-]+/g, '')
  .trim();

const splitLabelAndValue = (line: string, expression: RegExp) => {
  const match = line.match(expression);
  if (!match) return null;
  return {
    label: match[1].trim().toUpperCase(),
    value: toVisibleValue(match[2] || ''),
  };
};

/**
 * Reconhece o encerramento da minuta sem alterar o texto que o usuário edita.
 * Quando há contratante/contratada, a prévia e o PDF podem desenhar as linhas
 * de assinatura lado a lado; conteúdos livres continuam sendo exibidos como
 * texto multilinear para não perder informação de modelos customizados.
 */
export const parseContratoAlunoClosingLayout = (value: string | null | undefined): ContratoAlunoClosingLayout => {
  const text = normalizeLineBreaks(String(value || '')).trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const parties: ContratoAlunoClosingParty[] = [];
  const witnesses: ContratoAlunoClosingParty[] = [];
  const additionalLines: string[] = [];
  const locationLines: string[] = [];
  let witnessSection = false;

  lines.forEach((line) => {
    const normalized = normalizeLabel(line);
    const party = splitLabelAndValue(line, /^(CONTRATANTE|CONTRATADA)\s*:?\s*(.*)$/i);

    if (party) {
      parties.push(party);
      witnessSection = false;
      return;
    }

    if (/^TESTEMUNHAS?\b/.test(normalized)) {
      witnessSection = true;
      const witnessRawValue = line.replace(/^testemunhas?\s*:?\s*/i, '').trim();
      if (witnessRawValue) {
        witnesses.push({ label: `TESTEMUNHA ${witnesses.length + 1}`, value: toVisibleValue(witnessRawValue) });
      }
      return;
    }

    if (witnessSection) {
      witnesses.push({ label: `TESTEMUNHA ${witnesses.length + 1}`, value: toVisibleValue(line) });
      return;
    }

    if (!parties.length) {
      locationLines.push(line);
      return;
    }

    additionalLines.push(line);
  });

  const isStructured = parties.length > 0;
  if (!isStructured) {
    return {
      fallbackText: text || null,
      location: null,
      parties: [],
      witnesses: [],
      additionalLines: [],
    };
  }

  return {
    fallbackText: null,
    location: locationLines.join(' ' ) || null,
    parties,
    witnesses: witnesses.slice(0, 2),
    additionalLines,
  };
};
