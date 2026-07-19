import { supabase } from '../../../lib/supabase';
import { Turma } from './gestao.types';

const normalizeStatus = (status?: string | null) => String(status || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .trim();

const EAD_ACTIVE_STATUSES = new Set(['ATIVO', 'CONCLUIDO']);

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
    valorMatricula: Number(t.valor_matricula),
    valorRematricula: Number(t.valor_rematricula),
    qtdParcelas: Number(t.qtd_parcelas),
    valorParcela: Number(t.valor_parcela),
    descontoPontualidade: Number(t.desconto_pontualidade),
    jurosAtraso: Number(t.juros_atraso),
    multaAtraso: Number(t.multa_atraso),
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
  const cursoIds = Array.from(new Set(turmas.map((turma) => turma.cursoId).filter(Boolean)));
  const todayStr = new Date().toLocaleDateString('sv-SE');

  const [configsResult, gradeResult, upcomingClassesResult] = await Promise.all([
    supabase.from('turmas_disciplinas')
      .select('turma_id, disciplina_id, concluida, professor_nome')
      .in('turma_id', turmaIds),
    supabase.from('modulos')
      .select('id, curso_id, created_at, disciplinas(id, nome, created_at)')
      .in('curso_id', cursoIds)
      .order('created_at', { ascending: true }),
    supabase.from('aulas_turma')
      .select('turma_id, data_aula, titulo')
      .in('turma_id', turmaIds)
      .gte('data_aula', todayStr)
      .order('data_aula', { ascending: true }),
  ]);

  if (configsResult.error || gradeResult.error || upcomingClassesResult.error) {
    console.error(
      'Erro ao carregar progresso acadêmico das turmas:',
      configsResult.error || gradeResult.error || upcomingClassesResult.error
    );
    return turmas;
  }

  const configured = new Map<string, { concluida: boolean; professor_nome?: string }>();
  (configsResult.data || []).forEach((row: any) => {
    configured.set(`${row.turma_id}:${row.disciplina_id}`, {
      concluida: row.concluida === true,
      professor_nome: row.professor_nome || undefined,
    });
  });

  const gradeByCourse = new Map<string, any[]>();
  (gradeResult.data || []).forEach((module: any) => {
    gradeByCourse.set(module.curso_id, [
      ...(gradeByCourse.get(module.curso_id) || []),
      ...(module.disciplinas || []),
    ]);
  });

  const upcomingByTurma = new Map<string, { data_aula: string; titulo: string }>();
  (upcomingClassesResult.data || []).forEach((row: any) => {
    if (!upcomingByTurma.has(row.turma_id)) {
      upcomingByTurma.set(row.turma_id, {
        data_aula: row.data_aula,
        titulo: row.titulo || '',
      });
    }
  });

  return turmas.map((turma) => {
    const disciplinas = gradeByCourse.get(turma.cursoId) || [];
    const currentIndex = disciplinas.findIndex((discipline) => (
      configured.get(`${turma.id}:${discipline.id}`)?.concluida !== true
    ));

    const currentConfig = currentIndex >= 0
      ? configured.get(`${turma.id}:${disciplinas[currentIndex]?.id}`)
      : null;

    const nextClass = upcomingByTurma.get(turma.id);

    return {
      ...turma,
      totalDisciplinas: disciplinas.length,
      disciplinaAtual: currentIndex >= 0 ? disciplinas[currentIndex]?.nome || 'Disciplina não informada' : undefined,
      disciplinaAtualOrdem: currentIndex >= 0 ? currentIndex + 1 : undefined,
      professorAtual: currentConfig?.professor_nome || 'Não definido',
      proximaAulaData: nextClass?.data_aula || undefined,
      proximaAulaTitulo: nextClass?.titulo || undefined,
    };
  });
};
