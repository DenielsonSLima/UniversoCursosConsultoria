import { supabase } from '../../lib/supabase';
import {
  PORTAL_CONTEXT_HOME_ROUTES,
  type PortalContext,
  type PortalContextScope,
  type PortalFirstAccess,
  type PortalRole,
} from './portal-context.contract';

type RpcRecord = Record<string, unknown>;

const RPC_NAME = 'portal_listar_perfis';
// PostgreSQL accepts the complete lexical UUID form and legacy records may not
// carry an RFC 4122 variant nibble. The database type remains authoritative;
// the client only rejects malformed/non-hexadecimal identifiers.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export class PortalContextServiceError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'PortalContextServiceError';
    this.code = code;
  }
}

/** Apenas a ausência transitória da migration pode acionar o fallback legado. */
export const isPortalContextRpcUnavailable = (error: unknown) => (
  error instanceof PortalContextServiceError
  && (error.code === 'PGRST202' || error.code === '42883')
);

const asRecord = (value: unknown): RpcRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PortalContextServiceError('O contexto de acesso devolvido pelo serviço é inválido.');
  }
  return value as RpcRecord;
};

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PortalContextServiceError(`O campo ${field} não foi informado pelo serviço de acesso.`);
  }
  return value.trim();
};

const requiredBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') {
    throw new PortalContextServiceError(`O campo ${field} não foi informado pelo serviço de acesso.`);
  }
  return value;
};

const nullableString = (value: unknown, field: string) => {
  if (value === null) return null;
  return requiredString(value, field);
};

const stringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new PortalContextServiceError(`O campo ${field} não corresponde ao contrato de acesso.`);
  }
  return [...new Set(value.map((item) => item.trim()))];
};

const normalizeRole = (value: unknown): PortalRole => {
  const role = requiredString(value, 'role').toUpperCase();
  const mapping: Record<string, PortalRole> = {
    ALUNO: 'Aluno',
    RESPONSAVEL_LEGAL: 'Responsavel',
    PROFESSOR: 'Professor',
    COORDENADOR: 'Coordenador',
    GESTOR: 'Gestor',
  };
  const normalized = mapping[role];
  if (!normalized) {
    throw new PortalContextServiceError('O serviço devolveu um perfil de portal não reconhecido.');
  }
  return normalized;
};

const normalizeHomeRoute = (value: unknown, role: PortalRole) => {
  const homeRoute = requiredString(value, 'homeRoute');
  if (homeRoute !== PORTAL_CONTEXT_HOME_ROUTES[role]) {
    throw new PortalContextServiceError('A rota inicial devolvida pelo serviço não corresponde ao perfil autorizado.');
  }
  return homeRoute;
};

const normalizeScopes = (value: unknown): readonly PortalContextScope[] => {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new PortalContextServiceError('Os escopos devolvidos pelo serviço não correspondem ao contrato de acesso.');
  }
  return value as PortalContextScope[];
};

const normalizeFirstAccess = (
  value: unknown,
  role: PortalRole,
): PortalFirstAccess | null => {
  if (role !== 'Aluno' && role !== 'Responsavel') {
    if (value !== null) {
      throw new PortalContextServiceError('O estado de primeiro acesso não corresponde ao perfil autorizado.');
    }
    return null;
  }

  const source = asRecord(value);
  return {
    acceptedTermsAt: nullableString(source.acceptedTermsAt, 'firstAccess.acceptedTermsAt'),
    acceptedTermsVersion: nullableString(source.acceptedTermsVersion, 'firstAccess.acceptedTermsVersion'),
    requiresPasswordReset: requiredBoolean(source.requiresPasswordReset, 'firstAccess.requiresPasswordReset'),
  };
};

export const normalizePortalContext = (value: unknown): PortalContext => {
  const source = asRecord(value);
  const role = normalizeRole(source.role);
  const contextId = requiredString(source.contextId, 'contextId');
  if (!UUID_PATTERN.test(contextId)) {
    throw new PortalContextServiceError('O identificador do contexto de acesso é inválido.');
  }
  const poloIds = stringArray(source.poloIds, 'poloIds');
  const requiresPoloSelection = requiredBoolean(source.requiresPoloSelection, 'requiresPoloSelection');
  if (requiresPoloSelection && poloIds.length < 2) {
    throw new PortalContextServiceError('A seleção de polo devolvida pelo serviço está inconsistente.');
  }

  return {
    contextId,
    role,
    label: requiredString(source.label, 'label'),
    homeRoute: normalizeHomeRoute(source.homeRoute, role),
    capabilities: stringArray(source.capabilities, 'capabilities'),
    poloIds,
    allPolos: requiredBoolean(source.allPolos, 'allPolos'),
    requiresPoloSelection,
    scopes: normalizeScopes(source.scopes),
    firstAccess: normalizeFirstAccess(source.firstAccess, role),
  };
};

/**
 * Não recebe papel, polo ou escopo do navegador. A identidade da sessão e a
 * política de negócio são resolvidas exclusivamente pela RPC.
 */
export const listPortalContexts = async (): Promise<readonly PortalContext[]> => {
  const { data, error } = await supabase.rpc(RPC_NAME);
  if (error) {
    throw new PortalContextServiceError(error.message, error.code);
  }
  if (!Array.isArray(data)) {
    throw new PortalContextServiceError('O serviço de contextos não devolveu uma lista válida.');
  }
  return data.map(normalizePortalContext);
};
