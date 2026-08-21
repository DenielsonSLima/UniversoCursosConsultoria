/**
 * Contexto devolvido pela RPC autorizada `portal_listar_perfis`.
 *
 * Este objeto é uma projeção de sessão: o navegador o usa para apresentar a
 * escolha de portal e nunca para conceder ou ampliar autorização localmente.
 */
export type PortalRole =
  | 'Aluno'
  | 'Responsavel'
  | 'Professor'
  | 'Coordenador'
  | 'Gestor';

export interface PortalCoordinatorScope {
  coordenacaoId: string;
  cursoId: string;
  cursoNome: string;
  poloId: string;
  poloNome: string;
  vigenteDe: string | null;
  vigenteAte: string | null;
}

export type PortalContextScope = PortalCoordinatorScope | Record<string, unknown>;

/** Estado canônico de primeiro acesso; presente somente no contexto de Aluno. */
export interface PortalStudentFirstAccess {
  acceptedTermsAt: string | null;
  acceptedTermsVersion: string | null;
  requiresPasswordReset: boolean;
}

export interface PortalContext {
  contextId: string;
  role: PortalRole;
  label: string;
  homeRoute: string;
  capabilities: readonly string[];
  poloIds: readonly string[];
  allPolos: boolean;
  requiresPoloSelection: boolean;
  scopes: readonly PortalContextScope[];
  /** ALUNO recebe dados canônicos; os demais perfis recebem explicitamente null. */
  firstAccess: PortalStudentFirstAccess | null;
}

export const PORTAL_CONTEXT_HOME_ROUTES: Record<PortalRole, string> = {
  Aluno: '/aluno',
  Responsavel: '/responsavel',
  Professor: '/professor',
  Coordenador: '/coordenador',
  Gestor: '/gestor',
};
