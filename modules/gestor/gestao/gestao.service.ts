// File: modules/gestor/gestao/gestao.service.ts

import { Turma, TurmasPageFilters, TurmasPageResult } from './gestao.types';
import { supabase } from '../../../lib/supabase';
import { enrichTechnicalAcademicProgress, mapTurma } from './gestao.mappers';
import { gestaoKpisService } from './gestao-kpis.service';
export type { GestaoResumoKpis, GestaoResumoModalidade } from './gestao-kpis.service';

const TURMA_PAGE_SELECT = `
  id, codigo, nome, curso_id, polo_id, data_inicio, data_previsao_termino,
  data_inicio_inscricao, data_fim_inscricao, publicar_no_site, permitir_inscricoes_online,
  exige_matricula, aceita_concomitante, aceita_subsequente,
  serie_minima_ensino_medio, bloquear_matriculas_apos_completar_vagas,
  qtd_vagas_minima, frequencia_minima_percent, media_minima, turno, status,
  vagas_totais, cobrar_matricula, valor_matricula, cobrar_rematricula,
  valor_rematricula, qtd_parcelas, valor_parcela, desconto_pontualidade,
  juros_atraso, multa_atraso, multa_atraso_percentual,
  aplicar_desconto_matricula, aplicar_multa_juros_matricula,
  aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade,
  aplicar_desconto_rematricula, aplicar_multa_juros_rematricula,
  dia_vencimento_padrao, instrucao_boleto_carne,
  origem_financeira, financeiro_herdado, gerar_cobrancas_futuras,
  sincronizar_asaas_futuro, obs_financeira_origem,
  cursos!inner(nome, modalidade),
  polos(nome, cnpj, cidade, estado),
  matriculas(status)
`;

export const gestaoService = {
  async getTurmasPage(filters: TurmasPageFilters): Promise<TurmasPageResult> {
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;
    const sortBy = filters.sortBy || 'NOME_ASC';
    const searchTerm = filters.search?.trim().replace(/[,%()]/g, ' ') || '';
    const hasSearch = Boolean(searchTerm);

    const applyFilters = (baseQuery: any) => {
      let scopedQuery = baseQuery.eq('cursos.modalidade', filters.modalidade);
      scopedQuery = filters.modalidade === 'TECNICO' && filters.status === 'INSCRICOES_ABERTAS'
        ? scopedQuery.in('status', ['PLANEJADA', 'INSCRICOES_ABERTAS'])
        : scopedQuery.eq('status', filters.status);
      if (filters.poloId) scopedQuery = scopedQuery.eq('polo_id', filters.poloId);
      if (filters.dataInicial) scopedQuery = scopedQuery.gte('data_inicio', filters.dataInicial);
      if (filters.dataFinal) scopedQuery = scopedQuery.lte('data_inicio', filters.dataFinal);
      if (hasSearch) scopedQuery = scopedQuery.or(`nome.ilike.%${searchTerm}%,codigo.ilike.%${searchTerm}%`);
      return scopedQuery;
    };

    if (sortBy === 'ALUNOS_DESC') {
      const { data: rankingResult, error: rankingError } = await supabase.rpc('rank_gestao_turmas', {
        p_modalidade: filters.modalidade,
        p_status: filters.status,
        p_polo_id: filters.poloId || null,
        p_search: searchTerm || null,
        p_data_inicial: filters.dataInicial || null,
        p_data_final: filters.dataFinal || null,
        p_offset: from,
        p_limit: filters.pageSize,
      });
      if (rankingError) throw rankingError;

      const ranking = (rankingResult || {}) as {
        data?: Array<{ id: string; alunos: number }>;
        total?: number;
      };
      const rankedIds = (ranking.data || []).map((row) => row.id);

      if (rankedIds.length === 0) return { data: [], total: Number(ranking.total || 0) };

      const { data: pageData, error: pageError } = await supabase
        .from('turmas')
        .select(TURMA_PAGE_SELECT)
        .in('id', rankedIds);
      if (pageError) throw pageError;

      const order = new Map<string, number>(
        rankedIds.map((id: string, index: number): [string, number] => [id, index]),
      );
      const mapped = (pageData || [])
        .map(mapTurma)
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const enriched = filters.modalidade === 'TECNICO'
        ? await enrichTechnicalAcademicProgress(mapped)
        : mapped;
      return { data: enriched, total: Number(ranking.total || 0) };
    }

    let query = applyFilters(
      supabase.from('turmas').select(TURMA_PAGE_SELECT, { count: 'exact' }),
    );

    if (sortBy === 'NOME_ASC') {
      query = query.order('nome', { ascending: true }).range(from, to);
    } else if (sortBy === 'NOME_DESC') {
      query = query.order('nome', { ascending: false }).range(from, to);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const mapped = (data || []).map(mapTurma);

    const enriched = filters.modalidade === 'TECNICO'
      ? await enrichTechnicalAcademicProgress(mapped)
      : mapped;

    return {
      data: enriched,
      total: count || 0,
    };
  },

  async getTurmasByModalidade(modalidade: string, poloId?: string): Promise<Turma[]> {
    let query = supabase
      .from('turmas')
      .select('*, cursos!inner(*), polos(nome), matriculas(status)')
      .eq('cursos.modalidade', modalidade);

    if (poloId) {
      query = query.eq('polo_id', poloId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar turmas por modalidade:', error);
      throw error;
    }

    return (data || []).map(mapTurma);
  },

  async getActivePresentialClasses(poloId?: string): Promise<Turma[]> {
    let query = supabase
      .from('turmas')
      .select(TURMA_PAGE_SELECT)
      .in('cursos.modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'])
      .eq('status', 'EM_ANDAMENTO')
      .order('nome', { ascending: true });

    if (poloId) query = query.eq('polo_id', poloId);

    const { data, error } = await query;
    if (error) throw error;

    return enrichTechnicalAcademicProgress((data || []).map(mapTurma));
  },

  async createTurma(turma: Omit<Turma, 'id' | 'alunosMatriculados'>): Promise<Turma> {
    if (turma.modalidade !== 'EAD' && !turma.poloId) {
      throw new Error('Informe o polo da turma antes de abrir inscrições.');
    }

    const isTechnical = turma.modalidade === 'TECNICO';

    if (
      turma.modalidade === 'TECNICO'
      && turma.aceitaConcomitante === false
      && turma.aceitaSubsequente === false
    ) {
      throw new Error('A turma técnica deve aceitar ingresso concomitante, subsequente ou ambos.');
    }

    const dbData = {
      codigo: turma.codigo,
      nome: turma.nome,
      curso_id: turma.cursoId,
      polo_id: turma.poloId || '44444444-4444-4444-4444-444444444444', // fallback apenas para EAD
      data_inicio: turma.dataInicio || null,
      data_previsao_termino: turma.dataPrevisaoTermino || null,
      data_inicio_inscricao: turma.dataInicioInscricao || null,
      data_fim_inscricao: turma.dataFimInscricao || null,
      publicar_no_site: turma.publicarNoSite ?? false,
      permitir_inscricoes_online: turma.permitirInscricoesOnline ?? false,
      exige_matricula: turma.exigeMatricula === false ? false : true,
      aceita_concomitante: turma.modalidade === 'TECNICO'
        ? turma.aceitaConcomitante ?? true
        : false,
      aceita_subsequente: turma.modalidade === 'TECNICO'
        ? turma.aceitaSubsequente ?? true
        : true,
      serie_minima_ensino_medio: Number(turma.serieMinimaEnsinoMedio ?? 2),
      qtd_vagas_minima: turma.qtdVagasMinima === null || turma.qtdVagasMinima === undefined
        ? null
        : Number(turma.qtdVagasMinima),
      frequencia_minima_percent: Number(turma.frequenciaMinimaPercent ?? 75),
      media_minima: Number(turma.mediaMinima ?? 6),
      bloquear_matriculas_apos_completar_vagas: turma.bloquearMatriculasAposCompletarVagas ?? true,
      turno: turma.turno,
      status: turma.status || 'EM_ANDAMENTO',
      valor_matricula: Number(turma.valorMatricula ?? 0),
      valor_rematricula: Number(turma.valorRematricula ?? 0),
      qtd_parcelas: Number(turma.qtdParcelas ?? 0),
      valor_parcela: Number(turma.valorParcela ?? 0),
      desconto_pontualidade: Number(turma.descontoPontualidade ?? 0),
      juros_atraso: Number(turma.jurosAtraso ?? 0),
      multa_atraso: Number(turma.multaAtraso ?? 0),
      dia_vencimento_padrao: Number(turma.diaVencimentoPadrao || 10),
      cronograma_financeiro: Array.isArray(turma.cronogramaFinanceiro) ? turma.cronogramaFinanceiro : [],
      vagas_totais: Number(turma.vagasTotais) || 40
      ,
      origem_financeira: turma.origemFinanceira || 'NORMAL',
      financeiro_herdado: turma.financeiroHerdado || false,
      gerar_cobrancas_futuras: turma.gerarCobrancasFuturas ?? isTechnical,
      sincronizar_asaas_futuro: turma.sincronizarAsaasFuturo ?? (isTechnical ? false : true),
      obs_financeira_origem: turma.obsFinanceiraOrigem || null,
      ...(isTechnical ? {
        cobrar_matricula: turma.cobrarMatricula ?? Number(turma.valorMatricula || 0) > 0,
        cobrar_rematricula: turma.cobrarRematricula ?? Number(turma.valorRematricula || 0) > 0,
        multa_atraso_percentual: Number(turma.multaAtrasoPercentual ?? 0),
        aplicar_desconto_matricula: turma.aplicarDescontoMatricula ?? false,
        aplicar_multa_juros_matricula: turma.aplicarMultaJurosMatricula ?? false,
        aplicar_desconto_mensalidade: turma.aplicarDescontoMensalidade ?? true,
        aplicar_multa_juros_mensalidade: turma.aplicarMultaJurosMensalidade ?? true,
        aplicar_desconto_rematricula: turma.aplicarDescontoRematricula ?? false,
        aplicar_multa_juros_rematricula: turma.aplicarMultaJurosRematricula ?? false,
        instrucao_boleto_carne: turma.instrucaoBoletoCarne?.trim(),
      } : {}),
    };

    const { data, error } = await supabase
      .from('turmas')
      .insert(dbData)
      .select('*, cursos(*), polos(nome)')
      .single();

    if (error) {
      console.error('Erro ao criar turma:', error);
      throw error;
    }

    return {
      id: data.id,
      codigo: data.codigo,
      nome: data.nome,
      cursoId: data.curso_id,
      cursoNome: data.cursos?.nome || '',
      modalidade: data.cursos?.modalidade || 'TECNICO',
      poloId: data.polo_id,
      poloNome: data.polos?.nome || '',
      dataInicio: data.data_inicio,
      dataPrevisaoTermino: data.data_previsao_termino,
      dataInicioInscricao: data.data_inicio_inscricao || null,
      dataFimInscricao: data.data_fim_inscricao || null,
      publicarNoSite: data.publicar_no_site ?? false,
      permitirInscricoesOnline: data.permitir_inscricoes_online ?? false,
      exigeMatricula: data.exige_matricula ?? true,
      aceitaConcomitante: data.aceita_concomitante ?? false,
      aceitaSubsequente: data.aceita_subsequente ?? true,
      serieMinimaEnsinoMedio: Number(data.serie_minima_ensino_medio ?? 2),
      bloquearMatriculasAposCompletarVagas: data.bloquear_matriculas_apos_completar_vagas ?? true,
      qtdVagasMinima: data.qtd_vagas_minima === null || data.qtd_vagas_minima === undefined
        ? undefined
        : Number(data.qtd_vagas_minima),
      frequenciaMinimaPercent: Number(data.frequencia_minima_percent ?? 75),
      mediaMinima: Number(data.media_minima ?? 6),
      turno: data.turno,
      status: data.status,
      alunosMatriculados: 0,
      alunosAtivos: 0,
      alunosInativos: 0,
      vagasTotais: data.vagas_totais,
      cobrarMatricula: data.cobrar_matricula ?? Number(data.valor_matricula || 0) > 0,
      valorMatricula: Number(data.valor_matricula),
      cobrarRematricula: data.cobrar_rematricula ?? Number(data.valor_rematricula || 0) > 0,
      valorRematricula: Number(data.valor_rematricula),
      qtdParcelas: Number(data.qtd_parcelas),
      valorParcela: Number(data.valor_parcela),
      descontoPontualidade: Number(data.desconto_pontualidade),
      jurosAtraso: Number(data.juros_atraso),
      multaAtraso: Number(data.multa_atraso),
      multaAtrasoPercentual: Number(data.multa_atraso_percentual || 0),
      aplicarDescontoMatricula: data.aplicar_desconto_matricula ?? false,
      aplicarMultaJurosMatricula: data.aplicar_multa_juros_matricula ?? false,
      aplicarDescontoMensalidade: data.aplicar_desconto_mensalidade ?? true,
      aplicarMultaJurosMensalidade: data.aplicar_multa_juros_mensalidade ?? true,
      aplicarDescontoRematricula: data.aplicar_desconto_rematricula ?? false,
      aplicarMultaJurosRematricula: data.aplicar_multa_juros_rematricula ?? false,
      diaVencimentoPadrao: Number(data.dia_vencimento_padrao || 10),
      instrucaoBoletoCarne: data.instrucao_boleto_carne || '',
      origemFinanceira: (data.origem_financeira === 'LEGADO' ? 'LEGADO' : 'NORMAL'),
      financeiroHerdado: data.financeiro_herdado || false,
      gerarCobrancasFuturas: data.gerar_cobrancas_futuras || false,
      sincronizarAsaasFuturo: data.sincronizar_asaas_futuro ?? true,
      obsFinanceiraOrigem: data.obs_financeira_origem || '',
    };
  },

  async finalizarTurma(id: string): Promise<void> {
    const { error } = await supabase.rpc('finalizar_turma_academica', {
      p_turma_id: id,
    });

    if (error) {
      console.error('Erro ao finalizar turma:', error);
      throw error;
    }
  },

  async deleteTurmaNaoIniciada(id: string): Promise<void> {
    const { error } = await supabase.rpc('excluir_turma_nao_iniciada', {
      p_turma_id: id,
    });

    if (error) {
      console.error('Erro ao excluir turma:', error);
      throw error;
    }
  },

  async updateTurmaBasic(
    id: string,
    input: {
      nome: string;
      dataInicio: string | null;
      dataPrevisaoTermino: string | null;
      dataInicioInscricao?: string | null;
      dataFimInscricao?: string | null;
      publicarNoSite?: boolean;
      permitirInscricoesOnline?: boolean;
      exigeMatricula?: boolean;
      aceitaConcomitante?: boolean;
      aceitaSubsequente?: boolean;
      serieMinimaEnsinoMedio?: number;
      qtdVagasMinima?: number;
      frequenciaMinimaPercent?: number;
      mediaMinima?: number;
      bloquearMatriculasAposCompletarVagas?: boolean;
      origemFinanceira?: 'NORMAL' | 'LEGADO';
      financeiroHerdado?: boolean;
      gerarCobrancasFuturas?: boolean;
      sincronizarAsaasFuturo?: boolean;
      obsFinanceiraOrigem?: string;
    }
  ): Promise<void> {
    if (input.aceitaConcomitante === false && input.aceitaSubsequente === false) {
      throw new Error('A turma técnica deve aceitar ingresso concomitante, subsequente ou ambos.');
    }

    const { error } = await supabase
      .from('turmas')
      .update({
        nome: input.nome.trim(),
        data_inicio: input.dataInicio || null,
        data_previsao_termino: input.dataPrevisaoTermino || null,
        data_inicio_inscricao: input.dataInicioInscricao || null,
        data_fim_inscricao: input.dataFimInscricao || null,
        publicar_no_site: input.publicarNoSite === true,
        permitir_inscricoes_online: input.permitirInscricoesOnline === true,
        exige_matricula: input.exigeMatricula === false ? false : true,
        aceita_concomitante: input.aceitaConcomitante,
        aceita_subsequente: input.aceitaSubsequente,
        serie_minima_ensino_medio: input.serieMinimaEnsinoMedio,
        qtd_vagas_minima: input.qtdVagasMinima === null || input.qtdVagasMinima === undefined
          ? 0
          : Number(input.qtdVagasMinima),
        frequencia_minima_percent: Number(input.frequenciaMinimaPercent ?? 75),
        media_minima: Number(input.mediaMinima ?? 6),
        bloquear_matriculas_apos_completar_vagas: input.bloquearMatriculasAposCompletarVagas ?? true,
        origem_financeira: input.origemFinanceira,
        financeiro_herdado: input.financeiroHerdado,
        gerar_cobrancas_futuras: input.gerarCobrancasFuturas,
        sincronizar_asaas_futuro: input.sincronizarAsaasFuturo,
        obs_financeira_origem: input.obsFinanceiraOrigem,
      })
      .eq('id', id);

    if (error) {
      console.error('Erro ao atualizar dados básicos da turma:', error);
      throw error;
    }
  },

  async saveTechnicalClassConfiguration(
    turma: Turma,
    input: {
      nome: string;
      dataInicio: string | null;
      dataPrevisaoTermino: string | null;
      dataInicioInscricao?: string | null;
      dataFimInscricao?: string | null;
      publicarNoSite?: boolean;
      permitirInscricoesOnline?: boolean;
      exigeMatricula?: boolean;
      aceitaConcomitante?: boolean;
      aceitaSubsequente?: boolean;
      serieMinimaEnsinoMedio?: number;
      qtdVagasMinima?: number;
      frequenciaMinimaPercent?: number;
      mediaMinima?: number;
      bloquearMatriculasAposCompletarVagas?: boolean;
      origemFinanceira?: 'NORMAL' | 'LEGADO';
      financeiroHerdado?: boolean;
      gerarCobrancasFuturas?: boolean;
      sincronizarAsaasFuturo?: boolean;
      obsFinanceiraOrigem?: string;
    },
  ): Promise<Turma> {
    if (input.aceitaConcomitante === false && input.aceitaSubsequente === false) {
      throw new Error('A turma técnica deve aceitar ingresso concomitante, subsequente ou ambos.');
    }

    const { data, error } = await supabase.rpc('salvar_configuracao_turma_tecnica', {
      p_turma_id: turma.id,
      p_config: {
        nome: input.nome.trim(),
        data_inicio: input.dataInicio || null,
        data_previsao_termino: input.dataPrevisaoTermino || null,
        data_inicio_inscricao: input.dataInicioInscricao || null,
        data_fim_inscricao: input.dataFimInscricao || null,
        publicar_no_site: input.publicarNoSite === true,
        permitir_inscricoes_online: input.permitirInscricoesOnline === true,
        exige_matricula: input.exigeMatricula !== false,
        aceita_concomitante: input.aceitaConcomitante === true,
        aceita_subsequente: input.aceitaSubsequente === true,
        serie_minima_ensino_medio: Number(input.serieMinimaEnsinoMedio ?? 2),
        qtd_vagas_minima: Number(input.qtdVagasMinima ?? 0),
        frequencia_minima_percent: Number(input.frequenciaMinimaPercent ?? 75),
        media_minima: Number(input.mediaMinima ?? 6),
        bloquear_matriculas_apos_completar_vagas: input.bloquearMatriculasAposCompletarVagas !== false,
        origem_financeira: input.origemFinanceira || 'NORMAL',
        financeiro_herdado: input.financeiroHerdado === true,
        gerar_cobrancas_futuras: input.gerarCobrancasFuturas === true,
        sincronizar_asaas_futuro: input.sincronizarAsaasFuturo === true,
        ...(input.obsFinanceiraOrigem !== undefined
          ? { obs_financeira_origem: input.obsFinanceiraOrigem || null }
          : {}),
      },
    });

    if (error) {
      console.error('Erro ao salvar configuração da turma técnica:', error);
      throw error;
    }
    if (!data) throw new Error('O banco não retornou a turma atualizada.');

    const mapped = mapTurma({
      ...data,
      cursos: { nome: turma.cursoNome, modalidade: turma.modalidade },
      polos: {
        nome: turma.poloNome,
        cnpj: turma.poloCnpj,
        cidade: turma.poloCidade,
        estado: turma.poloEstado,
      },
      matriculas: [],
    });

    return {
      ...turma,
      ...mapped,
      alunosMatriculados: turma.alunosMatriculados,
      alunosAtivos: turma.alunosAtivos,
      alunosInativos: turma.alunosInativos,
    };
  },

  // Busca cursos do cadastro por modalidade
  async getCursosByModalidade(modalidade: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('id, nome, modalidade')
      .eq('modalidade', modalidade)
      .eq('status', 'ativo')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar cursos por modalidade:', error);
      throw error;
    }

    return data || [];
  },

  async saveTurmaFinanceiroConfig(
    id: string,
    config: {
      valorMatricula: number;
      valorRematricula: number;
      qtdParcelas: number;
      valorParcela: number;
      descontoPontualidade: number;
      jurosAtraso: number;
      multaAtrasoPercentual: number;
      aplicarDescontoMatricula?: boolean;
      aplicarMultaJurosMatricula?: boolean;
      aplicarDescontoMensalidade?: boolean;
      aplicarMultaJurosMensalidade?: boolean;
      aplicarDescontoRematricula?: boolean;
      aplicarMultaJurosRematricula?: boolean;
      diaVencimentoPadrao: number;
      instrucaoBoletoCarne: string;
      cronogramaFinanceiro: any[];
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('turmas')
      .update({
        valor_matricula: config.valorMatricula,
        valor_rematricula: config.valorRematricula,
        qtd_parcelas: config.qtdParcelas,
        valor_parcela: config.valorParcela,
        desconto_pontualidade: config.descontoPontualidade,
        juros_atraso: config.jurosAtraso,
        multa_atraso_percentual: config.multaAtrasoPercentual,
        aplicar_desconto_matricula: config.aplicarDescontoMatricula === true,
        aplicar_multa_juros_matricula: false,
        aplicar_desconto_mensalidade: config.aplicarDescontoMensalidade !== false,
        aplicar_multa_juros_mensalidade: config.aplicarMultaJurosMensalidade !== false,
        aplicar_desconto_rematricula: false,
        aplicar_multa_juros_rematricula: false,
        dia_vencimento_padrao: config.diaVencimentoPadrao,
        instrucao_boleto_carne: config.instrucaoBoletoCarne.trim(),
        cronograma_financeiro: config.cronogramaFinanceiro
      })
      .eq('id', id);

    if (error) {
      console.error('Erro ao salvar configurações financeiras da turma:', error);
      throw error;
    }
  },

  async updateTurmaFinanceiroFlags(
    id: string,
    flags: {
      origemFinanceira: 'NORMAL' | 'LEGADO';
      financeiroHerdado: boolean;
      gerarCobrancasFuturas: boolean;
      sincronizarAsaasFuturo: boolean;
      obsFinanceiraOrigem?: string | null;
    },
  ): Promise<void> {
    const { error } = await supabase
      .from('turmas')
      .update({
        origem_financeira: flags.origemFinanceira,
        financeiro_herdado: flags.financeiroHerdado,
        gerar_cobrancas_futuras: flags.gerarCobrancasFuturas,
        sincronizar_asaas_futuro: flags.sincronizarAsaasFuturo,
        obs_financeira_origem: flags.obsFinanceiraOrigem || null,
      })
      .eq('id', id);

    if (error) {
      console.error('Erro ao atualizar flags financeiras da turma:', error);
      throw error;
    }
  },

  getGestaoKpis: gestaoKpisService.getGestaoKpis,
  getGestaoResumoKpis: gestaoKpisService.getGestaoResumoKpis,
};
