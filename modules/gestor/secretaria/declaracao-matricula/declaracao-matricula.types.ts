import type { ValidatableDocumentType } from '../../../shared/document-validation/document-validation.types';

export interface DeclaracaoAluno {
  id: string;
  enrollmentId?: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  matricula: string;
  curso: string;
  turmaNome: string;
  turmaCodigo?: string;
  instituicao: string;
  fotoUrl?: string | null;
  tipoDocumento?: string;
  turmaIds?: string[];
  poloNome: string;
  poloCnpj: string;
  cidadePolo: string;
}

export const DECLARACAO_TEMPLATE_DEFAULT = {
  textContent: `<p>Declaramos para os devidos fins que o(a) aluno(a) <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, nascido(a) em <b>{{ALUNO_NASCIMENTO}}</b>, registrado(a) sob a matrícula nº <b>{{ALUNO_MATRICULA}}</b>, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, na turma <b>{{TURMA_NOME}}</b>, nesta instituição de ensino, no polo de <b>{{POLO_NOME}}</b>.</p>`,
  absoluteFields: [],
  validityDays: 30,
  v: 2,
};

export type DeclaracaoDocumentType = Extract<
  ValidatableDocumentType,
  'declaracao_matricula' | 'declaracao_frequencia'
>;

export type DeclaracaoMode = 'individual' | 'lote' | 'custom';

export interface SecretariaDeclaracaoMatriculaPageProps {
  documentService?: {
    getTemplate: (poloId: string) => Promise<any>;
    getQrConfig: () => Promise<any>;
  };
  defaultTemplate?: any;
  documentTitle?: string;
  documentType?: DeclaracaoDocumentType;
  fileSlug?: string;
}
