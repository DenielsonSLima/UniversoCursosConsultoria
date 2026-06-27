import { supabase } from '../../../../../lib/supabase';
import { cadastrosService } from '../../../cadastros/cadastros.service';
import { checklistEstagioService } from '../../../cadastros/checklist-estagio/checklist-estagio.service';
import { academicLifecycleService } from './academic-lifecycle.service';
import {
  EstagioCriteriosValores,
  EstagioEvaluationDraft,
  EstagioProcedimentosLog,
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

const today = () => new Date().toISOString().split('T')[0];

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
  async getEstagioData(turmaId: string, cursoId: string): Promise<TurmaEstagioData> {
    const [
      modulos,
      { data: matriculasData, error: matriculasError },
    ] = await Promise.all([
      cadastrosService.getGrade(cursoId),
      supabase
        .from('matriculas')
        .select('id, status, parceiros(*)')
        .eq('turma_id', turmaId),
    ]);

    if (matriculasError) throw matriculasError;

    const disciplinasEstagio: any[] = [];
    modulos.forEach((modulo: any) => {
      modulo.disciplinas.forEach((disciplina: any) => {
        if (disciplina.cargaHorariaEstagio > 0) disciplinasEstagio.push(disciplina);
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

  async getAvaliacoes(turmaId: string, disciplinaId: string) {
    if (!disciplinaId) return {};

    const { data, error } = await supabase
      .from('matriculas_estagios')
      .select('*')
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
