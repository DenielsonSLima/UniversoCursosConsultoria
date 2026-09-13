export interface FinancialCompositionPresentation {
  label: string;
  tone: 'confirmed' | 'calculated' | 'partial';
}

const COMPOSITION_PRESENTATIONS: Record<string, FinancialCompositionPresentation> = {
  COMPOSICAO_EXPLICITA: { label: 'Composição informada na baixa manual.', tone: 'confirmed' },
  CONCILIADO_POR_FORMULA_BANESE: {
    label: 'Composição reconciliada pelas regras financeiras do título.', tone: 'confirmed',
  },
  CONCILIADO_POR_CONFERENCIA_PROESC: { label: 'Composição conferida no Proesc.', tone: 'confirmed' },
  PARCIAL_POR_API_PROESC: {
    label: 'Componentes informados pelo Proesc. Os demais valores continuam em conferência.', tone: 'partial',
  },
  CALCULADO_REGRA_INFORMADA_PROESC: {
    label: 'Calculado pelas regras informadas.', tone: 'calculated',
  },
  API_E_REGRA_INFORMADA_PROESC: {
    label: 'Dados Proesc complementados pelas regras informadas.', tone: 'calculated',
  },
  SEM_DIFERENCA_FINANCEIRA: { label: 'Valor recebido sem diferença financeira.', tone: 'confirmed' },
};

export const getFinancialCompositionPresentation = (
  status?: string,
): FinancialCompositionPresentation | undefined => (
  status && Object.hasOwn(COMPOSITION_PRESENTATIONS, status)
    ? COMPOSITION_PRESENTATIONS[status]
    : undefined
);

export const isProescFinancialComposition = (status?: string) => [
  'CONCILIADO_POR_CONFERENCIA_PROESC',
  'PARCIAL_POR_API_PROESC',
  'CALCULADO_REGRA_INFORMADA_PROESC',
  'API_E_REGRA_INFORMADA_PROESC',
].includes(status || '');

const optionalAmount = (value: unknown): number | undefined => {
  if (typeof value !== 'number' && (
    typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)
  )) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
};

// Presentation maps only amounts supplied by the canonical RPC. It never
// reconstructs a discount, penalty, interest or residual from totals/dates.
export const mapReceivableFinancialComposition = (row: Record<string, unknown>) => ({
  descontoAplicado: optionalAmount(row.desconto_aplicado),
  jurosAplicados: optionalAmount(row.juros_aplicados),
  multaAplicada: optionalAmount(row.multa_aplicada),
  acrescimoAplicado: optionalAmount(row.acrescimo_aplicado),
  diferencaNaoDiscriminada: optionalAmount(row.diferenca_nao_discriminada),
  composicaoStatus: typeof row.composicao_status === 'string' ? row.composicao_status : undefined,
  composicaoProveniencia: typeof row.composicao_proveniencia === 'string'
    ? row.composicao_proveniencia : undefined,
});
