export interface CoordenadorAtribuicao {
  coordenacaoId: string;
  cursoId: string;
  cursoNome: string;
  poloId: string;
  poloNome: string;
  vigenteDe: string | null;
  vigenteAte: string | null;
}

export type CoordenadorModuleId = 'inicio' | 'turmas-diarios' | 'assinaturas' | 'perfil';

const COORDENADOR_MODULE_PATHS: Record<CoordenadorModuleId, string> = {
  inicio: '/coordenador',
  'turmas-diarios': '/coordenador/turmas',
  assinaturas: '/coordenador/assinaturas',
  perfil: '/coordenador/perfil',
};

/** Aceita o deep link público já emitido e o alias descritivo da tela. */
export const resolveCoordenadorModuleFromPath = (pathname: string): CoordenadorModuleId | null => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/coordenador' || normalized === '/coordenador/inicio') return 'inicio';
  if (normalized === '/coordenador/turmas' || normalized === '/coordenador/turmas-diarios') return 'turmas-diarios';
  if (normalized === '/coordenador/assinaturas') return 'assinaturas';
  if (normalized === '/coordenador/perfil') return 'perfil';
  return null;
};

export const resolveCoordenadorPathFromModule = (moduleId: string) => (
  moduleId in COORDENADOR_MODULE_PATHS
    ? COORDENADOR_MODULE_PATHS[moduleId as CoordenadorModuleId]
    : COORDENADOR_MODULE_PATHS.inicio
);

export const coordenadorQueryKeys = {
  root: ['coordenador'] as const,
  context: (professorId: string) => ['coordenador', 'contexto', professorId] as const,
  atribuicoes: (professorId: string, poloId: string | null) => [
    'coordenador',
    'contexto',
    professorId,
    'polo',
    poloId || 'sem-polo',
    'atribuicoes',
  ] as const,
};
