import { PORTAL_CONTEXT_HOME_ROUTES, type PortalRole } from './portal-context.contract';

interface ProfileSelectionTarget {
  tipo: PortalRole;
  /** Dado apenas informativo; não participa da decisão de autorização. */
  poloIds?: string[];
  /** Sinal canônico e obrigatório no fluxo normalizado da RPC. */
  requiresPoloSelection?: boolean;
}

const ROLE_HOME_ROUTE = PORTAL_CONTEXT_HOME_ROUTES;

const INTERNAL_ROUTE_ORIGIN = "https://portal.interno.invalid";

const normalizeInternalRoute = (value: string) => {
  if (!value.startsWith("/") || value.startsWith("//")) return "";

  try {
    const url = new URL(value, INTERNAL_ROUTE_ORIGIN);
    if (url.origin !== INTERNAL_ROUTE_ORIGIN) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
};

const isRouteForRole = (route: string, homeRoute: string) =>
  route === homeRoute ||
  route.startsWith(`${homeRoute}/`) ||
  route.startsWith(`${homeRoute}?`) ||
  route.startsWith(`${homeRoute}#`);

export const requiresProfessorPoloSelection = (
  profile: ProfileSelectionTarget,
) => {
  if (profile.tipo !== 'Professor' && profile.tipo !== 'Coordenador') return false;
  return profile.requiresPoloSelection === true;
};

/**
 * A consulta de polos pode expor mensagens técnicas do banco. Mantemos o
 * retorno de login claro e seguro, indicando o próximo passo sem vazar esse
 * detalhe ao usuário.
 */
export const getProfileSelectionErrorMessage = (
  profile: ProfileSelectionTarget,
) =>
  requiresProfessorPoloSelection(profile)
    ? "Não foi possível carregar os polos vinculados a este perfil. Tente novamente."
    : "Não foi possível concluir o acesso com este perfil. Tente novamente.";

/**
 * Reaplica a preferência local somente para os portais que oferecem troca de
 * polo e somente quando a RPC canônica ainda devolve esse polo no escopo.
 * Gestor e Aluno mantêm o primeiro polo canônico, sem herdar estado de outro
 * portal ou de uma sessão anterior.
 */
export const resolvePortalActivePoloId = (
  role: PortalRole,
  canonicalPoloIds: readonly string[],
  persistedPoloId?: string | null,
) => {
  const canonicalFallback = canonicalPoloIds[0] || null;
  if (role !== 'Professor' && role !== 'Coordenador') {
    return canonicalFallback;
  }

  const preferred = persistedPoloId?.trim() || '';
  return preferred && canonicalPoloIds.includes(preferred)
    ? preferred
    : canonicalFallback;
};

/**
 * Preserva um retorno pós-login somente quando ele pertence ao perfil que a
 * pessoa acabou de escolher. Isso impede que um deep link de gestor anule a
 * escolha explícita de professor (e vice-versa).
 */
export const resolveProfilePostLoginRoute = (
  role: PortalRole,
  redirectPath?: string | null,
) => {
  const homeRoute = ROLE_HOME_ROUTE[role];
  const candidateRoute = normalizeInternalRoute(
    String(redirectPath || "").trim(),
  );

  return isRouteForRole(candidateRoute, homeRoute) ? candidateRoute : homeRoute;
};
