import type { CertificadoAcademico } from '../certificados/certificados.types';

export interface EmissionLog {
  id: string;
  identidade: string;
  codigo: string;
  documento: string;
  matricula_id: string;
  aluno_id: string;
  polo_id: string;
  periodo_referencia: string | null;
  referencia_externa: string | null;
  status: 'ATIVO' | 'REVOGADO';
  emitido_em: string;
  ultima_emissao_em: string;
  validade_ate: string | null;
  revogado_em: string | null;
  emitido_por: string | null;
  quantidade_emissoes: number;
  dados_emissao: Record<string, any>;
  aluno?: {
    id: string;
    nome: string;
    cpf_cnpj: string;
    rg?: string;
    data_nascimento?: string;
    foto_url?: string;
  };
  matricula?: {
    id: string;
    status: string;
    turma?: { id: string; nome: string; codigo: string };
  };
}
export interface AcademicComponentRow {
  moduleName: string;
  moduleOrder: number;
  discipline: string;
  cargaHoraria: number;
  nota: number | null;
  frequencia: number | null;
  situacao: string;
}

export interface AcademicPreviewData {
  componentesTable: string;
  historicoTable: string;
  cargaHorariaCumprida: number;
  cargaHorariaTotal: number;
  periodoCurso: string;
  observacoesHistorico: string;
  situacaoAcademica: string;
}

export interface AcademicPreviewRpcPayload {
  componentes?: AcademicComponentRow[];
  cargaHorariaCumprida?: number;
  cargaHorariaTotal?: number;
  inicioCurso?: string | null;
  fimCurso?: string | null;
  situacaoAcademica?: string;
}

export interface TurmaFilter {
  id: string;
  nome: string;
  codigo: string;
}

export interface PreviewResources {
  template: any;
  watermark: any;
  polo: any;
  academicData: AcademicPreviewData | null;
  certificate: CertificadoAcademico | null;
}
