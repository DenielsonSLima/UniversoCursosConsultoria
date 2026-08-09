export interface ContractSemanticRun {
  text: string;
  bold: boolean;
  accent: boolean;
}

interface ContractSemanticFormatOptions {
  snapshot?: unknown;
  criticalHighlights?: unknown;
}

/**
 * Destaques editoriais extraídos da minuta institucional. Eles são apenas
 * apresentação: não alteram, completam ou reinterpretam o texto jurídico.
 */
export const DEFAULT_CONTRACT_CRITICAL_HIGHLIGHTS = [
  'devolução do valor pago a título de matrícula',
  'As datas para realização de rematrícula',
  'O pagamento será realizado pelos meios institucionais de cobrança disponibilizados pela CONTRATADA',
  'A eventual ampliação da duração do curso ou reposição de componentes',
  'emitirá o certificado de conclusão conforme padrão e prazos institucionais',
] as const;

const DYNAMIC_TEMPLATE_TOKENS = [
  '{{curso.nome}}',
  '{{curso.modalidade}}',
  '{{curso.cargaHoraria}}',
  '{{turma.inicio}}',
  '{{turma.previsaoTermino}}',
  '{{financeiro.valorMatricula}}',
  '{{financeiro.valorRematricula}}',
  '{{financeiro.quantidadeParcelas}}',
  '{{financeiro.valorParcela}}',
  '{{financeiro.diaVencimento}}',
  '{{financeiro.primeiroVencimento}}',
  '{{financeiro.condicoes}}',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const readPath = (value: unknown, path: readonly string[]) => {
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current)) return '';
    current = current[part];
  }
  return typeof current === 'string' || typeof current === 'number'
    ? String(current).trim()
    : '';
};

export const normalizeContractCriticalHighlights = (
  value: unknown,
): string[] => {
  const source = Array.isArray(value)
    ? value
    : DEFAULT_CONTRACT_CRITICAL_HIGHLIGHTS;
  return [...new Set(source
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 3)
    .map((item) => item.slice(0, 500)))]
    .slice(0, 40);
};

const markRange = (
  marks: boolean[],
  start: number,
  length: number,
) => {
  const end = Math.min(marks.length, start + length);
  for (let index = Math.max(0, start); index < end; index += 1) {
    marks[index] = true;
  }
};

const markExactOccurrences = (
  text: string,
  marks: boolean[],
  needle: string,
) => {
  if (!needle) return;
  const haystack = text.toLocaleLowerCase('pt-BR');
  const normalizedNeedle = needle.toLocaleLowerCase('pt-BR');
  let cursor = 0;
  while (cursor < haystack.length) {
    const index = haystack.indexOf(normalizedNeedle, cursor);
    if (index < 0) return;
    markRange(marks, index, needle.length);
    cursor = index + Math.max(needle.length, 1);
  }
};

const markStructuralLabels = (text: string, marks: boolean[]) => {
  const structuralLabel = /(^|\n)(ALUNO:|CONTRATANTE:|CONTRATADA(?=\s)|OBJETO DO PRESENTE INSTRUMENTO:|CL[ÁA]USULA\s+\d+[ªº°]?\s*[-–—]?|PAR[ÁA]GRAFO\s+\d+[º°]?\s*[-–—]?)/gimu;
  let match: RegExpExecArray | null;
  while ((match = structuralLabel.exec(text)) !== null) {
    const leadingBreakLength = match[1]?.length || 0;
    const label = match[2] || '';
    markRange(marks, match.index + leadingBreakLength, label.length);
  }
};

const DYNAMIC_VALUE_PATHS = [
  ['curso', 'nome'],
  ['curso', 'modalidade'],
  ['curso', 'cargaHoraria'],
  ['turma', 'inicioExibicao'],
  ['turma', 'previsaoTerminoExibicao'],
  ['financeiro', 'valorMatriculaExibicao'],
  ['financeiro', 'valorRematriculaExibicao'],
  ['financeiro', 'valorParcelaExibicao'],
  ['financeiro', 'primeiroVencimentoExibicao'],
  ['financeiro', 'descontoPontualidadeExibicao'],
  ['financeiro', 'jurosAtrasoExibicao'],
  ['financeiro', 'multaAtrasoExibicao'],
] as const;

const markContextualNumericValue = (
  text: string,
  marks: boolean[],
  value: string,
  context: RegExp,
) => {
  if (!value) return;
  const haystack = text.toLocaleLowerCase('pt-BR');
  const needle = value.toLocaleLowerCase('pt-BR');
  let cursor = 0;
  while (cursor < haystack.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) return;
    const prefix = text.slice(Math.max(0, index - 72), index);
    if (context.test(prefix)) markRange(marks, index, value.length);
    context.lastIndex = 0;
    cursor = index + Math.max(value.length, 1);
  }
};

/**
 * Converte o corpo canônico em trechos estilizados sem inserir HTML. O texto
 * continua idêntico e selecionável; apenas peso e cor são acrescentados.
 */
export const buildContractSemanticRuns = (
  value: string | null | undefined,
  options: ContractSemanticFormatOptions = {},
): ContractSemanticRun[] => {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n');
  if (!text) return [];

  const boldMarks = Array.from({ length: text.length }, () => false);
  const accentMarks = Array.from({ length: text.length }, () => false);
  markStructuralLabels(text, boldMarks);

  DYNAMIC_TEMPLATE_TOKENS.forEach((token) => {
    markExactOccurrences(text, accentMarks, token);
  });

  DYNAMIC_VALUE_PATHS.forEach((path) => {
    const dynamicValue = readPath(options.snapshot, path);
    if (dynamicValue.length >= 3) {
      markExactOccurrences(text, accentMarks, dynamicValue);
    }
  });

  markContextualNumericValue(
    text,
    accentMarks,
    readPath(options.snapshot, ['financeiro', 'quantidadeParcelas']),
    /parcelas?|dividid[oa]\s+em/i,
  );
  markContextualNumericValue(
    text,
    accentMarks,
    readPath(options.snapshot, ['financeiro', 'diaVencimento']),
    /vencimento|dia\s+(?:útil|util)/i,
  );
  markContextualNumericValue(
    text,
    accentMarks,
    readPath(options.snapshot, ['curso', 'cargaHoraria']),
    /carga\s+horária|horas?/i,
  );

  normalizeContractCriticalHighlights(options.criticalHighlights)
    .forEach((highlight) => markExactOccurrences(text, accentMarks, highlight));

  const runs: ContractSemanticRun[] = [];
  let start = 0;
  for (let index = 1; index <= text.length; index += 1) {
    const changed = index === text.length
      || boldMarks[index] !== boldMarks[start]
      || accentMarks[index] !== accentMarks[start];
    if (!changed) continue;
    runs.push({
      text: text.slice(start, index),
      bold: boldMarks[start],
      accent: accentMarks[start],
    });
    start = index;
  }
  return runs;
};

export const contractSemanticPlainText = (
  runs: readonly ContractSemanticRun[],
) => runs.map((run) => run.text).join('');
