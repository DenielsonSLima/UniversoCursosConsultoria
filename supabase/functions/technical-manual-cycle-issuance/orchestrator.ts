import {
  errorMessage,
  IssuanceHttpError,
  type ManualCycleContext,
  type ManualCycleIssuanceRequest,
  type ManualCycleProgress,
} from "./contract.ts";

export type ManualCycleIssuanceResult = {
  success: true;
  requestId: string;
  replayed: boolean;
  ciclo: ManualCycleContext["ciclo"] & { status: "EMITIDO_BANESE" };
  cicloManual: unknown;
};

export type ManualCycleIssuanceDependencies = {
  preflight: (request: ManualCycleIssuanceRequest) => Promise<void>;
  prepare: (
    request: ManualCycleIssuanceRequest & { action: "generate" },
  ) => Promise<ManualCycleContext>;
  resume: (
    request: ManualCycleIssuanceRequest,
  ) => Promise<ManualCycleContext>;
  issueReceivable: (
    context: ManualCycleContext,
    receivableId: string,
  ) => Promise<void>;
  reload: (
    request: ManualCycleIssuanceRequest,
  ) => Promise<ManualCycleContext>;
};

const progressFrom = (context: ManualCycleContext): ManualCycleProgress => ({
  cicloNumero: context.ciclo.numero,
  quantidadeItens: context.ciclo.quantidadeItens,
  emitidosBanese: context.ciclo.emitidosBanese,
  pendentesEmissao: context.ciclo.pendentesEmissao,
  emRevisao: context.ciclo.emRevisao,
});

const assertRequestedContext = (
  request: ManualCycleIssuanceRequest,
  context: ManualCycleContext,
) => {
  if (
    context.ciclo.numero !== request.cicloNumero ||
    (context.matriculaId && context.matriculaId !== request.matriculaId) ||
    context.ciclo.quantidadeItens !== 13 ||
    context.ciclo.recebiveis.length !== 13
  ) {
    throw new IssuanceHttpError(
      409,
      "O ciclo persistido não corresponde às 13 cobranças revisadas.",
      "CYCLE_CONTEXT_MISMATCH",
      progressFrom(context),
    );
  }
  if (
    request.action === "generate" && context.requestId !== request.requestId
  ) {
    throw new IssuanceHttpError(
      409,
      "O identificador da geração não foi reconciliado.",
      "REQUEST_ID_MISMATCH",
      progressFrom(context),
    );
  }
};

const assertFullyIssued = (context: ManualCycleContext) => {
  const emitted = context.ciclo.recebiveis.filter((item) =>
    item.emissaoBanese === "EMITIDO" &&
    ["PENDENTE", "VENCIDO"].includes(item.status)
  );
  if (
    context.ciclo.quantidadeItens !== 13 ||
    context.ciclo.emitidosBanese !== 13 ||
    context.ciclo.pendentesEmissao !== 0 ||
    context.ciclo.emRevisao !== 0 || emitted.length !== 13
  ) {
    throw new IssuanceHttpError(
      409,
      "A emissão foi preservada, mas ainda não há 13 BolePix completos.",
      "CYCLE_ISSUANCE_INCOMPLETE",
      progressFrom(context),
    );
  }
};

const partialError = async (
  request: ManualCycleIssuanceRequest,
  dependencies: ManualCycleIssuanceDependencies,
  original: unknown,
) => {
  let progress: ManualCycleProgress | null = null;
  try {
    progress = progressFrom(await dependencies.reload(request));
  } catch {
    // O erro original é mais importante que uma falha secundária de leitura.
  }
  if (original instanceof IssuanceHttpError && original.progress) {
    return original;
  }
  return new IssuanceHttpError(
    409,
    `A emissão foi interrompida com segurança. ${errorMessage(original)}`,
    "CYCLE_ISSUANCE_PARTIAL",
    progress,
  );
};

export const runManualCycleIssuance = async (
  request: ManualCycleIssuanceRequest,
  dependencies: ManualCycleIssuanceDependencies,
): Promise<ManualCycleIssuanceResult> => {
  await dependencies.preflight(request);
  let context: ManualCycleContext;
  if (request.action === "generate") {
    context = await dependencies.prepare(
      request as ManualCycleIssuanceRequest & { action: "generate" },
    );
  } else {
    context = await dependencies.resume(request);
  }
  assertRequestedContext(request, context);

  try {
    for (const receivable of context.ciclo.recebiveis) {
      if (["EMITIDO", "REVISAO_MANUAL"].includes(receivable.emissaoBanese)) {
        continue;
      }
      await dependencies.issueReceivable(context, receivable.id);
    }
    const finalContext = await dependencies.reload(request);
    assertRequestedContext(request, finalContext);
    assertFullyIssued(finalContext);
    return {
      success: true,
      requestId: finalContext.requestId,
      replayed: request.action === "resume" || context.replayed,
      ciclo: { ...finalContext.ciclo, status: "EMITIDO_BANESE" },
      cicloManual: finalContext.cicloManual,
    };
  } catch (error) {
    throw await partialError(request, dependencies, error);
  }
};
