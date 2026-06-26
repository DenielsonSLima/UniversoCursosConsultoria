import { supabase } from '../../../../lib/supabase';
import { CertificadoAcademico, CertificadoModalidade, CertificadoStatus } from './certificados.types';

export const certificadosService = {
  async list(filters: {
    modalidade: CertificadoModalidade;
    status?: CertificadoStatus;
    search?: string;
    turmaId?: string;
    poloId?: string;
  }): Promise<CertificadoAcademico[]> {
    let query = supabase
      .from('certificados_academicos')
      .select(`
        *,
        aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj),
        turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
        curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria),
        polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
      `)
      .eq('modalidade', filters.modalidade)
      .order('data_conclusao', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.turmaId && filters.turmaId !== 'todos') query = query.eq('turma_id', filters.turmaId);
    if (filters.poloId) query = query.eq('polo_id', filters.poloId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as unknown as CertificadoAcademico[];
    const search = filters.search?.trim().toLocaleLowerCase('pt-BR');
    return search
      ? rows.filter(row =>
          row.aluno?.nome?.toLocaleLowerCase('pt-BR').includes(search)
          || row.aluno?.cpf_cnpj?.includes(search)
          || row.codigo_validacao?.toLocaleLowerCase('pt-BR').includes(search)
        )
      : rows;
  },

  async getTurmas(modalidade: CertificadoModalidade, poloId?: string) {
    let query = supabase
      .from('turmas')
      .select('id, nome, codigo, cursos!inner(modalidade)')
      .eq('cursos.modalidade', modalidade)
      .order('nome');
    if (poloId) query = query.eq('polo_id', poloId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async finalizar(id: string, input: {
    certificadoNumero?: string;
    paginaLivro?: string;
    livroRegistro?: string;
    validacaoSistec?: string;
    ensinoMedioEstabelecimento?: string;
    ensinoMedioLocalidadeUf?: string;
    ensinoMedioAnoConclusao?: string;
  }) {
    const { data, error } = await supabase.rpc('finalizar_certificado_academico', {
      p_certificado_id: id,
      p_certificado_numero: input.certificadoNumero || null,
      p_pagina_livro: input.paginaLivro || null,
      p_livro_registro: input.livroRegistro || null,
      p_validacao_sistec: input.validacaoSistec || null,
      p_ensino_medio_estabelecimento: input.ensinoMedioEstabelecimento || null,
      p_ensino_medio_localidade_uf: input.ensinoMedioLocalidadeUf || null,
      p_ensino_medio_ano_conclusao: input.ensinoMedioAnoConclusao || null,
      p_emitido_por: sessionStorage.getItem('logged_user_id') || null,
    });
    if (error) throw error;
    return data;
  },
};
