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
  quantidadeBancaria: context.ciclo.quantidadeBancaria ?? context.ciclo.quantidadeItens,
  quantidadeLocal: context.ciclo.quantidadeLocal ?? 0,
  emitidosBanese: context.ciclo.emitidosBanese,
  pendentesEmissao: context.ciclo.pendentesEmissao,
  emRevisao: context.ciclo.emRevisao,
});

const isHistoricallyIssuedPaidItem = (
  item: ManualCycleContext['ciclo']['recebiveis'][number],
) => item.status === 'PAGO' && item.emissaoBanese === 'EMITIDO'
  && item.emissaoHistoricaComprovada === true;

const isProvenLocalEnrollment = (
  item: ManualCycleContext['ciclo']['recebiveis'][number],
  cycle: number,
) => cycle === 1 && item.tipo === 'MATRICULA' && item.numero === 0
  && item.destinoCobranca === 'LOCAL' && item.emissaoBanese === 'NAO_APLICAVEL'
  && item.localSemBoletoComprovado === true && item.emissaoHistoricaComprovada !== true
  && ['PENDENTE', 'VENCIDO', 'PAGO'].includes(item.status);

const assertRequestedContext = (
  request: ManualCycleIssuanceRequest,
  context: ManualCycleContext,
) => {
  const installments = context.ciclo.recebiveis.filter((item) => item.tipo === 'PARCELA');
  const leadItems = context.ciclo.recebiveis.filter((item) => item.tipo !== 'PARCELA');
  const expectedLead = request.cicloNumero === 1 ? 'MATRICULA' : 'REMATRICULA';
  const localItems = context.ciclo.recebiveis.filter((item) => isProvenLocalEnrollment(item, context.ciclo.numero));
  const localCount = context.ciclo.quantidadeLocal ?? 0;
  const bankCount = context.ciclo.quantidadeBancaria ?? context.ciclo.quantidadeItens;
  const localRequested = request.revisao?.modoMatricula === 'REGISTRO_SEM_BOLETO';
  const expectedCount = request.action === 'generate' && request.cicloNumero === 1
    ? (request.revisao?.emitirMatricula === false && !localRequested ? 12 : 13) : null;
  if (
    context.ciclo.numero !== request.cicloNumero ||
    (context.matriculaId && context.matriculaId !== request.matriculaId) ||
    ![12, 13].includes(context.ciclo.quantidadeItens) ||
    context.ciclo.recebiveis.length !== context.ciclo.quantidadeItens ||
    !Number.isInteger(bankCount) || !Number.isInteger(localCount) ||
    bankCount + localCount !== context.ciclo.quantidadeItens ||
    localCount !== localItems.length || localCount > 1 ||
    (localCount > 0 && (context.ciclo.numero !== 1 || bankCount !== 12)) ||
    context.ciclo.recebiveis.some((item) => (
      item.destinoCobranca === 'LOCAL' || item.localSemBoletoComprovado === true || item.emissaoBanese === 'NAO_APLICAVEL'
    ) && !isProvenLocalEnrollment(item, context.ciclo.numero)) ||
    installments.length !== 12 || leadItems.length > 1 ||
    leadItems.some((item) => item.tipo !== expectedLead || item.numero !== 0) ||
    new Set(installments.map((item) => item.numero)).size !== 12 ||
    installments.some((item) => item.numero < 1 || item.numero > 12) ||
    context.ciclo.recebiveis.some((item) => !['PENDENTE', 'VENCIDO'].includes(item.status)
      && !isHistoricallyIssuedPaidItem(item) && !isProvenLocalEnrollment(item, context.ciclo.numero)) ||
    (request.action === 'generate' && localCount !== (localRequested ? 1 : 0)) ||
    (expectedCount !== null && context.ciclo.quantidadeItens !== expectedCount)
  ) {
    throw new IssuanceHttpError(
      409,
      "O ciclo persistido não corresponde às cobranças revisadas.",
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
  const expectedBankCount = context.ciclo.quantidadeBancaria ?? context.ciclo.quantidadeItens;
  const emitted = context.ciclo.recebiveis.filter((item) =>
    item.emissaoBanese === "EMITIDO" &&
    (["PENDENTE", "VENCIDO"].includes(item.status) || isHistoricallyIssuedPaidItem(item))
  );
  if (
    context.ciclo.emitidosBanese !== expectedBankCount ||
    context.ciclo.pendentesEmissao !== 0 ||
    context.ciclo.emRevisao !== 0 || emitted.length !== expectedBankCount
  ) {
    throw new IssuanceHttpError(
      409,
      "A emissão foi preservada, mas ainda há títulos Banese incompletos.",
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
      if (isProvenLocalEnrollment(receivable, context.ciclo.numero)) continue;
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
