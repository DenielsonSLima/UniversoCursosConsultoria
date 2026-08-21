export const CHECKOUT_FIRST_ACCESS_REQUIRED_MESSAGE =
  "Conclua o primeiro acesso do aluno, aceite os termos vigentes e troque a senha antes de iniciar o pagamento.";

export const CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE =
  "Não foi possível validar o acesso do aluno para este checkout. Entre novamente e tente de novo.";

type JsonRecord = Record<string, unknown>;

export interface CanonicalCheckoutContext {
  role: string;
  contextId: string;
  poloIds: string[];
  allPolos: boolean;
  firstAccess: JsonRecord | null;
}

const asRecord = (value: unknown): JsonRecord | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

export const parseCanonicalCheckoutContexts = (
  value: unknown,
): CanonicalCheckoutContext[] => {
  if (!Array.isArray(value)) {
    throw new Error(CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE);
  }

  return value.map((item) => {
    const source = asRecord(item);
    const role = typeof source?.role === "string"
      ? source.role.trim().toUpperCase()
      : "";
    const contextId = typeof source?.contextId === "string"
      ? source.contextId.trim()
      : "";
    if (!source || !role || !contextId || !Array.isArray(source.poloIds)) {
      throw new Error(CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE);
    }
    if (
      source.poloIds.some((poloId) =>
        typeof poloId !== "string" || !poloId.trim()
      ) || typeof source.allPolos !== "boolean"
    ) {
      throw new Error(CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE);
    }

    return {
      role,
      contextId,
      poloIds: [...new Set(source.poloIds.map((poloId) => poloId.trim()))],
      allPolos: source.allPolos,
      firstAccess: source.firstAccess === null
        ? null
        : asRecord(source.firstAccess),
    };
  });
};

export const findCanonicalCheckoutContext = (
  contexts: readonly CanonicalCheckoutContext[],
  role: "ALUNO" | "GESTOR",
  contextId?: string | null,
) =>
  contexts.find((context) => (
    context.role === role && (!contextId || context.contextId === contextId)
  )) || null;

interface AssertCanonicalAlunoCheckoutReadyOptions {
  alunoId: string;
  alunoAuthUserId?: string | null;
  alunoRequiresPasswordReset: unknown;
  actorAuthUserId: string;
  gestorOnBehalf: boolean;
}

/**
 * `portal_listar_perfis()` já compara a versão aceita com a versão vigente:
 * quando há divergência, os dois campos de aceite retornam `null`.
 */
export const assertCanonicalAlunoCheckoutReady = (
  contexts: readonly CanonicalCheckoutContext[],
  options: AssertCanonicalAlunoCheckoutReadyOptions,
) => {
  const alunoContext = findCanonicalCheckoutContext(
    contexts,
    "ALUNO",
    options.alunoId,
  );
  const targetBelongsToActor = Boolean(
    options.alunoAuthUserId &&
      options.alunoAuthUserId === options.actorAuthUserId,
  );

  if (!alunoContext) {
    // A exceção existe apenas para o fluxo administrativo já autorizado e
    // revalidado por ID + escopo. Um cadastro do próprio ator nunca pode usar
    // essa exceção para contornar o primeiro acesso.
    if (options.gestorOnBehalf && !targetBelongsToActor) return;
    throw new Error(CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE);
  }
  if (!targetBelongsToActor) {
    throw new Error(CHECKOUT_ACCESS_VALIDATION_UNAVAILABLE_MESSAGE);
  }

  const firstAccess = alunoContext.firstAccess;
  const acceptedTermsAt = typeof firstAccess?.acceptedTermsAt === "string"
    ? firstAccess.acceptedTermsAt.trim()
    : "";
  const acceptedTermsVersion =
    typeof firstAccess?.acceptedTermsVersion === "string"
      ? firstAccess.acceptedTermsVersion.trim()
      : "";
  if (
    options.alunoRequiresPasswordReset !== false ||
    !acceptedTermsAt ||
    !acceptedTermsVersion ||
    firstAccess?.requiresPasswordReset !== false
  ) {
    throw new Error(CHECKOUT_FIRST_ACCESS_REQUIRED_MESSAGE);
  }
};
