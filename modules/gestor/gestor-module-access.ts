import { canAccessCommunicationRoute, canAccessGestorModule, canAccessTab, type GestorPermissions } from './access-control';
import { POLO_CADASTROS_ALLOWED } from './gestor-navigation';

/** Shared by navigation and rendering; the pilot gate overrides editable module grants. */
export function canOpenGestorModule(
  moduleId: string,
  permissions: GestorPermissions,
  isMatrizSelected: boolean,
  canAccessNfse: boolean,
) {
  if (moduleId === 'meu-perfil') return true;
  const rootModule = moduleId.startsWith('parceiros-novo-')
    ? 'parceiros'
    : moduleId.startsWith('cadastros-')
    ? 'cadastros'
    : moduleId.startsWith('comunicacao-') ? 'comunicacao' : moduleId;
  if (!canAccessGestorModule(permissions, rootModule)) return false;
  if (rootModule === 'emissor-nfse' && !canAccessNfse) return false;
  if (moduleId.startsWith('cadastros-') && !canAccessTab(permissions, 'cadastros', moduleId)) return false;
  if (moduleId.startsWith('comunicacao-') && !canAccessCommunicationRoute(permissions, moduleId)) return false;
  if (moduleId === 'comunicacao-automacoes' && (!permissions.allPolos || !isMatrizSelected)) return false;
  if (moduleId === 'comunicacao'
    && !canAccessTab(permissions, 'comunicacao', 'comunicacao-mensagem')
    && !canAccessTab(permissions, 'comunicacao', 'comunicacao-whatsapp')
    && !(permissions.allPolos && isMatrizSelected
      && canAccessTab(permissions, 'comunicacao', 'comunicacao-automacoes'))) return false;
  if (rootModule === 'configuracoes' && !isMatrizSelected) return false;
  if (!isMatrizSelected && moduleId.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(moduleId)) return false;
  return true;
}
