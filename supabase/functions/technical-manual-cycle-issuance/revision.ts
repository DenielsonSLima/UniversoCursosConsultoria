export type ManualCycleRevisionItem = {
  chave: string;
  valor: string;
  vencimento: string;
  descontoPontualidade: string;
  jurosAtrasoPercentual: string;
  multaAtrasoPercentual: string;
};

export type ManualCycleRevision = {
  emitirMatricula: boolean;
  modoMatricula?: "BOLETO" | "REGISTRO_SEM_BOLETO" | "OMITIR";
  itens: ManualCycleRevisionItem[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const MONEY_RE = /^\d{1,10}(?:\.\d{1,2})?$/;
const RATE_RE = /^\d{1,3}(?:\.\d{1,6})?$/;
// Limite do transporte: até 60 mensalidades da regra e uma taxa.
// A RPC confere as chaves e a quantidade exata da prévia canônica.
const MAX_REVISION_ITEMS = 61;
const fields = ["chave", "valor", "vencimento", "descontoPontualidade", "jurosAtrasoPercentual", "multaAtrasoPercentual"];

const validDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const parseManualCycleRevision = (value: unknown): ManualCycleRevision | null => {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || typeof value.emitirMatricula !== "boolean"
    || Object.keys(value).some((key) => !["emitirMatricula", "modoMatricula", "itens"].includes(key))
    || !Array.isArray(value.itens) || value.itens.length < 1 || value.itens.length > MAX_REVISION_ITEMS) {
    throw new Error("Revisão das cobranças inválida.");
  }
  const mode = value.modoMatricula;
  if (mode !== undefined && (!["BOLETO", "REGISTRO_SEM_BOLETO", "OMITIR"].includes(String(mode))
    || value.emitirMatricula !== (mode === "BOLETO"))) {
    throw new Error("Modo de matrícula incompatível com a emissão revisada.");
  }
  const items = value.itens.map((item) => {
    if (!isRecord(item) || Object.keys(item).some((key) => !fields.includes(key))
      || typeof item.chave !== "string" || !/^[A-Za-z0-9:_-]{1,120}$/.test(item.chave)
      || typeof item.valor !== "string" || !MONEY_RE.test(item.valor)
      || !validDate(item.vencimento)
      || typeof item.descontoPontualidade !== "string" || !MONEY_RE.test(item.descontoPontualidade)
      || typeof item.jurosAtrasoPercentual !== "string" || !RATE_RE.test(item.jurosAtrasoPercentual)
      || typeof item.multaAtrasoPercentual !== "string" || !RATE_RE.test(item.multaAtrasoPercentual)) {
      throw new Error("Uma cobrança revisada possui campos inválidos.");
    }
    return item as ManualCycleRevisionItem;
  });
  if (new Set(items.map((item) => item.chave)).size !== items.length) {
    throw new Error("A revisão repete uma cobrança.");
  }
  return {
    emitirMatricula: value.emitirMatricula,
    ...(mode === undefined ? {} : { modoMatricula: mode as ManualCycleRevision["modoMatricula"] }),
    itens: items,
  };
};
