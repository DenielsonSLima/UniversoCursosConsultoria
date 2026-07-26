export const chunks = <T,>(items: T[], size: number): T[][] => {
  if (!items.length) return [[]];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

export const DIARIO_RESULT_LEGEND_TITLE = 'LEGENDA: Instrumentos Avaliativos:';

export const DIARIO_RESULT_LEGEND_TEXT = [
  'P - Prova',
  'TI - Trabalho Individual',
  'TG - Trabalho em Grupo',
  'S - Seminários',
  'CQ - Critérios Qualitativos (assiduidade, pontualidade, responsabilidade, participação = 1 ponto)',
  'O - Outros Instrumentos',
  'Resultado Final: APROVADO/REPROVADO',
].join(' / ');

export const moduloNumero = (nome: string) => {
  const match = nome.match(/M[ÓO]DULO\s+([IVXLC]+)/i);
  return match?.[1] || nome;
};
