import { supabase } from '../../../../lib/supabase';
import {
  mapRelatorioTurmas,
  type RelatorioTurmasData,
  type RelatorioTurmasFilters,
} from './relatorio-turmas.contract';

export type {
  RelatorioTurmasData,
  RelatorioTurmasEmptyReason,
  RelatorioTurmasFilters,
  RelatorioTurmasLinha,
  RelatorioTurmasModalidade,
  RelatorioTurmasStatus,
} from './relatorio-turmas.contract';

export { mapRelatorioTurmas } from './relatorio-turmas.contract';

export const relatorioTurmasService = {
  async get(filters: RelatorioTurmasFilters): Promise<RelatorioTurmasData> {
    const { data, error } = await supabase.rpc('get_relatorio_turmas_secure', {
      p_polo_id: filters.poloId || null,
      p_modalidade: filters.modalidade || null,
      p_status: filters.status || null,
      p_busca: filters.busca?.trim() || null,
      p_limit: filters.limit ?? 200,
      p_offset: filters.offset ?? 0,
    });

    if (error) {
      console.error('Erro ao buscar o relatório canônico de turmas:', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    return mapRelatorioTurmas(data);
  },
};
