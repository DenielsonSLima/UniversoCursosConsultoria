import { LucideIcon } from 'lucide-react';

export type SecretariaDocumentoId =
  | 'declaracao_matricula'
  | 'declaracao_frequencia'
  | 'boletim'
  | 'declaracao_irpf'
  | 'historico_escolar'
  | 'cracha_estagio'
  | 'rematricula'
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
