export interface GestorPoloScopeInput {
  context?: string | null;
  explicitPoloIds?: unknown;
  allPolos?: boolean;
  preferredPoloId?: string | null;
}

export interface ResolvedGestorPoloScope {
  isGlobal: boolean;
  allowedPoloIds: string[] | null;
  activePoloId: string | null;
}

// PostgreSQL aceita a forma lexical UUID sem impor versao/variante RFC 4122.
// Isso preserva IDs legados validos do projeto, como o polo matriz 4444... .
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizePoloIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return [...new Set(value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => UUID_PATTERN.test(item)))];
};

/**
 * Resolve o alcance de polos com semantica fail-closed.
 *
 * O acesso global existe somente quando `allPolos` esta ativo e nao ha uma
 * lista explicita. Assim, uma lista restrita sempre prevalece e um usuario
 * global malformado (sem flag e sem polos) nao recebe acesso por acidente.
 */
export const resolveGestorPoloScope = ({
  context,
  explicitPoloIds,
  allPolos = false,
  preferredPoloId,
}: GestorPoloScopeInput): ResolvedGestorPoloScope => {
  const normalizedContext = String(context || '').trim();
  const poloIds = normalizePoloIds(explicitPoloIds);
  const contextPoloIds = UUID_PATTERN.test(normalizedContext)
    ? [normalizedContext]
    : [];
  const allowedPoloIds = poloIds.length > 0 ? poloIds : contextPoloIds;
  const isGlobal = allPolos && allowedPoloIds.length === 0;
  const preferredCandidate = String(preferredPoloId || '').trim();
  const normalizedPreferredPoloId = UUID_PATTERN.test(preferredCandidate)
    ? preferredCandidate
    : null;

  return {
    isGlobal,
    allowedPoloIds: isGlobal ? null : allowedPoloIds,
    activePoloId: isGlobal
      ? normalizedPreferredPoloId
      : allowedPoloIds.includes(normalizedPreferredPoloId || '')
        ? normalizedPreferredPoloId
        : allowedPoloIds[0] || null,
  };
};
