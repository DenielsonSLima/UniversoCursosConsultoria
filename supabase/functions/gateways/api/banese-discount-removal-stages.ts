const classifyRepairCause = (cause: unknown) => {
  const message = cause instanceof Error
    ? cause.message
    : String((cause as Record<string, unknown> | null)?.message || "");
  const known: Array<[string, string]> = [
    ["Acesso negado", "RPC_ACCESS"],
    ["Parâmetros da correção", "RPC_INPUT"],
    ["Snapshot remoto contém", "RPC_SNAPSHOT_KEYS"],
    ["Título Banese não encontrado", "RPC_NOT_FOUND"],
    ["Replay divergente", "RPC_REPLAY"],
    ["Regra canônica", "RPC_CANONICAL"],
    ["Ator da correção", "RPC_ACTOR"],
    ["Título Banese mudou", "RPC_RECEIVABLE_CAS"],
    ["Termos corrigidos", "RPC_TERMS"],
    ["Snapshot técnico corrigido", "RPC_POLICY"],
    ["desconto em formato inválido", "RPC_REMOTE_DISCOUNT_SHAPE"],
    ["GET pós-PUT não comprova", "RPC_REMOTE_PROOF"],
    ["Identidade bancária local", "RPC_BANK_IDENTITY"],
    ["uma única transação", "RPC_TRANSACTION_COUNT"],
    ["Transação bancária diverge", "RPC_TRANSACTION_IDENTITY"],
    ["CAS do título", "RPC_RECEIVABLE_CAS"],
    ["Guard não consumiu", "RPC_GUARD"],
    ["CAS da transação", "RPC_TRANSACTION_CAS"],
    ["Auditoria da correção", "RPC_AUDIT"],
  ];
  return known.find(([needle]) => message.includes(needle))?.[1] ??
    "UNKNOWN";
};

export const withRepairStage = async <T>(
  stage: string,
  action: () => Promise<T>,
) => {
  try {
    return await action();
  } catch (cause) {
    throw new Error(
      `DISCOUNT_REPAIR_STAGE:${stage}:${classifyRepairCause(cause)}`,
      { cause },
    );
  }
};

export const assertDiscountRemovalRemoteProof = (input: {
  snapshot: Record<string, unknown>;
  receivable: Record<string, unknown>;
  nossoNumero: string;
  amount: number;
  dueDate: string;
}) => {
  const raw = input.snapshot;
  const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
  const remoteOurNumber = digits(raw.NossoNumero ?? raw.nossoNumero).padStart(
    9,
    "0",
  );
  const remoteLine = digits(
    raw.NumeroLinhaDigitavel ?? raw.numeroLinhaDigitavel,
  );
  const remoteBarcode = digits(
    raw.NumeroCodigoBarras ?? raw.numeroCodigoBarras,
  );
  const remoteAmount = raw.ValorNominal ?? raw.valorNominal;
  const remoteDueDate = String(
    raw.DataVencimento ?? raw.dataVencimento ?? "",
  ).slice(0, 10);
  const remoteDiscount = raw.Desconto ?? raw.desconto;
  let code = "";
  if (remoteOurNumber !== input.nossoNumero) code = "OUR_NUMBER";
  else if (Number(raw.CodigoSituacaoBoleto ?? raw.codigoSituacaoBoleto) !== 2) {
    code = "STATUS";
  } else if (
    remoteLine !== digits(input.receivable.gateway_boleto_linha_digitavel)
  ) {
    code = "DIGITABLE_LINE";
  } else if (
    remoteBarcode !== digits(input.receivable.gateway_boleto_codigo_barras)
  ) {
    code = "BARCODE";
  } else if (remoteAmount == null || Number(remoteAmount) !== input.amount) {
    code = "AMOUNT";
  } else if (remoteDueDate !== input.dueDate) code = "DUE_DATE";
  else if (
    remoteDiscount != null &&
    (!Array.isArray(remoteDiscount) || remoteDiscount.some((item) => {
      const row = item && typeof item === "object"
        ? item as Record<string, unknown>
        : {};
      const type = Number(row.TipoDesconto ?? row.tipoDesconto);
      const amountValue = row.Valor ?? row.valor;
      const date = String(row.Data ?? row.data ?? "").slice(0, 10);
      const emptyTerm = type === 0 &&
        (amountValue == null || Number(amountValue) === 0) &&
        (!date || date === "0001-01-01");
      const removalTombstone = type === 0 && amountValue != null &&
        Number(amountValue) === 0 && date === input.dueDate;
      return !emptyTerm && !removalTombstone;
    }))
  ) code = "DISCOUNT";
  if (code) throw new Error(`DISCOUNT_REPAIR_REMOTE_PROOF:${code}`);
};
