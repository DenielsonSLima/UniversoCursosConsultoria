import type { EmprestimoFinanceiro, EmprestimoParcela } from './emprestimos.types';

export const emprestimosQueryKeys = {
  all: ['financeiro', 'emprestimos'] as const,
  list: (poloResponsavelId?: string | null) => [
    'financeiro',
    'emprestimos',
    'lista',
    poloResponsavelId || 'sem-polo',
  ] as const,
};

type EmprestimoRateioScopeSource = Pick<EmprestimoFinanceiro, 'rateioPoloIds'>
  | Pick<EmprestimoParcela, 'rateios'>;

/**
 * Extrai somente polos já definidos pelo backend. Na criação vêm no retorno
 * `rateio_polos`; na baixa já estão na parcela selecionada da listagem.
 */
export const getEmprestimoRateioPoloIds = (
  source?: EmprestimoRateioScopeSource | null,
) => {
  if (!source) return [];

  const poloIds = 'rateioPoloIds' in source
    ? source.rateioPoloIds
    : source.rateios.map((rateio) => rateio.poloId);

  return Array.from(new Set(
    poloIds.map((poloId) => poloId.trim()).filter(Boolean),
  ));
};

/**
 * Uma mutação altera o Caixa do polo responsável, o consolidado e, quando
 * existir, cada polo efetivamente rateado. Nunca invalida um prefixo global.
 */
export const emprestimosFinanciamentoScopes = (
  poloResponsavelId: string,
  source?: EmprestimoRateioScopeSource | null,
) => Array.from(new Set([
  ...getEmprestimoRateioPoloIds(source),
  poloResponsavelId.trim(),
  'todos',
].filter(Boolean)));
