// File: modules/gestor/gestao/gestao.service.ts

import { Turma, TurmasPageFilters, TurmasPageResult } from './gestao.types';
import { supabase } from '../../../lib/supabase';
import { textMatchesSearch } from '../../../lib/search';
import { enrichTechnicalAcademicProgress, mapTurma } from './gestao.mappers';
import { gestaoKpisService } from './gestao-kpis.service';
export type { GestaoResumoKpis, GestaoResumoModalidade } from './gestao-kpis.service';

export const gestaoService = {
  async getTurmasPage(filters: TurmasPageFilters): Promise<TurmasPageResult> {
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;
    const sortBy = filters.sortBy || 'NOME_ASC';
    const hasSearch = Boolean(filters.search?.trim());
    let query = supabase
      .from('turmas')
      .select('*, cursos!inner(*), polos(nome, cnpj, cidade, estado), matriculas(status)', { count: 'exact' })
      .eq('cursos.modalidade', filters.modalidade)
      .eq('status', filters.status);

    if (filters.poloId) query = query.eq('polo_id', filters.poloId);
    if (filters.dataInicial) query = query.gte('data_inicio', filters.dataInicial);
    if (filters.dataFinal) query = query.lte('data_inicio', filters.dataFinal);

    if (sortBy === 'NOME_ASC') {
      query = query.order('nome', { ascending: true }).range(hasSearch ? 0 : from, hasSearch ? 9999 : to);
    } else if (sortBy === 'NOME_DESC') {
      query = query.order('nome', { ascending: false }).range(hasSearch ? 0 : from, hasSearch ? 9999 : to);
    } else {
      query = query.range(0, 9999);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    let mapped = (data || []).map(mapTurma);
    if (hasSearch) {
      mapped = mapped.filter((turma) =>
        textMatchesSearch(filters.search || '', [
          turma.nome,
          turma.codigo,
          turma.cursoNome,
          turma.poloNome,
          turma.poloCidade,
          turma.poloEstado,
        ])
      );
    }

    const filteredTotal = hasSearch || sortBy === 'ALUNOS_DESC' ? mapped.length : count || 0;
    if (sortBy === 'ALUNOS_DESC') {
      mapped = mapped
        .sort((a, b) => b.alunosMatriculados - a.alunosMatriculados || a.nome.localeCompare(b.nome, 'pt-BR'))
        .slice(from, to + 1);
    } else if (hasSearch) {
      mapped = mapped.slice(from, to + 1);
    }

    const enriched = filters.modalidade === 'TECNICO'
      ? await enrichTechnicalAcademicProgress(mapped)
      : mapped;

    return {
      data: enriched,
      total: filteredTotal,
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

  async createTurma(turma: Omit<Turma, 'id' | 'alunosMatriculados'>): Promise<Turma> {
    if (turma.modalidade !== 'EAD' && !turma.poloId) {
      throw new Error('Informe o polo da turma antes de abrir inscrições.');
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
      permitir_inscricoes_online: turma.permitirInscricoesOnline ?? false,
      exige_matricula: turma.exigeMatricula === false ? false : true,
      qtd_vagas_minima: turma.qtdVagasMinima === null || turma.qtdVagasMinima === undefined
        ? null
        : Number(turma.qtdVagasMinima),
      frequencia_minima_percent: Number(turma.frequenciaMinimaPercent ?? 75),
      media_minima: Number(turma.mediaMinima ?? 6),
      bloquear_matriculas_apos_completar_vagas: turma.bloquearMatriculasAposCompletarVagas ?? true,
      turno: turma.turno,
      status: turma.status || 'EM_ANDAMENTO',
      valor_matricula: Number(turma.valorMatricula ?? 150),
      valor_rematricula: Number(turma.valorRematricula ?? 100),
      qtd_parcelas: Number(turma.qtdParcelas ?? 1),
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
      gerar_cobrancas_futuras: turma.gerarCobrancasFuturas ?? false,
      sincronizar_asaas_futuro: turma.sincronizarAsaasFuturo ?? true,
      obs_financeira_origem: turma.obsFinanceiraOrigem || null,
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
      permitirInscricoesOnline: data.permitir_inscricoes_online ?? false,
      exigeMatricula: data.exige_matricula ?? true,
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
      valorMatricula: Number(data.valor_matricula),
      valorRematricula: Number(data.valor_rematricula),
      qtdParcelas: Number(data.qtd_parcelas),
      valorParcela: Number(data.valor_parcela),
      descontoPontualidade: Number(data.desconto_pontualidade),
      jurosAtraso: Number(data.juros_atraso),
      multaAtraso: Number(data.multa_atraso)
      ,
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
      permitirInscricoesOnline?: boolean;
      exigeMatricula?: boolean;
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
    const { error } = await supabase
      .from('turmas')
      .update({
        nome: input.nome.trim(),
        data_inicio: input.dataInicio || null,
        data_previsao_termino: input.dataPrevisaoTermino || null,
        data_inicio_inscricao: input.dataInicioInscricao || null,
        data_fim_inscricao: input.dataFimInscricao || null,
        permitir_inscricoes_online: input.permitirInscricoesOnline === true,
        exige_matricula: input.exigeMatricula === false ? false : true,
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

  // Busca cursos do cadastro por modalidade
  async getCursosByModalidade(modalidade: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('*')
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
      multaAtraso: number;
      aplicarDescontoMatricula?: boolean;
      aplicarMultaJurosMatricula?: boolean;
      aplicarDescontoMensalidade?: boolean;
      aplicarMultaJurosMensalidade?: boolean;
      aplicarDescontoRematricula?: boolean;
      aplicarMultaJurosRematricula?: boolean;
      diaVencimentoPadrao: number;
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
        multa_atraso: config.multaAtraso,
        aplicar_desconto_matricula: config.aplicarDescontoMatricula === true,
        aplicar_multa_juros_matricula: config.aplicarMultaJurosMatricula !== false,
        aplicar_desconto_mensalidade: config.aplicarDescontoMensalidade !== false,
        aplicar_multa_juros_mensalidade: config.aplicarMultaJurosMensalidade !== false,
        aplicar_desconto_rematricula: config.aplicarDescontoRematricula !== false,
        aplicar_multa_juros_rematricula: config.aplicarMultaJurosRematricula !== false,
        dia_vencimento_padrao: config.diaVencimentoPadrao,
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
