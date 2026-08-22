export type ResponsavelParentesco = 'MAE' | 'PAI' | 'TUTOR' | 'GUARDIAO_JUDICIAL' | 'OUTRO';

export interface ResponsavelDependente {
  vinculoId: string;
  alunoId: string;
  nome: string;
  parentesco: ResponsavelParentesco;
  poloIds: readonly string[];
  vigenteDe: string;
  vigenteAte: string | null;
}

export type ResponsavelModuleId = 'dependentes' | 'perfil';

const RESPONSAVEL_MODULE_PATHS: Record<ResponsavelModuleId, string> = {
  dependentes: '/responsavel',
  perfil: '/responsavel/perfil',
};

/** Mantém URL, menu lateral e histórico do navegador apontando para o mesmo módulo. */
export const resolveResponsavelModuleFromPath = (pathname: string): ResponsavelModuleId | null => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (
    normalized === '/responsavel'
    || normalized === '/responsavel/dependentes'
    || normalized === '/responsavel/assinaturas'
  ) return 'dependentes';
  if (normalized === '/responsavel/perfil') return 'perfil';
  return null;
};

export const resolveResponsavelPathFromModule = (moduleId: string) => (
  moduleId in RESPONSAVEL_MODULE_PATHS
    ? RESPONSAVEL_MODULE_PATHS[moduleId as ResponsavelModuleId]
    : RESPONSAVEL_MODULE_PATHS.dependentes
);

export const responsavelQueryKeys = {
  root: ['responsavel'] as const,
  context: (responsavelLegalId: string) => ['responsavel', 'contexto', responsavelLegalId] as const,
  dependentes: (responsavelLegalId: string) => [
    'responsavel',
    'contexto',
    responsavelLegalId,
    'dependentes',
  ] as const,
};
