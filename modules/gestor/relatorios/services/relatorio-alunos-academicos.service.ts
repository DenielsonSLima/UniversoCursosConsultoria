import { supabase } from '../../../../lib/supabase';
import {
  mapRelatorioAlunosAcademicos,
  type RelatorioAlunosAcademicosData,
  type RelatorioAlunosAcademicosFilters,
} from './relatorio-alunos-academicos.contract';

export type {
  RelatorioAlunosAcademicosData,
  RelatorioAlunosAcademicosEmptyReason,
  RelatorioAlunosAcademicosFilters,
  RelatorioAlunosAcademicosLinha,
  RelatorioAlunosAcademicosModalidade,
  RelatorioAlunosAcademicosModoBackend,
  RelatorioAlunosAcademicosStatus,
  RelatorioAlunosAcademicosTurma,
} from './relatorio-alunos-academicos.contract';

export { mapRelatorioAlunosAcademicos } from './relatorio-alunos-academicos.contract';

const normalizedRequest = (filters: RelatorioAlunosAcademicosFilters) => ({
  poloId: filters.poloId || null,
  modalidade: filters.modalidade || null,
  turmaId: filters.turmaId || null,
  status: filters.modo === 'CURSANDO'
    ? 'ATIVO'
    : filters.modo === 'FINALIZADOS'
      ? 'CONCLUIDO'
      : filters.status || null,
  busca: filters.busca?.trim().slice(0, 160) || null,
  limit: filters.limit ?? 200,
  offset: filters.offset ?? 0,
});

export const relatorioAlunosAcademicosService = {
  async get(filters: RelatorioAlunosAcademicosFilters): Promise<RelatorioAlunosAcademicosData> {
    const expected = normalizedRequest(filters);
    const { data, error } = await supabase.rpc('get_relatorio_alunos_academicos_secure', {
      p_modo: filters.modo,
      p_polo_id: expected.poloId,
      p_modalidade: expected.modalidade,
      p_turma_id: expected.turmaId,
      p_status: expected.status,
      p_busca: expected.busca,
      p_limit: expected.limit,
      p_offset: expected.offset,
    });

    if (error) {
      console.error('Erro ao buscar o relatório acadêmico canônico:', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    const result = mapRelatorioAlunosAcademicos(data);
    if (
      result.meta.modo !== filters.modo
      || result.filtrosAplicados.poloId !== expected.poloId
      || result.filtrosAplicados.modalidade !== expected.modalidade
      || result.filtrosAplicados.turmaId !== expected.turmaId
      || result.filtrosAplicados.status !== expected.status
      || result.filtrosAplicados.busca !== expected.busca
      || result.pageInfo.limit !== expected.limit
      || result.pageInfo.offset !== expected.offset
    ) {
      throw new Error('O relatório acadêmico retornou dados de uma solicitação diferente da atual.');
    }

    return result;
  },
};
