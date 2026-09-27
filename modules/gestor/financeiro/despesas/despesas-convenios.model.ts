import type { CreateDespesaInput } from './despesas.types';

export const validateConvenioExpenseMvp = (input: CreateDespesaInput) => {
  if (!input.convenioMesId) return;
  if (input.rateio || input.splitTotal || (input.totalParcelas || 1) !== 1) {
    throw new Error(
      'No MVP, a despesa de convênio deve ser integral, sem rateio e em parcela única.',
    );
  }
};
