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
  validacao_publica?: boolean;
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
    sexo?: string;
    nacionalidade?: string;
    naturalidade?: string;
    orgao_emissor?: string;
    titulo_eleitor?: string;
    titulo_eleitor_zona?: string;
    titulo_eleitor_secao?: string;
    titulo_eleitor_data_emissao?: string;
    titulo_eleitor_uf?: string;
    reservista?: string;
    nome_mae?: string;
    nome_pai?: string;
    escola_ensino_medio?: string;
    ano_conclusao_ensino_medio?: number | string;
  };
  matricula?: {
    id: string;
    status: string;
    turma?: { id: string; nome: string; codigo: string };
  };
}
export interface AcademicComponentRow {
  moduleId: string | null;
  moduleName: string;
  moduleOrder: number;
  disciplineOrder?: number;
  discipline: string;
  cargaHoraria: number;
  cargaHorariaTeoria?: number;
  cargaHorariaPratica?: number;
  cargaHorariaEstagio?: number;
  nota: number | null;
  notaEstagio?: number | null;
  frequencia: number | null;
  frequenciaEstagio?: number | null;
  situacao: string;
}

export interface AcademicPreviewData {
  componentes: AcademicComponentRow[];
  componentesTable: string;
  historicoTable: string;
  cargaHorariaCumprida: number;
  cargaHorariaTotal: number;
  periodoCurso: string;
  observacoesHistorico: string;
  situacaoAcademica: string;
  mediaGeral: number | null;
  frequenciaGeral: number | null;
  inicioCurso: string | null;
  fimCurso: string | null;
  courseArea: string;
  courseTechnologicalAxis: string;
  courseProfessionalProfile: string;
  moduleNames: string[];
}

export interface AcademicPreviewRpcPayload {
  componentes?: AcademicComponentRow[];
  cargaHorariaCumprida?: number;
  cargaHorariaTotal?: number;
  inicioCurso?: string | null;
  fimCurso?: string | null;
  situacaoAcademica?: string;
  mediaGeral?: number | null;
  frequenciaGeral?: number | null;
  courseArea?: string | null;
  courseTechnologicalAxis?: string | null;
  courseProfessionalProfile?: string | null;
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
