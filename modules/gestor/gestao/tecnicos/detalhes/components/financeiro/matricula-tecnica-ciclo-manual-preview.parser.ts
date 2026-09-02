import type {
  CicloFinanceiroTecnicoManualPreview,
} from "./matricula-tecnica-ciclo-manual.types";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const isDecimalString = (value: unknown): value is string => (
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)
);

const isNonNegativeDecimalString = (value: unknown): value is string => (
  typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

const normalizeBoletoLine = (value: unknown) => (
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
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

const isDayAfter = (candidate: unknown, reference: unknown) => {
  if (!isIsoCalendarDate(candidate) || !isIsoCalendarDate(reference)) {
    return false;
  }
  const [year, month, day] = reference.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return candidate === next.toISOString().slice(0, 10);
};

const isApplicationItem = (value: unknown): value is {
  desconto: boolean;
  multaJuros: boolean;
} => (
  isRecord(value) &&
  typeof value.desconto === "boolean" &&
  typeof value.multaJuros === "boolean"
);

const isPreviewDiscount = (value: unknown, dueDate: unknown) => (
  value === null ||
  (isRecord(value) &&
    isNonNegativeDecimalString(value.valor) &&
    value.validoAte === dueDate &&
    isIsoCalendarDate(value.validoAte))
);

const isPreviewPenalty = (value: unknown, dueDate: unknown) => (
  value === null ||
  (isRecord(value) &&
    isNonNegativeDecimalString(value.percentual) &&
    isNonNegativeDecimalString(value.valor) &&
    isDayAfter(value.iniciaEm, dueDate))
);

const isPreviewInterest = (value: unknown, dueDate: unknown) => (
  value === null ||
  (isRecord(value) &&
    isNonNegativeDecimalString(value.percentualMes) &&
    isNonNegativeDecimalString(value.valorDia) &&
    isDayAfter(value.iniciaEm, dueDate))
);

const hasCanonicalMessages = (
  value: unknown,
  description: unknown,
  instruction: unknown,
) => (
  Array.isArray(value) &&
  value.length === 3 &&
  value.every(isNonEmptyString) &&
  normalizeBoletoLine(value[0]) === normalizeBoletoLine(description) &&
  value[2] === instruction
);

const isBoletoPreviewDetails = (
  value: unknown,
  item: Record<string, unknown>,
  application: { desconto: boolean; multaJuros: boolean },
  canonicalInstruction: unknown,
) => (
  isRecord(value) &&
  isNonNegativeDecimalString(value.valorNominal) &&
  value.valorNominal === item.valor &&
  isNonNegativeDecimalString(value.valorEmDia) &&
  isPreviewDiscount(value.desconto, item.vencimento) &&
  (application.desconto || value.desconto === null) &&
  isPreviewPenalty(value.multa, item.vencimento) &&
  isPreviewInterest(value.juros, item.vencimento) &&
  (application.multaJuros || (value.multa === null && value.juros === null)) &&
  isNonEmptyString(value.instrucaoBoleto) &&
  (
    normalizeBoletoLine(canonicalInstruction).length === 0 ||
    value.instrucaoBoleto === normalizeBoletoLine(canonicalInstruction)
  ) &&
  hasCanonicalMessages(
    value.mensagensBoleto,
    item.descricao,
    value.instrucaoBoleto,
  )
);

export const requireCicloFinanceiroTecnicoManualPreview = (
  value: unknown,
): CicloFinanceiroTecnicoManualPreview => {
  if (!isRecord(value) || !Array.isArray(value.itens)) {
    throw new Error("O servidor não retornou a prévia canônica do ciclo.");
  }
  const items = value.itens as unknown[];
  const terms = value.termos;
  const validTerms = isRecord(terms) &&
    isDecimalString(terms.descontoPontualidade) &&
    isDecimalString(terms.jurosAtrasoPercentual) &&
    isDecimalString(terms.multaAtrasoPercentual) &&
    typeof terms.instrucaoBoleto === "string" &&
    isRecord(terms.aplicacao) &&
    isApplicationItem(terms.aplicacao.matricula) &&
    isApplicationItem(terms.aplicacao.mensalidade) &&
    isApplicationItem(terms.aplicacao.rematricula);
  const application = validTerms
    ? (terms as Record<string, unknown>).aplicacao as Record<
      string,
      { desconto: boolean; multaJuros: boolean }
    >
    : null;
  const validItems = Boolean(application) && items.every((item) => {
    if (!isRecord(item)) return false;
    const applicationKey = item.tipo === "MATRICULA"
      ? "matricula"
      : item.tipo === "REMATRICULA"
      ? "rematricula"
      : "mensalidade";
    return isNonEmptyString(item.chave) &&
      ["MATRICULA", "REMATRICULA", "PARCELA"].includes(String(item.tipo)) &&
      Number.isInteger(item.numero) &&
      Number(item.numero) >= 0 &&
      isNonEmptyString(item.descricao) &&
      isDecimalString(item.valor) &&
      isIsoCalendarDate(item.vencimento) &&
      isBoletoPreviewDetails(
        item.detalhesBoleto,
        item,
        application?.[applicationKey] ?? { desconto: false, multaJuros: false },
        (terms as Record<string, unknown>).instrucaoBoleto,
      );
  });
  const cycleNumber = Number(value.cicloNumero);
  const typedItems = validItems ? items as Array<Record<string, unknown>> : [];
  const keys = typedItems.map((item) => String(item.chave));
  const installments = typedItems.filter((item) => item.tipo === "PARCELA");
  const leadItems = typedItems.filter((item) => item.tipo !== "PARCELA");
  const expectedLeadType = cycleNumber === 1 ? "MATRICULA" : "REMATRICULA";
  const coherentComposition = validItems &&
    installments.length > 0 &&
    leadItems.length <= 1 &&
    leadItems.every((item) =>
      item.tipo === expectedLeadType && item.numero === 0
    ) &&
    (leadItems.length === 0 || typedItems[0]?.tipo === expectedLeadType) &&
    typedItems.slice(leadItems.length).every((item) =>
      item.tipo === "PARCELA"
    ) &&
    installments.every((item, index) => item.numero === index + 1) &&
    typedItems.every((item, index) => (
      index === 0 ||
      String(typedItems[index - 1].vencimento) <= String(item.vencimento)
    )) &&
    new Set(keys).size === keys.length &&
    typedItems[0]?.vencimento === value.primeiroVencimento;
  if (
    !Number.isInteger(value.cicloNumero) ||
    cycleNumber < 1 ||
    cycleNumber > 2 ||
    !["TURMA", "INDIVIDUAL"].includes(String(value.sourceVencimento)) ||
    (Number(value.cicloNumero) === 2 &&
      value.sourceVencimento !== "INDIVIDUAL") ||
    !isIsoCalendarDate(value.dataOrigem) ||
    !isIsoCalendarDate(value.primeiroVencimento) ||
    !Number.isInteger(value.quantidadeItens) ||
    Number(value.quantidadeItens) < 1 ||
    value.quantidadeItens !== items.length ||
    !isDecimalString(value.total) ||
    !coherentComposition ||
    !validTerms ||
    !isNonEmptyString(value.regraEfetivaFingerprint) ||
    !isNonEmptyString(value.politicaFingerprint) ||
    !isNonEmptyString(value.cronogramaFingerprint)
  ) {
    throw new Error("O servidor retornou uma prévia de ciclo incompleta.");
  }
  return value as unknown as CicloFinanceiroTecnicoManualPreview;
};
