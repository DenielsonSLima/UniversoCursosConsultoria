import { supabase } from "../../../../../../../lib/supabase";
import type {
  CicloFinanceiroTecnicoManualEmissaoProgress,
  GerarCicloFinanceiroTecnicoManualInput,
  GerarCicloFinanceiroTecnicoManualResult,
  PreviewCicloFinanceiroTecnicoManualInput,
  PreviewCicloFinanceiroTecnicoManualResult,
  RetomarEmissaoCicloFinanceiroTecnicoManualInput,
} from "./matricula-tecnica-ciclo-manual.types";
import { requireMatriculaTecnicaCicloManual } from "./matricula-tecnica-ciclo-manual.parser";
import {
  requireCicloFinanceiroTecnicoManualPreview,
} from "./matricula-tecnica-ciclo-manual-preview.parser";

export { requireMatriculaTecnicaCicloManual } from "./matricula-tecnica-ciclo-manual.parser";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const isDecimalString = (value: unknown): value is string => (
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

const isIsoCalendarDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
};

const requireIndividualSecondCycleDate = (
  cycleNumber: number,
  firstDueDate: string | null,
) => {
  if (cycleNumber === 2 && firstDueDate === null) {
    throw new Error(
      "O 2º ciclo exige o vencimento individual do primeiro item.",
    );
  }
};

const requireGenerationResult = (
  value: unknown,
): GerarCicloFinanceiroTecnicoManualResult => {
  if (
    !isRecord(value) || !isRecord(value.ciclo) ||
    !Array.isArray(value.ciclo.recebiveis)
  ) {
    throw new Error("O servidor não confirmou a geração e emissão do ciclo.");
  }
  const cycle = value.ciclo;
  const receivables = cycle.recebiveis as unknown[];
  const validReceivables = receivables.every((item) => (
    isRecord(item) &&
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.chave) &&
    ["MATRICULA", "REMATRICULA", "PARCELA"].includes(String(item.tipo)) &&
    Number.isInteger(item.numero) &&
    Number(item.numero) >= 0 &&
    isNonEmptyString(item.descricao) &&
    isDecimalString(item.valor) &&
    isIsoCalendarDate(item.vencimento) &&
    ["PENDENTE", "VENCIDO"].includes(String(item.status)) &&
    item.emissaoBanese === "EMITIDO"
  ));
  const typedReceivables = validReceivables
    ? receivables as Array<Record<string, unknown>>
    : [];
  if (
    value.success !== true ||
    !isNonEmptyString(value.requestId) ||
    typeof value.replayed !== "boolean" ||
    !Number.isInteger(cycle.numero) ||
    Number(cycle.numero) < 1 ||
    cycle.status !== "EMITIDO_BANESE" ||
    cycle.quantidadeItens !== 13 ||
    cycle.quantidadeItens !== receivables.length ||
    !isDecimalString(cycle.total) ||
    cycle.emitidosBanese !== 13 ||
    cycle.pendentesEmissao !== 0 ||
    cycle.emRevisao !== 0 ||
    !validReceivables ||
    new Set(typedReceivables.map((item) => String(item.id))).size !== 13 ||
    new Set(typedReceivables.map((item) => String(item.chave))).size !== 13
  ) {
    throw new Error(
      "O servidor não confirmou as 13 cobranças e os 13 BolePix Banese.",
    );
  }
  const cicloManual = requireMatriculaTecnicaCicloManual(value.cicloManual);
  return {
    success: true,
    requestId: value.requestId,
    replayed: value.replayed,
    ciclo: cycle as unknown as GerarCicloFinanceiroTecnicoManualResult["ciclo"],
    cicloManual,
  };
};

const readIssuanceProgress = (
  value: unknown,
): CicloFinanceiroTecnicoManualEmissaoProgress | null => {
  if (!isRecord(value)) return null;
  const fields = [
    value.cicloNumero,
    value.quantidadeItens,
    value.emitidosBanese,
    value.pendentesEmissao,
    value.emRevisao,
  ];
  if (
    !fields.every(Number.isInteger) ||
    Number(value.cicloNumero) < 1 ||
    Number(value.quantidadeItens) < 1 ||
    Number(value.emitidosBanese) < 0 ||
    Number(value.pendentesEmissao) < 0 ||
    Number(value.emRevisao) < 0 ||
    Number(value.emitidosBanese) + Number(value.pendentesEmissao) +
          Number(value.emRevisao) > Number(value.quantidadeItens)
  ) return null;
  return value as unknown as CicloFinanceiroTecnicoManualEmissaoProgress;
};

export class CicloFinanceiroTecnicoManualIssuanceError extends Error {
  constructor(
    message: string,
    readonly progress: CicloFinanceiroTecnicoManualEmissaoProgress | null,
  ) {
    super(message);
    this.name = "CicloFinanceiroTecnicoManualIssuanceError";
  }
}

export const isCicloFinanceiroTecnicoManualIssuanceError = (
  error: unknown,
): error is CicloFinanceiroTecnicoManualIssuanceError => (
  error instanceof CicloFinanceiroTecnicoManualIssuanceError
);

export const getCicloFinanceiroTecnicoManualRecoveryGuidance = (
  error: unknown,
) => {
  const progress = isCicloFinanceiroTecnicoManualIssuanceError(error)
    ? error.progress
    : null;
  if (progress && progress.emRevisao > 0 && progress.pendentesEmissao === 0) {
    return "Revisão manual necessária; não tente uma nova emissão.";
  }
  return "Use “Retomar emissão”; não gere o ciclo novamente.";
};

const createIssuanceError = (body: unknown, fallback: unknown) => {
  const message = isRecord(body) && isNonEmptyString(body.error)
    ? body.error
    : fallback instanceof Error && isNonEmptyString(fallback.message)
    ? fallback.message
    : "Não foi possível concluir a emissão BolePix Banese.";
  const error = new CicloFinanceiroTecnicoManualIssuanceError(
    message,
    isRecord(body) ? readIssuanceProgress(body.progress) : null,
  );
  if (isRecord(body) && isNonEmptyString(body.code)) {
    Object.assign(error, { code: body.code });
  }
  return error;
};

const readFunctionError = async (error: unknown) => {
  const context = isRecord(error) && isRecord(error.context)
    ? error.context as { json?: () => Promise<unknown> }
    : null;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return createIssuanceError(body, error);
};

const invokeIssuance = async (
  body: Record<string, unknown>,
): Promise<GerarCicloFinanceiroTecnicoManualResult> => {
  const { data, error } = await supabase.functions.invoke(
    "technical-manual-cycle-issuance",
    { body },
  );
  if (error) throw await readFunctionError(error);
  if (isRecord(data) && isNonEmptyString(data.error)) {
    throw createIssuanceError(data, null);
  }
  return requireGenerationResult(data);
};

const reconcileIssuedCycle = (
  result: GerarCicloFinanceiroTecnicoManualResult,
  cycleNumber: number,
) => {
  const generated = result.cicloManual.cicloGerado;
  const finalCycle = cycleNumber === result.cicloManual.cicloMaximo;
  const validTransition = finalCycle
    ? result.cicloManual.estado === "JA_GERADO" &&
      !result.cicloManual.podeGerar
    : ["BLOQUEADO", "ELEGIVEL"].includes(result.cicloManual.estado) &&
      result.cicloManual.proximoCicloNumero === cycleNumber + 1;
  if (
    result.ciclo.numero !== cycleNumber ||
    !validTransition ||
    generated?.numero !== cycleNumber ||
    generated.quantidadeItens !== result.ciclo.quantidadeItens ||
    generated.emitidosBanese !== result.ciclo.quantidadeItens ||
    generated.pendentesEmissao !== 0 ||
    generated.emRevisao !== 0
  ) {
    throw new Error("O servidor não reconciliou o ciclo emitido solicitado.");
  }
};

const requirePreviewResult = (
  value: unknown,
): PreviewCicloFinanceiroTecnicoManualResult => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.matriculaId) ||
    !isNonEmptyString(value.turmaId)
  ) {
    throw new Error("O servidor não confirmou o contexto da prévia do ciclo.");
  }
  const cicloManual = requireMatriculaTecnicaCicloManual(value.cicloManual);
  const preview = requireCicloFinanceiroTecnicoManualPreview(value.preview);
  return {
    matriculaId: value.matriculaId,
    turmaId: value.turmaId,
    cicloManual,
    preview,
  };
};

const unwrap = async <T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  parser: (value: unknown) => T,
) => {
  const { data, error } = await request;
  if (error) throw error;
  return parser(data);
};

export const matriculaTecnicaCicloManualService = {
  async preview(input: PreviewCicloFinanceiroTecnicoManualInput) {
    requireIndividualSecondCycleDate(
      input.cicloNumero,
      input.primeiroVencimento,
    );
    const result = await unwrap(
      supabase.rpc("preview_ciclo_financeiro_tecnico_manual_secure", {
        p_matricula_id: input.matriculaId,
        p_ciclo_numero: input.cicloNumero,
        p_primeiro_vencimento: input.primeiroVencimento,
      }),
      requirePreviewResult,
    );
    if (
      result.matriculaId !== input.matriculaId ||
      result.preview.cicloNumero !== input.cicloNumero ||
      result.preview.sourceVencimento !== (
          input.primeiroVencimento === null ? "TURMA" : "INDIVIDUAL"
        ) ||
      (
        input.primeiroVencimento !== null &&
        (
          result.preview.primeiroVencimento !== input.primeiroVencimento ||
          result.preview.dataOrigem !== input.primeiroVencimento
        )
      ) ||
      result.cicloManual.estado !== "ELEGIVEL" ||
      !result.cicloManual.podeGerar
    ) {
      throw new Error(
        "O servidor não reconciliou a prévia do ciclo solicitado.",
      );
    }
    return result;
  },

  async generate(input: GerarCicloFinanceiroTecnicoManualInput) {
    requireIndividualSecondCycleDate(
      input.cicloNumero,
      input.primeiroVencimento,
    );
    const result = await invokeIssuance({
      action: "generate",
      matriculaId: input.matriculaId,
      cicloNumero: input.cicloNumero,
      ...(input.primeiroVencimento
        ? { primeiroVencimento: input.primeiroVencimento }
        : {}),
      requestId: input.requestId,
      expectedRegraFingerprint: input.expectedRegraFingerprint,
      expectedPoliticaFingerprint: input.expectedPoliticaFingerprint,
      expectedCronogramaFingerprint: input.expectedCronogramaFingerprint,
    });
    if (result.requestId !== input.requestId) {
      throw new Error("O servidor não reconciliou o identificador da emissão.");
    }
    reconcileIssuedCycle(result, input.cicloNumero);
    return result;
  },

  async resume(input: RetomarEmissaoCicloFinanceiroTecnicoManualInput) {
    const result = await invokeIssuance({
      action: "resume",
      matriculaId: input.matriculaId,
      cicloNumero: input.cicloNumero,
    });
    reconcileIssuedCycle(result, input.cicloNumero);
    return result;
  },
};
