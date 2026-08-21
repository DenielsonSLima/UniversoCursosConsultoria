import { supabase } from '../../../../lib/supabase';
import type {
  CoordenacoesScope,
  CoordenacaoOpcoesCadastro,
  CoordenacaoOption,
  ProfessorCoordenacao,
  ProfessorCoordenacaoOption,
  ProfessorCoordenacoesListResult,
  ProfessorCoordenacaoRevogarInput,
  ProfessorCoordenacaoRevogarResult,
  ProfessorCoordenacaoSalvarInput,
  ProfessorCoordenacaoSalvarResult,
} from './coordenacoes.contract';

type RpcRecord = Record<string, unknown>;

const asRecord = (value: unknown, message: string): RpcRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as RpcRecord;
};

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O campo ${field} não foi devolvido pelo serviço autorizado.`);
  }
  return value.trim();
};

const nullableString = (value: unknown, field: string) => {
  if (value === null || value === undefined || value === '') return null;
  return requiredString(value, field);
};

const toRpcScope = (scope: CoordenacoesScope) => {
  if (typeof scope.includeGlobal !== 'boolean') {
    throw new Error('O escopo global solicitado é inválido.');
  }
  return {
    p_polo_id: requiredString(scope.poloId, 'poloId'),
    p_include_global: scope.includeGlobal,
  };
};

/** O cursor é opaco: valida sem normalizar para reenviá-lo exatamente como recebido. */
const nullableCursor = (value: unknown, field: string) => {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new Error(`O cursor ${field} não foi devolvido pelo serviço autorizado.`);
  }
  return value;
};

const normalizeCoordenacao = (value: unknown): ProfessorCoordenacao => {
  const source = asRecord(value, 'A coordenação devolvida pelo serviço é inválida.');
  return {
    id: requiredString(source.id, 'id'),
    professorId: requiredString(source.professorId, 'professorId'),
    professorNome: requiredString(source.professorNome, 'professorNome'),
    cursoId: requiredString(source.cursoId, 'cursoId'),
    cursoNome: requiredString(source.cursoNome, 'cursoNome'),
    poloId: requiredString(source.poloId, 'poloId'),
    poloNome: requiredString(source.poloNome, 'poloNome'),
    status: requiredString(source.status, 'status'),
    vigenteDe: nullableString(source.vigenteDe, 'vigenteDe'),
    vigenteAte: nullableString(source.vigenteAte, 'vigenteAte'),
    observacao: nullableString(source.observacao, 'observacao'),
    createdAt: nullableString(source.createdAt, 'createdAt'),
    updatedAt: nullableString(source.updatedAt, 'updatedAt'),
  };
};

const normalizeOption = (value: unknown, entity: string): CoordenacaoOption => {
  const source = asRecord(value, `A opção de ${entity} devolvida pelo serviço é inválida.`);
  return {
    id: requiredString(source.id, 'id'),
    nome: requiredString(source.nome, 'nome'),
  };
};

const normalizeProfessorOption = (value: unknown): ProfessorCoordenacaoOption => {
  const source = asRecord(value, 'A opção de professor devolvida pelo serviço é inválida.');
  if (!Array.isArray(source.poloIds)) {
    throw new Error('A opção de professor não devolveu os polos autorizados.');
  }
  return {
    id: requiredString(source.id, 'id'),
    nome: requiredString(source.nome, 'nome'),
    poloIds: source.poloIds.map((poloId) => requiredString(poloId, 'poloIds')),
  };
};

const normalizeListResult = (value: unknown): ProfessorCoordenacoesListResult => {
  const source = asRecord(value, 'O serviço de coordenações não devolveu uma lista válida.');
  if (!Array.isArray(source.items)) {
    throw new Error('O serviço de coordenações não devolveu os itens esperados.');
  }
  return {
    items: source.items.map(normalizeCoordenacao),
    nextCursor: nullableCursor(source.nextCursor, 'nextCursor'),
  };
};

const requireRequestId = (value: string) => {
  if (!value.trim()) throw new Error('Não foi possível identificar esta operação de coordenação.');
  return value;
};

export const coordenacoesService = {
  async listar(input: {
    scope: CoordenacoesScope;
    busca?: string;
    status?: string;
    limite?: number;
    cursor?: string | null;
  }): Promise<ProfessorCoordenacoesListResult> {
    const { data, error } = await supabase.rpc('professores_coordenacoes_listar', {
      ...toRpcScope(input.scope),
      p_busca: input.busca?.trim() || null,
      p_status: input.status && input.status !== 'todos' ? input.status : null,
      p_limite: input.limite ?? 100,
      p_cursor: input.cursor ?? null,
    });
    if (error) throw new Error(error.message);
    return normalizeListResult(data);
  },

  /** Opções de cadastro vêm exclusivamente da RPC que já reduziu o escopo autorizado. */
  async listarOpcoesCadastro(scope: CoordenacoesScope): Promise<CoordenacaoOpcoesCadastro> {
    const { data, error } = await supabase.rpc('professores_coordenacoes_opcoes_cadastro', {
      ...toRpcScope(scope),
    });
    if (error) throw new Error(error.message);
    const source = asRecord(data, 'O serviço não devolveu as opções autorizadas de coordenação.');
    if (!Array.isArray(source.professores) || !Array.isArray(source.cursos) || !Array.isArray(source.polos)) {
      throw new Error('O serviço não devolveu todas as opções autorizadas de coordenação.');
    }
    return {
      professores: source.professores.map(normalizeProfessorOption),
      cursos: source.cursos.map((item) => normalizeOption(item, 'curso')),
      polos: source.polos.map((item) => normalizeOption(item, 'polo')),
    };
  },

  async salvar(input: ProfessorCoordenacaoSalvarInput): Promise<ProfessorCoordenacaoSalvarResult> {
    const observacao = input.dados.observacao?.trim() || null;
    if (observacao && (observacao.length < 2 || observacao.length > 500)) {
      throw new Error('A observação deve ter entre 2 e 500 caracteres.');
    }
    const { data, error } = await supabase.rpc('professor_coordenacao_salvar', {
      p_professor_coordenacao_id: input.professorCoordenacaoId || null,
      p_dados: {
        professorId: requiredString(input.dados.professorId, 'professorId'),
        cursoId: requiredString(input.dados.cursoId, 'cursoId'),
        poloId: requiredString(input.dados.poloId, 'poloId'),
        ...(input.dados.vigenteDe ? { vigenteDe: input.dados.vigenteDe } : {}),
        ...(input.dados.vigenteAte ? { vigenteAte: input.dados.vigenteAte } : {}),
        ...(observacao ? { observacao } : {}),
      },
      p_request_id: requireRequestId(input.requestId),
      ...toRpcScope(input.scope),
    });
    if (error) throw new Error(error.message);
    const source = asRecord(data, 'O serviço não devolveu o resumo da coordenação salva.');
    return {
      professorCoordenacaoId: requiredString(source.professorCoordenacaoId, 'professorCoordenacaoId'),
      professorId: requiredString(source.professorId, 'professorId'),
      cursoId: requiredString(source.cursoId, 'cursoId'),
      poloId: requiredString(source.poloId, 'poloId'),
      status: requiredString(source.status, 'status'),
    };
  },

  async revogar(input: ProfessorCoordenacaoRevogarInput): Promise<ProfessorCoordenacaoRevogarResult> {
    const motivo = input.motivo.trim();
    if (motivo.length < 5 || motivo.length > 500) {
      throw new Error('Informe o motivo da revogação entre 5 e 500 caracteres.');
    }
    const { data, error } = await supabase.rpc('professor_coordenacao_revogar', {
      p_professor_coordenacao_id: requiredString(input.professorCoordenacaoId, 'professorCoordenacaoId'),
      p_motivo: motivo,
      p_request_id: requireRequestId(input.requestId),
      ...toRpcScope(input.scope),
    });
    if (error) throw new Error(error.message);
    const source = asRecord(data, 'O serviço não devolveu o resumo da coordenação revogada.');
    return {
      professorCoordenacaoId: requiredString(source.professorCoordenacaoId, 'professorCoordenacaoId'),
      poloId: requiredString(source.poloId, 'poloId'),
      status: requiredString(source.status, 'status'),
      revogadaEm: nullableString(source.revogadaEm, 'revogadaEm'),
    };
  },
};
