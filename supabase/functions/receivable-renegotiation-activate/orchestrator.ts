import {
  ActivationError, type ActivationContext, type ActivationDependencies,
  type ActivationRequest, type ActivationResponse, progressOf, UUID_RE,
} from "./contract.ts";

export const activationFailure = (error: unknown): ActivationError => {
  if (error instanceof ActivationError) return error;
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || "");
  const retryable = /timeout|timed out|aborted|fetch failed|network|dns|econn|\(429\)|\(5\d\d\)/i.test(message);
  // The upstream message can contain CPF, bank identifiers or a raw response.
  // Only bounded, allowlisted diagnostics leave the execution boundary.
  return new ActivationError(retryable ? "BANK_TEMPORARILY_UNAVAILABLE" : "ACTIVATION_REVIEW_REQUIRED",
    retryable ? "Operação preservada. Aguarde e retome a mesma ativação."
      : "A operação foi preservada e exige revisão antes de continuar.", retryable);
};

const responseFor = (context: ActivationContext, code: string | null = null,
  message = "Ativação em andamento. Retome a mesma operação."): ActivationResponse => ({
  ...progressOf(context),
  success: context.state === "ACTIVE",
  agreementId: context.agreementId,
  operationId: context.operationId,
  requestId: context.requestId,
  state: context.state,
  retryable: context.state !== "ACTIVE" && context.state !== "REVIEW_REQUIRED",
  code,
  message,
});

export const assertActivationContext = (request: ActivationRequest, context: ActivationContext) => {
  if (context.agreementId !== request.agreementId || context.requestId !== request.requestId ||
    !UUID_RE.test(context.operationId) ||
    (!["ACTIVE", "REVIEW_REQUIRED"].includes(context.state) && !UUID_RE.test(context.leaseToken)) ||
    !["CANCELING_SOURCES", "ISSUING_REPLACEMENTS", "ACTIVE", "REVIEW_REQUIRED"].includes(context.state) ||
    !context.identity || Object.values(context.identity).length !== 4 ||
    !Object.values(context.identity).every((value) => UUID_RE.test(value)) ||
    typeof context.payerDocument !== "string" || !/^(\d{11}|\d{14})$/.test(context.payerDocument) ||
    !["TECNICO", "LIVRE", "ESPECIALIZACAO"].includes(context.courseType) ||
    !Array.isArray(context.sources) || context.sources.length < 1 || context.sources.length > 120 ||
    !Array.isArray(context.replacementPlan) || context.replacementPlan.length < 1 || context.replacementPlan.length > 120 ||
    !Array.isArray(context.replacements) || context.replacements.length > 120 ||
    (context.replacements.length > 0 && context.replacements.length !== context.replacementPlan.length) ||
    new Set(context.sources.map((item) => item.receivableId)).size !== context.sources.length ||
    new Set(context.replacements.map((item) => item.receivableId)).size !== context.replacements.length ||
    context.sources.some((item) => !UUID_RE.test(item.receivableId) || !UUID_RE.test(item.attemptKey) ||
      !["PENDING", "CANCEL_INTENT", "CANCELED_CONFIRMED"].includes(item.state)) ||
    context.replacements.some((item) => !UUID_RE.test(item.receivableId) || !UUID_RE.test(item.attemptKey) ||
      !["PENDING", "ISSUANCE_INTENT", "ISSUED"].includes(item.state) ||
      context.sources.some((source) => source.receivableId === item.receivableId))) {
    throw new ActivationError("ACTIVATION_CONTEXT_MISMATCH", "A operação não corresponde ao acordo confirmado.");
  }
  if (context.state === "ACTIVE" && (
    context.sources.some((item) => item.state !== "CANCELED_CONFIRMED") ||
    !context.replacementPlan?.length || context.replacements.length !== context.replacementPlan.length ||
    context.replacements.some((item) => item.state !== "ISSUED")
  )) throw new ActivationError("ACTIVE_PROGRESS_INCOMPLETE", "A conclusão do acordo não foi comprovada integralmente.");
};

export const runActivation = async (request: ActivationRequest,
  dependencies: ActivationDependencies): Promise<ActivationResponse> => {
  // Authorization on every invocation precedes the service-role claim and any replay.
  const started = await dependencies.start(request);
  let context = await dependencies.claim(started.operationId);
  assertActivationContext(request, context);
  if (context.state === "ACTIVE") return responseFor(context, null, "Acordo ativado e cobranças emitidas.");
  if (context.state === "REVIEW_REQUIRED") return responseFor(context,
    "ACTIVATION_REVIEW_REQUIRED", "A operação aguarda revisão financeira.");
  const now = dependencies.now || Date.now;
  const deadline = now() + 45_000;
  context.deadlineAt = deadline;
  let performed = 0;
  const shouldYield = () => performed >= 4 || now() >= deadline;
  try {
    await dependencies.preflight(context);
    for (const source of context.sources) {
      if (source.state === "CANCELED_CONFIRMED") continue;
      if (shouldYield()) {
        await dependencies.release(context);
        return responseFor(context);
      }
      const evidence = await dependencies.cancelSource(context, source, async () => {
        await dependencies.markCancelIntent(context, source);
        source.state = "CANCEL_INTENT";
      });
      await dependencies.confirmSource(context, source, evidence);
      source.state = "CANCELED_CONFIRMED";
      performed += 1;
    }
    // This guard is duplicated in SQL; no replacement may exist before all confirmations.
    if (context.sources.some((source) => source.state !== "CANCELED_CONFIRMED")) {
      throw new ActivationError("SOURCES_NOT_CONFIRMED", "Há cancelamentos ainda não confirmados.");
    }
    if (!context.replacements.length) {
      context = await dependencies.prepareReplacements(context);
      context.deadlineAt = deadline;
      assertActivationContext(request, context);
    }
    if (!context.replacements.length || context.replacements.length !== context.replacementPlan.length) {
      throw new ActivationError("EMPTY_REPLACEMENTS", "O acordo não possui todas as parcelas substitutas esperadas.");
    }
    context.state = "ISSUING_REPLACEMENTS";
    for (const item of context.replacements) {
      if (item.state === "ISSUED") continue;
      if (shouldYield()) {
        await dependencies.release(context);
        return responseFor(context);
      }
      const result = await dependencies.issueReplacement(context, item);
      await dependencies.confirmReplacement(context, item, result);
      item.state = "ISSUED";
      performed += 1;
    }
    await dependencies.finish(context);
    context.state = "ACTIVE";
    return responseFor(context, null, "Acordo ativado e cobranças emitidas.");
  } catch (cause) {
    const error = activationFailure(cause);
    if (!error.retryable) context.state = "REVIEW_REQUIRED";
    try {
      await dependencies.fail(context, error);
    } catch {
      // A lost persistence response must never turn into another bank mutation.
      return responseFor(context, "STATE_PERSISTENCE_UNCONFIRMED",
        "A resposta da operação não foi confirmada. Reabra o acordo antes de continuar.");
    }
    return responseFor(context, error.code, error.message);
  }
};
