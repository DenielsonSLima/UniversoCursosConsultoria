import { supabase } from '../../../../lib/supabase';
import { CertificadoAcademico, CertificadoModalidade, CertificadoStatus, EadHistoricalStudyEvidence } from './certificados.types';
import {
  normalizeSecretariaSearch,
  secretariaSearchIncludes,
} from '../secretaria-search';

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
        id, matricula_id, aluno_id, turma_id, curso_id, polo_id, modalidade, status,
        data_inscricao, data_conclusao, nota_final, certificado_numero, pagina_livro,
        livro_registro, validacao_sistec, ensino_medio_estabelecimento,
        ensino_medio_localidade_uf, ensino_medio_ano_conclusao, codigo_validacao, emitido_em, metadados,
        aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj, rg, tipo_documento, data_nascimento, naturalidade),
        turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
        curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria, area, ead_config),
        polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
      `)
      .eq('modalidade', filters.modalidade)
      .order('data_conclusao', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.turmaId && filters.turmaId !== 'todos') query = query.eq('turma_id', filters.turmaId);
    if (filters.poloId) query = query.eq('polo_id', filters.poloId);
    const { data, error } = await query;
    if (error) throw error;
    // The backend owns completion and issuance; preserve its canonical status.
    const rows = (data || []) as unknown as CertificadoAcademico[];

    const search = normalizeSecretariaSearch(filters.search);
    return search
      ? rows.filter(row =>
          secretariaSearchIncludes(row.aluno?.nome, search)
          || secretariaSearchIncludes(row.aluno?.cpf_cnpj, search)
          || secretariaSearchIncludes(row.codigo_validacao, search)
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
      // O banco identifica o gestor pelo JWT; não aceite um responsável informado pelo navegador.
      p_emitido_por: null,
    });
    if (error) throw error;
    return data;
  },

  async retificarPeriodoEad(input: {
    certificateId: string;
    originalCode: string;
    startedOn: string;
    evidenceReference: string;
    reason: string;
    useProgressAudit: boolean;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('retificar_periodo_certificado_ead', {
      p_certificado_id: input.certificateId,
      p_codigo_original: input.originalCode,
      p_inicio_comprovado: input.startedOn,
      p_referencia_evidencia: input.evidenceReference,
      p_motivo: input.reason,
      p_usar_evidencia_interna: input.useProgressAudit,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !data.trim()) throw new Error('Não foi possível confirmar o novo código de validação.');
    return data;
  },

  async getEadHistoricalStudyEvidence(certificateId: string): Promise<EadHistoricalStudyEvidence | null> {
    const { data, error } = await supabase.rpc('secretaria_get_ead_certificate_study_evidence', {
      p_certificado_id: certificateId,
    });
    if (error) throw error;
    if (data === null) return null;
    const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (data?.fonte !== 'AUDITORIA_PROGRESSO' || !isDate(data.inicioData) || !isDate(data.conclusaoData)
      || typeof data.referencia !== 'string' || !data.referencia.trim()) {
      throw new Error('Não foi possível confirmar as datas na auditoria de progresso.');
    }
    return data;
  },
};
