type LegacyCoordinatorLocation = {
  pathname: string;
  search: string;
  hash: string;
};

const PROFESSOR_MODULE_PATHS: Record<string, string> = {
  inicio: "/professor",
  turmas: "/professor/turmas",
  "plano-curso": "/professor/plano-curso",
  "assinatura-eletronica": "/professor/assinatura-eletronica",
  financeiro: "/professor/financeiro",
  calendario: "/professor/calendario",
  biblioteca: "/professor/biblioteca",
  comunicacao: "/professor/comunicacao",
  perfil: "/professor/perfil",
};

const LEGACY_COORDINATOR_MODULES: Record<string, string> = {
  "/coordenador": "inicio",
  "/coordenador/inicio": "inicio",
  "/coordenador/turmas": "turmas",
  "/coordenador/turmas-diarios": "turmas",
  "/coordenador/assinaturas": "assinatura-eletronica",
  "/coordenador/perfil": "perfil",
};

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export const getProfessorModuleFromPath = (pathname: string) => {
  const normalized = normalizePath(pathname);
  return Object.entries(PROFESSOR_MODULE_PATHS).find(([, path]) =>
    normalized === path
  )?.[0] || null;
};

export const getProfessorPathFromModule = (moduleId: string) =>
  PROFESSOR_MODULE_PATHS[moduleId] || PROFESSOR_MODULE_PATHS.inicio;

export const getLegacyCoordinatorRedirect = (
  location: LegacyCoordinatorLocation,
) => {
  const moduleId =
    LEGACY_COORDINATOR_MODULES[normalizePath(location.pathname)] ||
    "inicio";
  return `${
    getProfessorPathFromModule(moduleId)
  }${location.search}${location.hash}`;
};
