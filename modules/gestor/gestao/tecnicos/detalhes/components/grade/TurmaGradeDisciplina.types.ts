import type { Disciplina } from '../../../../../cadastros/cadastros.types';
import type {
  TurmaAtividadeExtraClasse,
  TurmaAulaPlanejada,
  TurmaAulaUpdateInput,
  TurmaDisciplinaConfig,
} from '../../turma-grade.types';
import type { PlanoCursoGestaoStatus } from '../../../../../../shared/plano-curso/plano-curso.types';
import type { TurmaGradeTheme } from './turma-grade-ui';

export interface TurmaGradeDisciplinaProps {
  disciplina: Disciplina;
  config: TurmaDisciplinaConfig;
  aulas: TurmaAulaPlanejada[];
  atividades: TurmaAtividadeExtraClasse[];
  planoCurso: PlanoCursoGestaoStatus | null;
  planoCursoLoading: boolean;
  planoCursoError: boolean;
  metricas?: any;
  theme: TurmaGradeTheme;
  singleProfessor: boolean;
  isExpanded: boolean;
  isSaving: boolean;
  updatingAulaId?: string;
  titulo: string;
  data: string;
  horas: string;
  horaInicio: string;
  horaFim: string;
  isExtraClasse: boolean;
  onToggle: () => void;
  onToggleConcluida: () => void;
  onOpenProfessor: () => void;
  onOpenPlanoCurso: () => void;
  onDeleteAula: (aulaId: string) => void;
  onUpdateAula: (input: TurmaAulaUpdateInput) => Promise<void>;
  onTituloChange: (value: string) => void;
  onDataChange: (value: string) => void;
  onHorasChange: (value: string) => void;
  onHoraInicioChange: (value: string) => void;
  onHoraFimChange: (value: string) => void;
  onExtraClasseChange: (value: boolean) => void;
  onAddPlanejamento: () => void;
}
