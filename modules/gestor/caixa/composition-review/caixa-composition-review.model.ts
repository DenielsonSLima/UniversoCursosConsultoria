import type { CaixaReportReceipt } from '../report/caixa-report.types.ts';

export type CompositionReviewFilter = 'DIFFERENCE' | 'MISSING_DETAIL';

/** Only classifies canonical backend fields; never calculates financial values. */
export function isIncompleteReceipt(row: CaixaReportReceipt): boolean {
  return [row.valorBase, row.juros, row.multa, row.acrescimo, row.desconto,
    row.diferencaNaoDiscriminada, row.composicaoStatus].some(value => value === null)
    || ['NAO_DISCRIMINADA_PELO_GATEWAY', 'NAO_DISCRIMINADA', 'PARCIAL_POR_API_PROESC'].includes(row.composicaoStatus)
    || (['CALCULADO_REGRA_INFORMADA_PROESC', 'API_E_REGRA_INFORMADA_PROESC'].includes(row.composicaoStatus)
      && row.diferencaNaoDiscriminada !== 0);
}

export function selectCompositionReviewRows(rows: CaixaReportReceipt[], filter: CompositionReviewFilter) {
  return rows.filter(row => isIncompleteReceipt(row)
    && (filter === 'DIFFERENCE' ? row.diferencaNaoDiscriminada !== 0 : row.diferencaNaoDiscriminada === 0));
}

export function compositionReviewPage(rows: CaixaReportReceipt[], page: number, pageSize = 20) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('Página inválida.');
  }
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

export function compositionReviewReason(row: CaixaReportReceipt) {
  return row.diferencaNaoDiscriminada === 0
    ? 'Sem diferença de valor, mas faltam componentes comprovados na origem.'
    : 'O valor recebido não está totalmente explicado pelos componentes identificados. A diferença não comprova desconto nem dívida.';
}

export function compositionReviewOrigin(row: CaixaReportReceipt) {
  const labels: Record<string, string> = {
    COMPOSICAO_EXPLICITA: 'Composição explícita',
    SEM_DIFERENCA_FINANCEIRA: 'Sem diferença financeira',
    NAO_DISCRIMINADA: 'Origem sem composição discriminada',
    NAO_DISCRIMINADA_PELO_GATEWAY: 'Gateway sem composição discriminada',
    CONCILIADO_POR_FORMULA_BANESE: 'Fórmula Banese',
    CONCILIADO_POR_CONFERENCIA_PROESC: 'Conferência Proesc',
    PARCIAL_POR_API_PROESC: 'API Proesc: composição parcial',
    CALCULADO_REGRA_INFORMADA_PROESC: 'Regra informada pela Proesc',
    API_E_REGRA_INFORMADA_PROESC: 'API e regra informada pela Proesc',
  };
  return labels[row.composicaoStatus] ?? 'Não informado';
}
