import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';

export const useParceiroAlunoMatriculasQueries = (alunoId: string) => {
  const matriculasQuery = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'matriculas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select(`
          *,
          turmas(
            id, nome, codigo, turno, status, polo_id,
            cursos(id, nome, modalidade),
            polos(nome, cidade, estado),
            periodos_letivos(id, nome, ordem, status, data_inicio, data_fim)
          ),
          matricula_aproveitamentos!matricula_aproveitamentos_matricula_id_fkey(
            id, disciplina_id, situacao, media_final, frequencia_percent, disciplinas(nome)
          )
        `)
        .eq('aluno_id', alunoId)
        .order('data_matricula', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });

  const movementsQuery = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'matricula-movimentacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matricula_movimentacoes')
        .select(`
          *,
          turma_origem:turmas!matricula_movimentacoes_turma_origem_id_fkey(nome, codigo),
          turma_destino:turmas!matricula_movimentacoes_turma_destino_id_fkey(nome, codigo)
        `)
        .eq('aluno_id', alunoId)
        .order('data_movimentacao', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });

  const alunoQuery = useQuery<any>({
    queryKey: ['parceiro', alunoId, 'dados-basicos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id, nome, cpf_cnpj')
        .eq('id', alunoId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const allClassesQuery = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'turmas-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turmas')
        .select(`
          id,
          nome,
          codigo,
          turno,
          status,
          valor_matricula,
          valor_rematricula,
          valor_parcela,
          dia_vencimento_padrao,
          origem_financeira,
          financeiro_herdado,
          gerar_cobrancas_futuras,
          sincronizar_asaas_futuro,
          cursos(id, nome, modalidade),
          polos(nome)
        `)
        .eq('status', 'EM_ANDAMENTO')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  return {
    matriculasQuery,
    movementsQuery,
    alunoQuery,
    allClassesQuery,
  };
};
