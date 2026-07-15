import { supabase } from '../../../../../lib/supabase';
import { normalizeCursoVacinasConfig, getVacinaDoseKey } from '../../../../shared/vacinas/vacinas.config';
import { cadastrosService } from '../../../cadastros/cadastros.service';
import { checklistEstagioService } from '../../../cadastros/checklist-estagio/checklist-estagio.service';
import { academicLifecycleService } from './academic-lifecycle.service';
import { getMaceioIsoDate } from '../technicalClassDates';
import {
  EstagioCriteriosValores,
  EstagioEvaluationDraft,
  EstagioProcedimentosLog,
  EstagioVacinasResumo,
  SaveEstagioEvaluationInput,
  TurmaEstagioData,
} from './turma-estagio.types';

const DEFAULT_INSTRUMENTOS = [
  {
    grupo: 'Comportamento',
    valorMax: '2,0',
    itens: [
      'Assiduidade e Pontualidade',
      'Aparência Pessoal',
      'Iniciativa',
      'Interesse',
      'Responsabilidade',
      'Sociabilidade',
      'Espírito de Equipe',
      'Equilíbrio Emocional',
      'Ética Profissional',
      'Aceitação ao Ensino',
    ],
  },
  {
    grupo: 'Desempenho nos Registros',
    valorMax: '2,0',
    itens: ['Registro de Prescrições', 'Registro de Enfermagem', 'Conhecimento Científico'],
  },
  {
    grupo: 'Desempenho das Técnicas',
    valorMax: '6,0',
    itens: [
      'Destreza Manual',
      'Eficiência',
      'Manuseio de Material Estéril',
      'Economia de Material',
      'Organização e Limpeza',
      'Associação Teoria e Prática',
      'Técnicas',
      'Cuidados de Enfermagem',
      'Administração de Medicamentos',
      'Passagem de Plantão',
    ],
  },
];

const today = getMaceioIsoDate;

const cloneDefaultInstrumentos = () => JSON.parse(JSON.stringify(DEFAULT_INSTRUMENTOS));

const buildInitialCriterios = (instrumentos: any[]): EstagioCriteriosValores => {
  const criterios: EstagioCriteriosValores = {};

  instrumentos.forEach((grupo: any) => {
    criterios[grupo.grupo] = {};
    grupo.itens.forEach((item: string) => {
      criterios[grupo.grupo][item] = { nota: 0, obs: '' };
    });
  });

  return criterios;
};

export const turmaEstagioService = {
  async getProfessorEstagioData(
    turmaId: string,
    disciplina: any,
  ): Promise<TurmaEstagioData> {
    if (!turmaId || !disciplina?.id || Number(disciplina?.cargaHorariaEstagio || 0) <= 0) {
      throw new Error('Não foi possível confirmar uma disciplina de estágio vinculada ao professor.');
    }

    const { data, error } = await supabase.rpc('get_estagio_alunos_contexto', {
      p_turma_id: turmaId,
      p_disciplina_id: disciplina.id,
    });
    if (error) throw error;

    const rows = data || [];
    const exige = rows.some((row: any) => Boolean(row.vacinas_exigidas));
    const porAluno: EstagioVacinasResumo['porAluno'] = {};

    rows.forEach((row: any) => {
      const liberado = !row.vacinas_exigidas || Boolean(row.vacinas_liberadas);
      porAluno[row.aluno_id] = {
        liberado,
        totalDoses: 0,
        aprovadas: 0,
        pendentes: liberado ? [] : [true],
      };
    });

    return {
      disciplinasEstagio: [disciplina],
      alunos: rows.map((row: any) => ({
        matriculaId: row.matricula_id,
        id: row.aluno_id,
        nome: row.nome || 'Estudante não identificado',
        cpf: '',
        statusMatricula: row.status_matricula,
      })),
      vacinasResumo: { exige, totalDoses: 0, porAluno },
    };
  },

  async getEstagioData(turmaId: string, cursoId: string): Promise<TurmaEstagioData> {
    const [
      modulos,
      { data: matriculasData, error: matriculasError },
      diarios,
    ] = await Promise.all([
      cadastrosService.getGrade(cursoId),
      supabase
        .from('matriculas')
        .select('id, status, parceiros(*)')
        .eq('turma_id', turmaId),
      academicLifecycleService.getDiarios(turmaId),
    ]);

    if (matriculasError) throw matriculasError;

    const periodoStatusByDisciplina = new Map(
      diarios.map((diario: any) => [diario.disciplina_id, diario.periodo_status]),
    );
    const disciplinasEstagio: any[] = [];
    modulos.forEach((modulo: any) => {
      modulo.disciplinas.forEach((disciplina: any) => {
        if (disciplina.cargaHorariaEstagio > 0) {
          disciplinasEstagio.push({
            ...disciplina,
            periodoStatus: periodoStatusByDisciplina.get(disciplina.id) || null,
          });
        }
      });
    });

    return {
      disciplinasEstagio,
      alunos: (matriculasData || []).map((matricula: any) => ({
        matriculaId: matricula.id,
        id: matricula.parceiros?.id,
        nome: matricula.parceiros?.nome || 'Estudante sem Nome',
        cpf: matricula.parceiros?.cpf_cnpj || '',
        statusMatricula: matricula.status,
      })),
    };
  },

  async getVacinasResumo(turmaId: string, cursoId: string) {
    const { data: curso, error: cursoError } = await supabase
      .from('cursos')
      .select('id, nome, vacinas_config')
      .eq('id', cursoId)
      .single();

    if (cursoError) throw cursoError;

    const config = normalizeCursoVacinasConfig(curso?.vacinas_config, curso?.nome);
    const requiredDoses = config.vacinas.flatMap((vacina) =>
      vacina.obrigatoria
        ? vacina.doses.map((dose) => ({
            key: getVacinaDoseKey(cursoId, vacina.codigo, dose.numero),
            vacinaNome: vacina.nome,
            doseLabel: dose.label,
            vacinaCodigo: vacina.codigo,
            doseNumero: dose.numero,
          }))
        : []
    );

    if (!config.exigirCarteiraEstagio || requiredDoses.length === 0) {
      return { exige: false, totalDoses: 0, porAluno: {} as Record<string, any> };
    }

    const { data: matriculas, error: matriculasError } = await supabase
      .from('matriculas')
      .select('id, aluno_id')
      .eq('turma_id', turmaId);

    if (matriculasError) throw matriculasError;

    const alunoIds = (matriculas || []).map((matricula: any) => matricula.aluno_id).filter(Boolean);
    if (alunoIds.length === 0) {
      return { exige: true, totalDoses: requiredDoses.length, porAluno: {} as Record<string, any> };
    }

    const { data: registros, error: registrosError } = await supabase
      .from('aluno_vacinas')
      .select('aluno_id, curso_id, vacina_codigo, dose_numero, status')
      .eq('curso_id', cursoId)
      .in('aluno_id', alunoIds);

    if (registrosError) throw registrosError;

    const registrosMap = new Map<string, string>();
    (registros || []).forEach((registro: any) => {
      registrosMap.set(
        `${registro.aluno_id}:${getVacinaDoseKey(registro.curso_id, registro.vacina_codigo, registro.dose_numero)}`,
        registro.status
      );
    });

    const porAluno: Record<string, any> = {};
    alunoIds.forEach((alunoId: string) => {
      const pendentes = requiredDoses.filter((dose) => registrosMap.get(`${alunoId}:${dose.key}`) !== 'aprovado');
      porAluno[alunoId] = {
        liberado: pendentes.length === 0,
        totalDoses: requiredDoses.length,
        aprovadas: requiredDoses.length - pendentes.length,
        pendentes,
      };
    });

    return { exige: true, totalDoses: requiredDoses.length, porAluno };
  },

  async getAvaliacoes(turmaId: string, disciplinaId: string) {
    if (!disciplinaId) return {};

    const { data, error } = await supabase
      .from('matriculas_estagios')
      .select(`
        aluno_id, nota_final, frequencia_estagio, criterios_detalhes,
        checklist_procedimentos, perfil_aluno, instrutor_nome, data_avaliacao
      `)
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId);

    if (error) throw error;

    const avaliacoes: Record<string, any> = {};
    (data || []).forEach((avaliacao) => {
      avaliacoes[avaliacao.aluno_id] = avaliacao;
    });
    return avaliacoes;
  },

  async buildEvaluationDraft(cursoId: string, saved?: any): Promise<EstagioEvaluationDraft> {
    const config = await checklistEstagioService.getByCursoId(cursoId);
    const instrumentosConfig = config?.instrumentos_avaliativos || cloneDefaultInstrumentos();
    const checklistUcsConfig = config?.checklist_ucs || [];

    if (!saved) {
      return {
        instrumentosConfig,
        checklistUcsConfig,
        perfilAluno: '',
        instrutorNome: '',
        dataAvaliacao: today(),
        frequenciaEstagio: 100,
        criteriosValores: buildInitialCriterios(instrumentosConfig),
        procedimentosLog: {},
      };
    }

    const procedimentosLog: EstagioProcedimentosLog = {};
    (saved.checklist_procedimentos || []).forEach((procedimento: any) => {
      procedimentosLog[procedimento.atividade] = {
        status: procedimento.status,
        data: procedimento.data || '',
      };
    });

    return {
      instrumentosConfig,
      checklistUcsConfig,
      perfilAluno: saved.perfil_aluno || '',
      instrutorNome: saved.instrutor_nome || '',
      dataAvaliacao: saved.data_avaliacao || today(),
      frequenciaEstagio: saved.frequencia_estagio || 100,
      criteriosValores: saved.criterios_detalhes || {},
      procedimentosLog,
    };
  },

  calcularAvaliacao(criterios: EstagioCriteriosValores) {
    return academicLifecycleService.calcularAvaliacaoEstagio(criterios);
  },

  async saveEvaluation(input: SaveEstagioEvaluationInput) {
    const checklist = Object.entries(input.procedimentosLog)
      .filter(([, value]) => value.status !== '')
      .map(([atividade, value]) => ({
        atividade,
        status: value.status,
        data: value.data,
      }));

    return academicLifecycleService.salvarAvaliacaoEstagio({
      turmaId: input.turmaId,
      disciplinaId: input.disciplinaId,
      alunoId: input.alunoId,
      frequencia: input.frequencia,
      criterios: input.criterios,
      checklist,
      perfilAluno: input.perfilAluno,
      instrutorNome: input.instrutorNome,
      dataAvaliacao: input.dataAvaliacao,
    });
  },
};
