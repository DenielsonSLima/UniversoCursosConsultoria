import {
  createCategoriaFinanceira,
  deleteCategoriaFinanceira,
  getAllCategoriasFinanceiras,
  getCategoriasFinanceiras,
  updateCategoriaFinanceira,
} from './despesas-categorias.service';
import {
  cancelarOuEstornarDespesa,
  createDespesa,
  excluirDespesasPendentes,
  getDespesaAnexoUrl,
  getDespesaReciboSnapshot,
  getDespesas,
  markDespesaPaga,
  updateDespesa,
} from './despesas-lancamentos.service';
import { getDespesasGroupSummary, getDespesasSummary } from './despesas-resumos.service';

export * from './despesas.types';

export const createFinanceRequestId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
      })
);

export const despesasService = {
  getDespesas,
  createDespesa,
  markDespesaPaga,
  updateDespesa,
  cancelarOuEstornarDespesa,
  excluirDespesasPendentes,
  getDespesaReciboSnapshot,
  getDespesaAnexoUrl,
  getCategoriasFinanceiras,
  createCategoriaFinanceira,
  updateCategoriaFinanceira,
  deleteCategoriaFinanceira,
  getAllCategoriasFinanceiras,
  getDespesasSummary,
  getDespesasGroupSummary,
};
