export const BANESE_CNAB_PROVIDER = "banese_card" as const;
export const BANESE_CNAB_BUCKET = "bank-cnab" as const;
export const MAX_CNAB_FILE_BYTES = 5 * 1024 * 1024;

export type CnabEnvironment = "sandbox" | "production";

export const assertCnabProductionConfirmation = (
  environment: CnabEnvironment,
  confirmation: unknown,
) => {
  if (environment === "production" && confirmation !== true) {
    throw new Error(
      "Confirme explicitamente esta operação CNAB240 no ambiente de produção.",
    );
  }
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RETURN_EXTENSIONS = new Set(["ret", "txt", "cnab"]);

export const normalizeCnabEnvironment = (value: unknown): CnabEnvironment =>
  value === "production" ? "production" : "sandbox";

export const normalizeUuidList = (value: unknown, maximum = 200) => {
  if (!Array.isArray(value)) {
    throw new Error("Selecione ao menos uma cobrança válida.");
  }
  const ids = [...new Set(value.map((item) => String(item || "").trim()))];
  if (
    !ids.length || ids.length > maximum || ids.some((id) => !UUID_RE.test(id))
  ) {
    throw new Error(`Selecione entre 1 e ${maximum} cobranças válidas.`);
  }
  return ids;
};

export const validateCnabReturnUpload = (input: {
  fileName: unknown;
  byteLength: number;
}) => {
  const fileName = String(input.fileName || "").trim();
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "";
  if (
    !fileName || fileName.length > 180 || /[\\/]/.test(fileName) ||
    !RETURN_EXTENSIONS.has(extension)
  ) {
    throw new Error("Use um arquivo de retorno .ret, .txt ou .cnab.");
  }
  if (
    !Number.isInteger(input.byteLength) || input.byteLength <= 0 ||
    input.byteLength > MAX_CNAB_FILE_BYTES
  ) {
    throw new Error("O retorno CNAB deve possuir no máximo 5 MB.");
  }
  return { fileName, extension };
};

const upper = (value: unknown) => String(value || "").trim().toUpperCase();

export const assertReceivableEligibleForCnabRemittance = (
  receivable: Record<string, unknown>,
  environment: CnabEnvironment,
) => {
  if (receivable.gateway_provider !== BANESE_CNAB_PROVIDER) {
    throw new Error("A cobrança não pertence ao Banese.");
  }
  if (receivable.gateway_environment !== environment) {
    throw new Error("A cobrança pertence a outro ambiente bancário.");
  }
  if (upper(receivable.gateway_payment_method) !== "BOLETO") {
    throw new Error("A remessa Banese aceita somente boleto/BolePix.");
  }
  if (upper(receivable.status) !== "PENDENTE") {
    throw new Error("A cobrança não está em estado financeiro exportável.");
  }
  if (
    receivable.gateway_boleto_issued_at ||
    receivable.gateway_payment_id ||
    receivable.gateway_payment_link_id ||
    receivable.gateway_boleto_linha_digitavel ||
    receivable.gateway_boleto_codigo_barras ||
    receivable.gateway_invoice_url ||
    receivable.gateway_bank_slip_url ||
    upper(receivable.gateway_submission_status) === "API_REGISTERED"
  ) {
    throw new Error(
      "A cobrança já foi registrada pela API e não pode entrar em remessa CNAB.",
    );
  }
  if (
    receivable.gateway_creation_token ||
    upper(receivable.gateway_status) === "CREATING" ||
    upper(receivable.gateway_submission_status) === "API_AMBIGUOUS"
  ) {
    throw new Error(
      "A criação pela API está ambígua; reconcilie-a antes de usar contingência CNAB.",
    );
  }
  if (
    receivable.gateway_submission_channel ||
    receivable.gateway_submission_status ||
    receivable.gateway_cnab_file_id ||
    ["CNAB_GENERATED", "CNAB_SENT", "CNAB_REGISTERED"].includes(
      upper(receivable.gateway_submission_status),
    )
  ) {
    throw new Error("A cobrança já está vinculada a uma remessa CNAB.");
  }
  if (!String(receivable.gateway_last_error || "").trim()) {
    throw new Error(
      "A remessa é contingência: registre primeiro a falha segura da API.",
    );
  }
};

export const safeCnabError = (error: unknown) =>
  (error instanceof Error
    ? error.message
    : String(error || "Erro desconhecido"))
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
