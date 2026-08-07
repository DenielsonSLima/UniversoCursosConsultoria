import { supabase } from '../../../../../lib/supabase';
import {
  CensoReadinessFilters,
  CensoReadinessRow,
} from './matricula-inicial.types';
import { validateCensoReadiness } from './matricula-inicial.validation';

const PAGE_SIZE = 500;

export const matriculaInicialCensoService = {
  async getReadiness(filters: CensoReadinessFilters, signal?: AbortSignal) {
    const rows: CensoReadinessRow[] = [];
    let page = 0;

    while (true) {
      let query = supabase
        .from('matriculas')
        .select(`
          id, aluno_id, turma_id, status,
          parceiros!inner(
            nome, cpf_cnpj, data_nascimento, sexo, nome_mae, raca_cor,
            naturalidade, nacionalidade, cep, endereco, cidade, uf
          ),
          turmas!inner(
            id, nome, codigo, data_inicio, data_previsao_termino, turno, polo_id,
            cursos!inner(nome, modalidade),
            polos(nome, cidade)
          )
        `)
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (signal) query = query.abortSignal(signal);
      if (filters.poloId) query = query.eq('turmas.polo_id', filters.poloId);
      if (filters.modalidade !== 'todos') {
        query = query.eq('turmas.cursos.modalidade', filters.modalidade);
      }
      if (filters.status !== 'todos') query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;

      const batch = (data || []).map((row: any): CensoReadinessRow => {
        const aluno = row.parceiros || {};
        const turma = row.turmas || {};
        const curso = turma.cursos || {};
        const polo = turma.polos || {};
        return {
          matriculaId: row.id,
          alunoId: row.aluno_id,
          alunoNome: aluno.nome || 'Aluno não informado',
          alunoCpf: aluno.cpf_cnpj,
          dataNascimento: aluno.data_nascimento,
          sexo: aluno.sexo,
          nomeMae: aluno.nome_mae,
          racaCor: aluno.raca_cor,
          naturalidade: aluno.naturalidade,
          nacionalidade: aluno.nacionalidade,
          cep: aluno.cep,
          endereco: aluno.endereco,
          cidade: aluno.cidade,
          uf: aluno.uf,
          status: String(row.status || 'PENDENTE').toUpperCase(),
          turmaId: turma.id,
          turmaNome: turma.nome || turma.codigo || 'Turma não informada',
          turmaCodigo: turma.codigo,
          turmaInicio: turma.data_inicio,
          turmaFim: turma.data_previsao_termino,
          turno: turma.turno,
          cursoNome: curso.nome || '',
          modalidade: curso.modalidade || 'OUTRO',
          poloNome: polo.nome || polo.cidade || 'Matriz',
        };
      });

      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      page += 1;
    }

    return validateCensoReadiness(rows);
  },
};
