export type CertificadoModalidade = 'TECNICO' | 'LIVRE' | 'EAD' | 'ESPECIALIZACAO';
export type CertificadoStatus = 'PENDENTE' | 'FINALIZADO' | 'CANCELADO';

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
  aluno: { nome: string; cpf_cnpj: string; rg?: string | null; data_nascimento?: string | null; naturalidade?: string | null };
  turma: { nome: string; codigo: string };
  curso: { nome: string; carga_horaria: number; area?: string | null; ead_config?: any };
  polo: { nome: string; cidade: string; estado: string } | null;
}
