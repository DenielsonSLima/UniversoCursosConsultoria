import { LucideIcon } from 'lucide-react';

export type SecretariaDocumentoId =
  | 'declaracao_matricula'
  | 'declaracao_frequencia'
  | 'boletim'
  | 'atestado_conclusao_tecnico'
  | 'declaracao_irpf'
  | 'historico_escolar'
  | 'cracha_estagio'
  | 'rematricula'
  | 'transferencia'
  | 'termo_estagio';

export interface SecretariaDocumentoDefinition {
  id: SecretariaDocumentoId;
  title: string;
  description: string;
  singularLabel: string;
  actionLabel: string;
  icon: LucideIcon;
  accent: string;
  softAccent: string;
  technicalOnly?: boolean;
  activeOnly?: boolean;
  activeEnrollmentOnly?: boolean;
  activeTurmaOnly?: boolean;
  completedOnly?: boolean;
  enrollmentStatuses?: string[];
  allowBatch?: boolean;
  academicPreview?: 'boletim_tecnico' | 'atestado_conclusao_tecnico';
  referenceMode?: 'irpf_annual';
}

export interface SecretariaContext {
  userId: string;
  poloId: string;
}

export interface SecretariaAlunoResumo {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  fotoUrl: string | null;
}

export interface SecretariaMatriculaResumo {
  id: string;
  status: string;
  dataMatricula: string | null;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoNome: string;
  modalidade: string;
  poloId: string;
}

export interface SecretariaTurmaResumo {
  id: string;
  nome: string;
  codigo: string;
  cursoNome: string;
  modalidade: string;
  turno: string;
  status: string;
  totalAlunos: number;
}
