import type { PortalContextScope } from '../../login/portal-context.contract';

const COORDINATION_CAPABILITIES = new Set([
  'PORTAL_COORDENADOR',
  'LISTAR_ATRIBUICOES',
  'ASSINATURAS_COORDENADOR',
  'DIARIO_REVISAR_COORDENACAO',
]);

const isCoordinationScope = (scope: PortalContextScope) => {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return false;
  const source = scope as Record<string, unknown>;
  const kind = typeof source.kind === 'string' ? source.kind.trim().toUpperCase() : '';
  if (kind === 'COORDENACAO_CURSO' || kind === 'COORDENADOR_CURSO') return true;

  return typeof source.coordenacaoId === 'string'
    && Boolean(source.coordenacaoId.trim())
    && typeof source.cursoId === 'string'
    && Boolean(source.cursoId.trim())
    && typeof source.poloId === 'string'
    && Boolean(source.poloId.trim());
};

/**
 * Controla somente a apresentação da segunda caixa. Toda consulta e assinatura
 * continuam sendo autorizadas no servidor para o perfil e contexto informados.
 */
export const hasCoordinationSignatureAccess = ({
  capabilities = [],
  scopes = [],
}: {
  capabilities?: readonly string[];
  scopes?: readonly PortalContextScope[];
}) => capabilities.some((capability) => (
  COORDINATION_CAPABILITIES.has(capability.trim().toUpperCase())
)) || scopes.some(isCoordinationScope);
