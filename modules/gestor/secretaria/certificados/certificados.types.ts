export type CertificadoModalidade = 'TECNICO' | 'LIVRE' | 'EAD' | 'ESPECIALIZACAO';
export type CertificadoStatus = 'PENDENTE' | 'FINALIZADO' | 'CANCELADO';

export interface EadCertificateCurriculum {
  version: 1;
  source: 'cronograma' | 'conteudos';
  items: Array<{ id: string; title: string }>;
  totalHours: number | null;
  pages: Array<{ number: number; lines: string[] }>;
}

export interface EadCertificateCurriculumRow {
  nome: string;
  carga: string;
  status: string;
}

export interface EadCertificateCurriculumTable {
  version: 2;
  rows: EadCertificateCurriculumRow[];
  pages: Array<{ number: number; rows: EadCertificateCurriculumRow[] }>;
}

export interface EadCertificatePage {
  number: number;
  lines?: string[];
  rows?: EadCertificateCurriculumRow[];
}

export interface CertificadoAcademico {
  id: string;
  matricula_id: string;
  aluno_id: string;
  turma_id: string;
  curso_id: string;
  polo_id: string | null;
  modalidade: CertificadoModalidade;
  status: CertificadoStatus;
  data_inscricao: string | null;
  data_conclusao: string;
  nota_final: number | null;
  certificado_numero: string | null;
  pagina_livro: string | null;
  livro_registro: string | null;
  validacao_sistec: string | null;
  ensino_medio_estabelecimento: string | null;
  ensino_medio_localidade_uf: string | null;
  ensino_medio_ano_conclusao: string | null;
  codigo_validacao: string | null;
  emitido_em: string | null;
  metadados?: {
    eadCurriculum?: EadCertificateCurriculum;
    eadCurriculumTable?: EadCertificateCurriculumTable;
    programContent?: string;
    [key: string]: unknown;
  } | null;
  aluno: { nome: string; cpf_cnpj: string | null; rg?: string | null; tipo_documento?: string | null; data_nascimento?: string | null; naturalidade?: string | null };
  turma: { nome: string; codigo: string };
  curso: { nome: string; carga_horaria: number; area?: string | null; ead_config?: any };
  polo: { nome: string; cidade: string; estado: string } | null;
}

