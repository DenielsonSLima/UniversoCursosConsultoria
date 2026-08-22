import { supabase } from '../../../../lib/supabase';
import type {
  ResponsavelLegal,
  ResponsavelAlunoOption,
  ResponsavelLegalDetalhe,
  ResponsavelLegalSalvarInput,
  ResponsavelLegalSalvarResult,
  ResponsavelLegalVincularAlunoInput,
  ResponsavelLegalVincularAlunoResult,
  ResponsavelLegalVinculo,
  ResponsaveisLegaisListResult,
  ResponsaveisLegaisScope,
} from './responsaveis.contract';
import { requireResponsavelRequestId } from './responsaveis.contract';

type RpcRecord = Record<string, unknown>;

const asRecord = (value: unknown, message: string): RpcRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as RpcRecord;
};

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  return value.trim();
};

const nullableString = (value: unknown, field: string) => {
  if (value === null || value === undefined || value === '') return null;
  return requiredString(value, field);
};

/** O cursor é opaco: valida sem normalizar para reenviá-lo exatamente como recebido. */
const nullableCursor = (value: unknown, field: string) => {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new Error(`O cursor ${field} não foi devolvido pelo serviço autorizado.`);
  }
  return value;
};

const requiredBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  return value;
};

const requiredNonNegativeInteger = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  return value;
};

const requiredStringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  const items = value.map((item) => requiredString(item, field));
  if (items.length === 0) throw new Error(`O campo ${field} não identificou nenhum polo afetado.`);
  return items;
};

const toRpcScope = (scope: ResponsaveisLegaisScope) => {
  if (typeof scope.includeGlobal !== 'boolean') {
    throw new Error('O escopo global solicitado é inválido.');
  }
  return {
    p_polo_id: requiredString(scope.poloId, 'poloId'),
    p_include_global: scope.includeGlobal,
  };
};

const normalizeResponsavel = (value: unknown): ResponsavelLegal => {
  const source = asRecord(value, 'O responsável legal devolvido pelo serviço é inválido.');
  return {
    id: requiredString(source.id, 'id'),
    nome: requiredString(source.nome, 'nome'),
    cpf: nullableString(source.cpf, 'cpf'),
    email: nullableString(source.email, 'email'),
    telefone: nullableString(source.telefone, 'telefone'),
    status: requiredString(source.status, 'status'),
    authUserId: nullableString(source.authUserId, 'authUserId'),
    eligible: requiredBoolean(source.eligible, 'eligible'),
    accessBlockReason: nullableString(source.accessBlockReason, 'accessBlockReason'),
    identidadeVerificada: requiredBoolean(source.identidadeVerificada, 'identidadeVerificada'),
    canManageGlobal: requiredBoolean(source.canManageGlobal, 'canManageGlobal'),
    canVerify: requiredBoolean(source.canVerify, 'canVerify'),
    dependentesAtivos: requiredNonNegativeInteger(source.dependentesAtivos, 'dependentesAtivos'),
    createdAt: nullableString(source.createdAt, 'createdAt'),
    updatedAt: nullableString(source.updatedAt, 'updatedAt'),
  };
};

const normalizeVinculo = (value: unknown): ResponsavelLegalVinculo => {
  const source = asRecord(value, 'O vínculo de responsável devolvido pelo serviço é inválido.');
  return {
    id: requiredString(source.id, 'id'),
    alunoId: requiredString(source.alunoId, 'alunoId'),
    alunoNome: requiredString(source.alunoNome, 'alunoNome'),
    parentesco: requiredString(source.parentesco, 'parentesco'),
    descricaoOutro: nullableString(source.descricaoOutro, 'descricaoOutro'),
    status: requiredString(source.status, 'status'),
    verificadoEm: nullableString(source.verificadoEm, 'verificadoEm'),
    verificacaoMetodo: nullableString(source.verificacaoMetodo, 'verificacaoMetodo'),
    verificacaoReferencia: nullableString(source.verificacaoReferencia, 'verificacaoReferencia'),
    canVerify: requiredBoolean(source.canVerify, 'canVerify'),
    vigenteDe: nullableString(source.vigenteDe, 'vigenteDe'),
    vigenteAte: nullableString(source.vigenteAte, 'vigenteAte'),
  };
};

const normalizeSalvarResult = (value: unknown): ResponsavelLegalSalvarResult => {
  const source = asSingleRecord(value, 'O serviço não devolveu o resumo do responsável salvo.');
  return {
    responsavelLegalId: requiredString(source.responsavelLegalId, 'responsavelLegalId'),
    status: requiredString(source.status, 'status'),
    authUserId: nullableString(source.authUserId, 'authUserId'),
    replayed: requiredBoolean(source.replayed, 'replayed'),
    affectedPoloIds: requiredStringArray(source.affectedPoloIds, 'affectedPoloIds'),
  };
};

const normalizeVincularResult = (value: unknown): ResponsavelLegalVincularAlunoResult => {
  const source = asSingleRecord(value, 'O serviço não devolveu o resumo do vínculo salvo.');
  return {
    vinculoId: requiredString(source.vinculoId, 'vinculoId'),
    responsavelLegalId: requiredString(source.responsavelLegalId, 'responsavelLegalId'),
    alunoId: requiredString(source.alunoId, 'alunoId'),
    status: requiredString(source.status, 'status'),
    affectedPoloIds: requiredStringArray(source.affectedPoloIds, 'affectedPoloIds'),
  };
};

const asSingleRecord = (value: unknown, message: string): RpcRecord => {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(message);
    return asRecord(value[0], message);
  }
  return asRecord(value, message);
};

const normalizeVerificationReference = (value: string | null | undefined) => (
  value?.trim() || null
);

const requireVerificationReference = (value: string | null, message: string) => {
  if (!value || value.length < 3 || value.length > 120) throw new Error(message);
  return value;
};

export const responsaveisLegaisService = {
  /**
   * Consulta mínima, tardia e integralmente autorizada pela RPC do domínio.
   * Evita carregar Parceiros, matrículas, turmas ou estados de convite na aba.
   */
  async listarAlunosParaVinculo(scope: ResponsaveisLegaisScope): Promise<readonly ResponsavelAlunoOption[]> {
    const { data, error } = await supabase.rpc('responsavel_legal_alunos_opcoes_vinculo', {
      ...toRpcScope(scope),
    });
    if (error) throw new Error(error.message);
    const source = asRecord(data, 'O serviço não devolveu as opções autorizadas de alunos.');
    if (!Array.isArray(source.items)) {
      throw new Error('O serviço não devolveu a lista autorizada de alunos.');
    }
    return source.items.map((item) => {
      const row = asRecord(item, 'O aluno devolvido pelo serviço é inválido.');
      return {
        id: requiredString(row.id, 'aluno.id'),
        nome: requiredString(row.nome, 'aluno.nome'),
      };
    });
  },

  async listar(input: {
    scope: ResponsaveisLegaisScope;
    busca?: string;
    status?: string;
    limite?: number;
    cursor?: string | null;
  }): Promise<ResponsaveisLegaisListResult> {
    const { data, error } = await supabase.rpc('responsaveis_legais_listar', {
      ...toRpcScope(input.scope),
      p_busca: input.busca?.trim() || null,
      p_status: input.status && input.status !== 'todos' ? input.status : null,
      p_limite: input.limite ?? 50,
      p_cursor: input.cursor ?? null,
    });
    if (error) throw new Error(error.message);
    const source = asRecord(data, 'O serviço de responsáveis não devolveu uma lista válida.');
    if (!Array.isArray(source.items)) {
      throw new Error('O serviço de responsáveis não devolveu os itens esperados.');
    }
    return {
      items: source.items.map(normalizeResponsavel),
      nextCursor: nullableCursor(source.nextCursor, 'nextCursor'),
      canManageGlobal: requiredBoolean(source.canManageGlobal, 'canManageGlobal'),
      canVerify: requiredBoolean(source.canVerify, 'canVerify'),
      canCreate: requiredBoolean(source.canCreate, 'canCreate'),
    };
  },

  async obter(responsavelLegalId: string, scope: ResponsaveisLegaisScope): Promise<ResponsavelLegalDetalhe> {
    const { data, error } = await supabase.rpc('responsavel_legal_obter', {
      p_responsavel_legal_id: responsavelLegalId,
      ...toRpcScope(scope),
    });
    if (error) throw new Error(error.message);
    const source = asRecord(data, 'O serviço não devolveu o responsável solicitado.');
    const responsavel = normalizeResponsavel(source);
    if (!Array.isArray(source.vinculos)) throw new Error('O serviço não devolveu os vínculos do responsável.');
    return {
      ...responsavel,
      identidadeVerificadaEm: nullableString(source.identidadeVerificadaEm, 'identidadeVerificadaEm'),
      vinculos: source.vinculos.map(normalizeVinculo),
    };
  },

  async salvar(input: ResponsavelLegalSalvarInput): Promise<ResponsavelLegalSalvarResult> {
    const requestId = requireResponsavelRequestId(input.requestId);
    const verificacaoMetodo = input.dados.verificacaoMetodo || null;
    const verificacaoReferencia = normalizeVerificationReference(input.dados.verificacaoReferencia);
    if (input.dados.status === 'ATIVO') {
      if (verificacaoMetodo !== 'DOCUMENTO_CONFERIDO' && verificacaoMetodo !== 'PRESENCIAL') {
        throw new Error('Selecione o método de verificação de identidade permitido.');
      }
      requireVerificationReference(
        verificacaoReferencia,
        'Informe a referência ou protocolo de verificação entre 3 e 120 caracteres.',
      );
    } else if (verificacaoMetodo || verificacaoReferencia) {
      throw new Error('Método e referência só podem ser enviados ao verificar e ativar o responsável.');
    }
    const dados = {
      nome: input.dados.nome.trim(),
      cpf: input.dados.cpf?.trim() || null,
      email: input.dados.email?.trim() || null,
      telefone: input.dados.telefone?.trim() || null,
      ...(input.dados.status ? { status: input.dados.status } : {}),
      ...(verificacaoMetodo ? { verificacaoMetodo } : {}),
      ...(verificacaoReferencia ? { verificacaoReferencia } : {}),
    };
    const { data, error } = await supabase.rpc('responsavel_legal_salvar', {
      p_responsavel_legal_id: input.responsavelLegalId || null,
      p_dados: dados,
      p_request_id: requestId,
      ...toRpcScope(input.scope),
    });
    if (error) throw new Error(error.message);
    return normalizeSalvarResult(data);
  },

  async vincularAluno(input: ResponsavelLegalVincularAlunoInput): Promise<ResponsavelLegalVincularAlunoResult> {
    const requestId = requireResponsavelRequestId(input.requestId);
    const descricaoOutro = input.dados.descricaoOutro?.trim() || null;
    const verificacaoMetodo = input.dados.verificacaoMetodo || null;
    const verificacaoReferencia = normalizeVerificationReference(input.dados.verificacaoReferencia);
    if (input.dados.parentesco === 'OUTRO' && (!descricaoOutro || descricaoOutro.length < 2 || descricaoOutro.length > 120)) {
      throw new Error('Descreva o parentesco com 2 a 120 caracteres.');
    }
    if (input.dados.parentesco !== 'OUTRO' && descricaoOutro) {
      throw new Error('A descrição complementar só pode ser informada para parentesco OUTRO.');
    }
    if (input.dados.status === 'VERIFICADO') {
      if (!['DOCUMENTO_CONFERIDO', 'DECISAO_JUDICIAL', 'PRESENCIAL'].includes(verificacaoMetodo || '')) {
        throw new Error('Selecione o método de verificação do vínculo permitido.');
      }
      requireVerificationReference(
        verificacaoReferencia,
        'Informe a referência ou protocolo do vínculo entre 3 e 120 caracteres.',
      );
    } else if (verificacaoMetodo || verificacaoReferencia) {
      throw new Error('Método e referência só podem ser enviados ao verificar o vínculo.');
    }
    const { data, error } = await supabase.rpc('responsavel_legal_vincular_aluno', {
      p_responsavel_legal_id: input.responsavelLegalId,
      p_aluno_id: input.alunoId,
      p_dados: {
        parentesco: input.dados.parentesco,
        ...(descricaoOutro ? { descricaoOutro } : {}),
        ...(input.dados.status ? { status: input.dados.status } : {}),
        ...(input.dados.vigenteDe ? { vigenteDe: input.dados.vigenteDe } : {}),
        ...(input.dados.vigenteAte ? { vigenteAte: input.dados.vigenteAte } : {}),
        ...(verificacaoMetodo ? { verificacaoMetodo } : {}),
        ...(verificacaoReferencia ? { verificacaoReferencia } : {}),
      },
      p_request_id: requestId,
      ...toRpcScope(input.scope),
    });
    if (error) throw new Error(error.message);
    return normalizeVincularResult(data);
  },

};
