export type ResponsavelLegalStatus = string;
export type ResponsavelIdentidadeVerificacaoMetodo = 'DOCUMENTO_CONFERIDO' | 'PRESENCIAL';
export type ResponsavelVinculoVerificacaoMetodo = ResponsavelIdentidadeVerificacaoMetodo | 'DECISAO_JUDICIAL';

export interface ResponsaveisLegaisScope {
  /** Polo selecionado no cabeçalho; a autorização é revalidada pela RPC. */
  poloId: string;
  /** Solicitação explícita; somente o backend decide se o ator pode usá-la. */
  includeGlobal: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O requestId faz parte do contrato de idempotência e precisa existir antes
 * de qualquer chamada remota. O serviço reutiliza o valor validado sem gerar
 * um identificador substituto.
 */
export const requireResponsavelRequestId = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() !== value || !UUID_PATTERN.test(value)) {
    throw new Error('A tentativa precisa de um identificador UUID válido para ser enviada com segurança.');
  }
  return value;
};

export interface ResponsavelAlunoOption {
  id: string;
  nome: string;
}

export interface ResponsavelLegalVinculo {
  id: string;
  alunoId: string;
  alunoNome: string;
  parentesco: string;
  descricaoOutro: string | null;
  status: string;
  verificadoEm: string | null;
  verificacaoMetodo: string | null;
  verificacaoReferencia: string | null;
  canVerify: boolean;
  vigenteDe: string | null;
  vigenteAte: string | null;
}

export interface ResponsavelLegal {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  status: ResponsavelLegalStatus;
  authUserId: string | null;
  /** Decisão completa devolvida pelo backend; a UI não a recalcula. */
  eligible: boolean;
  accessBlockReason: string | null;
  identidadeVerificada: boolean;
  /** Flags autoritativas da RPC; não são inferidas pelo navegador. */
  canManageGlobal: boolean;
  canVerify: boolean;
  dependentesAtivos: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ResponsavelLegalDetalhe extends ResponsavelLegal {
  identidadeVerificadaEm: string | null;
  vinculos: readonly ResponsavelLegalVinculo[];
}

export interface ResponsaveisLegaisListResult {
  items: readonly ResponsavelLegal[];
  nextCursor: string | null;
  canManageGlobal: boolean;
  canVerify: boolean;
  canCreate: boolean;
}

export interface ResponsavelLegalSalvarInput {
  scope: ResponsaveisLegaisScope;
  responsavelLegalId?: string | null;
  dados: {
    nome: string;
    cpf?: string | null;
    email?: string | null;
    telefone?: string | null;
    /** ATIVO é a ação explícita autorizada para verificar e ativar identidade. */
    status?: 'ATIVO' | null;
    verificacaoMetodo?: ResponsavelIdentidadeVerificacaoMetodo | null;
    verificacaoReferencia?: string | null;
  };
  requestId: string;
}

export interface ResponsavelLegalVincularAlunoInput {
  scope: ResponsaveisLegaisScope;
  responsavelLegalId: string;
  alunoId: string;
  dados: {
    parentesco: 'MAE' | 'PAI' | 'TUTOR' | 'GUARDIAO_JUDICIAL' | 'OUTRO';
    descricaoOutro?: string | null;
    /** VERIFICADO é decidido e revalidado pela RPC. */
    status?: 'PENDENTE' | 'VERIFICADO';
    vigenteDe?: string | null;
    vigenteAte?: string | null;
    verificacaoMetodo?: ResponsavelVinculoVerificacaoMetodo | null;
    verificacaoReferencia?: string | null;
  };
  requestId: string;
}

/** Mutations retornam somente o resumo canônico; a entidade é sempre refeita por query. */
export interface ResponsavelLegalSalvarResult {
  responsavelLegalId: string;
  status: string;
  authUserId: string | null;
  replayed: boolean;
  affectedPoloIds: readonly string[];
}

export interface ResponsavelLegalVincularAlunoResult {
  vinculoId: string;
  responsavelLegalId: string;
  alunoId: string;
  status: string;
  affectedPoloIds: readonly string[];
}
