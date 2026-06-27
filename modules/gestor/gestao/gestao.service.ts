// File: modules/gestor/gestao/gestao.service.ts

import { Turma, TurmasPageFilters, TurmasPageResult } from './gestao.types';
import { supabase } from '../../../lib/supabase';
import { textMatchesSearch } from '../../../lib/search';

const normalizeStatus = (status?: string | null) =>
  String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const EAD_ACTIVE_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);

const mapTurma = (t: any): Turma => {
  const matriculas = t.matriculas || [];
  const isEad = t.cursos?.modalidade === 'EAD';
  const alunosMatriculados = isEad
    ? matriculas.filter((m: any) => EAD_ACTIVE_STATUSES.has(normalizeStatus(m.status))).length
    : matriculas.length;
  const alunosAtivos = isEad
    ? alunosMatriculados
    : matriculas.filter((m: any) => m.status?.toUpperCase() === 'ATIVO').length;
  const alunosInativos = Math.max(0, matriculas.length - alunosAtivos);
  return {
    id: t.id,
    codigo: t.codigo,
    nome: t.nome,
    cursoId: t.curso_id,
    cursoNome: t.cursos?.nome || '',
    modalidade: t.cursos?.modalidade || 'TECNICO',
    dataInicioInscricao: t.data_inicio_inscricao || null,
    dataFimInscricao: t.data_fim_inscricao || null,
    exigeMatricula: t.exige_matricula ?? true,
    bloquearMatriculasAposCompletarVagas: t.bloquear_matriculas_apos_completar_vagas ?? true,
    qtdVagasMinima: t.qtd_vagas_minima === null || t.qtd_vagas_minima === undefined
      ? undefined
      : Number(t.qtd_vagas_minima),
    poloId: t.polo_id,
    poloNome: t.polos?.nome || '',
    poloCnpj: t.polos?.cnpj || '',
    poloCidade: t.polos?.cidade || '',
    poloEstado: t.polos?.estado || '',
    dataInicio: t.data_inicio,
    dataPrevisaoTermino: t.data_previsao_termino,
    turno: t.turno,
    status: t.status,
    alunosMatriculados,
    alunosAtivos,
    alunosInativos,
    vagasTotais: t.vagas_totais,
    valorMatricula: Number(t.valor_matricula),
    valorRematricula: Number(t.valor_rematricula),
    qtdParcelas: Number(t.qtd_parcelas),
    valorParcela: Number(t.valor_parcela),
    descontoPontualidade: Number(t.desconto_pontualidade),
    jurosAtraso: Number(t.juros_atraso),
    multaAtraso: Number(t.multa_atraso),
  };
};

const enrichTechnicalAcademicProgress = async (turmas: Turma[]): Promise<Turma[]> => {
  if (turmas.length === 0) return turmas;

  const turmaIds = turmas.map((turma) => turma.id);
  const cursoIds = Array.from(new Set(turmas.map((turma) => turma.cursoId).filter(Boolean)));
  const [{ data: configsData, error: configsError }, { data: gradeData, error: gradeError }] = await Promise.all([
    supabase
    .from('turmas_disciplinas')
    .select(`
      turma_id,
      disciplina_id,
      concluida
    `)
    .in('turma_id', turmaIds),
    supabase
      .from('modulos')
      .select('id, curso_id, created_at, disciplinas(id, nome, created_at)')
      .in('curso_id', cursoIds)
      .order('created_at', { ascending: true }),
  ]);

  if (configsError || gradeError) {
    console.error('Erro ao carregar progresso das disciplinas das turmas:', configsError || gradeError);
    return turmas;
  }

  const configByTurmaDisciplina = new Map<string, boolean>();
  (configsData || []).forEach((row: any) => {
    configByTurmaDisciplina.set(`${row.turma_id}:${row.disciplina_id}`, row.concluida === true);
  });

  const gradeByCurso = new Map<string, any[]>();
  (gradeData || []).forEach((modulo: any) => {
    const rows = gradeByCurso.get(modulo.curso_id) || [];
    (modulo.disciplinas || []).forEach((disciplina: any) => {
      rows.push(disciplina);
    });
    gradeByCurso.set(modulo.curso_id, rows);
  });

  return turmas.map((turma) => {
    const disciplinas = gradeByCurso.get(turma.cursoId) || [];
    const currentIndex = disciplinas.findIndex((disciplina) => (
      configByTurmaDisciplina.get(`${turma.id}:${disciplina.id}`) !== true
    ));

    return {
      ...turma,
      totalDisciplinas: disciplinas.length,
      disciplinaAtual: currentIndex >= 0
        ? disciplinas[currentIndex]?.nome || 'Disciplina não informada'
        : undefined,
      disciplinaAtualOrdem: currentIndex >= 0 ? currentIndex + 1 : undefined,
    };
  });
};

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
      exige_matricula: turma.exigeMatricula === false ? false : true,
      qtd_vagas_minima: turma.qtdVagasMinima === null || turma.qtdVagasMinima === undefined
        ? null
        : Number(turma.qtdVagasMinima),
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
      exigeMatricula: data.exige_matricula ?? true,
      bloquearMatriculasAposCompletarVagas: data.bloquear_matriculas_apos_completar_vagas ?? true,
      qtdVagasMinima: data.qtd_vagas_minima === null || data.qtd_vagas_minima === undefined
        ? undefined
        : Number(data.qtd_vagas_minima),
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
    };
  },

  async finalizarTurma(id: string): Promise<void> {
    const { error } = await supabase
      .from('turmas')
      .update({ status: 'FINALIZADA' })
      .eq('id', id);

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
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('turmas')
      .update({
        nome: input.nome.trim(),
        data_inicio: input.dataInicio || null,
        data_previsao_termino: input.dataPrevisaoTermino || null,
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

  async getGestaoKpis(poloId?: string): Promise<{ activeTurmas: number; activeMatriculas: number }> {
    let turmasQuery = supabase
      .from('turmas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'EM_ANDAMENTO');

    if (poloId) {
      turmasQuery = turmasQuery.eq('polo_id', poloId);
    }

    const { count: activeTurmas, error: turmasError } = await turmasQuery;

    if (turmasError) {
      console.error('Erro ao contar turmas ativas:', turmasError);
      throw turmasError;
    }

    const matriculasQuery = poloId
      ? supabase
          .from('matriculas')
          .select('id, turmas!inner(polo_id)', { count: 'exact', head: true })
          .eq('status', 'ATIVO')
          .eq('turmas.polo_id', poloId)
      : supabase
          .from('matriculas')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ATIVO');

    const { count: activeMatriculas, error: matriculasError } = await matriculasQuery;

    if (matriculasError) {
      console.error('Erro ao contar matrículas ativas:', matriculasError);
      throw matriculasError;
    }

    return {
      activeTurmas: activeTurmas || 0,
      activeMatriculas: activeMatriculas || 0
    };
  },

  async getGestaoResumoKpis(poloId?: string): Promise<{
    totalTurmas: number;
    totalAlunos: number;
    turmasPorTipo: {
      TECNICO: number;
      LIVRE: number;
      ESPECIALIZACAO: number;
      EAD: number;
    };
    alunosPorTipo: {
      TECNICO: number;
      LIVRE: number;
      ESPECIALIZACAO: number;
      EAD: number;
    };
    percentTurmasPorTipo: {
      TECNICO: number;
      LIVRE: number;
      ESPECIALIZACAO: number;
      EAD: number;
    };
    percentAlunosPorTipo: {
      TECNICO: number;
      LIVRE: number;
      ESPECIALIZACAO: number;
      EAD: number;
    };
  }> {
    const { data, error } = await supabase.rpc('get_gestao_resumo_kpis', {
      p_polo_id: poloId || null
    });

    if (error) {
      console.error('Erro ao buscar resumo de turmas:', error);
      throw error;
    }

    if (!data) {
      throw new Error('O banco não retornou os indicadores de gestão.');
    }

    return data as any;
  }
};
