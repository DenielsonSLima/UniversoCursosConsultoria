import { supabase } from '../../../lib/supabase';
import { Turma } from './gestao.types';

const normalizeStatus = (status?: string | null) => String(status || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .trim();

const EAD_ACTIVE_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);

type GestaoAcademicProgressRow = {
  turma_id: string;
  total_disciplinas: number | string;
  disciplinas_concluidas: number | string;
  grade_concluida: boolean;
  modulo_atual_id: string | null;
  modulo_atual_nome: string | null;
  modulo_atual_ordem: number | string | null;
  disciplina_atual_id: string | null;
  disciplina_atual_nome: string | null;
  disciplina_atual_ordem: number | string | null;
  professor_atual: string | null;
  carga_horaria: number | string | null;
  horas_realizadas: number | string | null;
  proxima_aula_data: string | null;
  proxima_aula_titulo: string | null;
};

export const mapTurma = (t: any): Turma => {
  const matriculas = t.matriculas || [];
  const isEad = t.cursos?.modalidade === 'EAD';
  const alunosMatriculados = isEad
    ? matriculas.filter((m: any) => EAD_ACTIVE_STATUSES.has(normalizeStatus(m.status))).length
    : matriculas.length;
  const alunosAtivos = isEad
    ? alunosMatriculados
    : matriculas.filter((m: any) => m.status?.toUpperCase() === 'ATIVO').length;

  return {
    id: t.id,
    codigo: t.codigo,
    nome: t.nome,
    cursoId: t.curso_id,
    cursoNome: t.cursos?.nome || '',
    modalidade: t.cursos?.modalidade || 'TECNICO',
    dataInicioInscricao: t.data_inicio_inscricao || null,
    dataFimInscricao: t.data_fim_inscricao || null,
    publicarNoSite: t.publicar_no_site ?? false,
    permitirInscricoesOnline: t.permitir_inscricoes_online ?? false,
    exigeMatricula: t.exige_matricula ?? true,
    aceitaConcomitante: t.aceita_concomitante ?? false,
    aceitaSubsequente: t.aceita_subsequente ?? true,
    serieMinimaEnsinoMedio: Number(t.serie_minima_ensino_medio ?? 2),
    bloquearMatriculasAposCompletarVagas: t.bloquear_matriculas_apos_completar_vagas ?? true,
    qtdVagasMinima: t.qtd_vagas_minima == null ? undefined : Number(t.qtd_vagas_minima),
    frequenciaMinimaPercent: Number(t.frequencia_minima_percent ?? 75),
    mediaMinima: Number(t.media_minima ?? 6),
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
    alunosInativos: Math.max(0, matriculas.length - alunosAtivos),
    vagasTotais: t.vagas_totais,
    cobrarMatricula: t.cobrar_matricula ?? Number(t.valor_matricula || 0) > 0,
    valorMatricula: Number(t.valor_matricula),
    cobrarRematricula: t.cobrar_rematricula ?? Number(t.valor_rematricula || 0) > 0,
    valorRematricula: Number(t.valor_rematricula),
    qtdParcelas: Number(t.qtd_parcelas),
    valorParcela: Number(t.valor_parcela),
    descontoPontualidade: Number(t.desconto_pontualidade),
    jurosAtraso: Number(t.juros_atraso),
    multaAtraso: Number(t.multa_atraso),
    multaAtrasoPercentual: Number(t.multa_atraso_percentual || 0),
    aplicarDescontoMatricula: t.aplicar_desconto_matricula ?? false,
    aplicarMultaJurosMatricula: t.aplicar_multa_juros_matricula ?? false,
    aplicarDescontoMensalidade: t.aplicar_desconto_mensalidade ?? true,
    aplicarMultaJurosMensalidade: t.aplicar_multa_juros_mensalidade ?? true,
    aplicarDescontoRematricula: t.aplicar_desconto_rematricula ?? false,
    aplicarMultaJurosRematricula: t.aplicar_multa_juros_rematricula ?? false,
    diaVencimentoPadrao: Number(t.dia_vencimento_padrao || 10),
    primeiroVencimentoPadrao: t.primeiro_vencimento_padrao || '',
    instrucaoBoletoCarne: t.instrucao_boleto_carne || '',
    origemFinanceira: t.origem_financeira === 'LEGADO' ? 'LEGADO' : 'NORMAL',
    financeiroHerdado: t.financeiro_herdado ?? false,
    gerarCobrancasFuturas: t.gerar_cobrancas_futuras ?? false,
    sincronizarAsaasFuturo: t.sincronizar_asaas_futuro ?? true,
    obsFinanceiraOrigem: t.obs_financeira_origem || '',
  };
};

export const enrichTechnicalAcademicProgress = async (turmas: Turma[]): Promise<Turma[]> => {
  if (turmas.length === 0) return turmas;

  const turmaIds = turmas.map((turma) => turma.id);

  const { data, error } = await supabase.rpc('get_gestao_turmas_academic_progress', {
    p_turma_ids: turmaIds,
  });

  if (error) {
    console.error('Erro ao carregar progresso acadêmico canônico das turmas:', error);
    throw error;
  }

  const progressByTurma = new Map<string, GestaoAcademicProgressRow>(
    ((data || []) as GestaoAcademicProgressRow[]).map((row) => [row.turma_id, row]),
  );

  return turmas.map((turma) => {
    const progress = progressByTurma.get(turma.id);
    if (!progress) {
      throw new Error(`Progresso acadêmico indisponível para a turma ${turma.id}.`);
    }

    const hasCurrentDiscipline = Boolean(progress.disciplina_atual_id);

    return {
      ...turma,
      progressoAcademicoDisponivel: true,
      totalDisciplinas: Number(progress.total_disciplinas || 0),
      disciplinasConcluidas: Number(progress.disciplinas_concluidas || 0),
      gradeConcluida: progress.grade_concluida === true,
      moduloAtualId: hasCurrentDiscipline ? progress.modulo_atual_id || undefined : undefined,
      moduloAtual: hasCurrentDiscipline ? progress.modulo_atual_nome || 'Módulo não informado' : undefined,
      moduloAtualOrdem: hasCurrentDiscipline && progress.modulo_atual_ordem != null
        ? Number(progress.modulo_atual_ordem)
        : undefined,
      disciplinaAtualId: hasCurrentDiscipline ? progress.disciplina_atual_id : undefined,
      disciplinaAtual: hasCurrentDiscipline
        ? progress.disciplina_atual_nome || 'Disciplina não informada'
        : undefined,
      disciplinaAtualOrdem: hasCurrentDiscipline
        ? Number(progress.disciplina_atual_ordem)
        : undefined,
      professorAtual: hasCurrentDiscipline ? progress.professor_atual || 'Não definido' : undefined,
      cargaHorariaAtual: hasCurrentDiscipline ? Number(progress.carga_horaria || 0) : undefined,
      horasRealizadasAtual: hasCurrentDiscipline ? Number(progress.horas_realizadas || 0) : undefined,
      proximaAulaData: progress.proxima_aula_data || undefined,
      proximaAulaTitulo: progress.proxima_aula_titulo || undefined,
    };
  });
};
