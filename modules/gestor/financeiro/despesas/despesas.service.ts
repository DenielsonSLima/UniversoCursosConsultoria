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

const cancelarDespesa = async (id: string, motivo = 'Cancelada pelo gestor') => (
  cancelarOuEstornarDespesa(id, { requestId: createFinanceRequestId(), motivo })
);

export const despesasService = {
  getDespesas,
  createDespesa,
  markDespesaPaga,
  updateDespesa,
  cancelarOuEstornarDespesa,
  getDespesaReciboSnapshot,
  getDespesaAnexoUrl,
  cancelarDespesa,
  deleteDespesa: (id: string) => cancelarDespesa(id, 'Cancelada pelo gestor'),
  getCategoriasFinanceiras,
  createCategoriaFinanceira,
  updateCategoriaFinanceira,
  deleteCategoriaFinanceira,
  getAllCategoriasFinanceiras,
  getDespesasSummary,
  getDespesasGroupSummary,
};
