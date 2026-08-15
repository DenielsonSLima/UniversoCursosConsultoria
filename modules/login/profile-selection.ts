import type { PortalRole } from "./portal-session";

interface ProfileSelectionTarget {
  tipo: PortalRole;
  poloIds?: string[];
}

const ROLE_HOME_ROUTE: Record<PortalRole, string> = {
  Aluno: "/aluno",
  Professor: "/professor",
  Gestor: "/gestor",
};

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
) => profile.tipo === "Professor" && (profile.poloIds || []).length > 1;

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
