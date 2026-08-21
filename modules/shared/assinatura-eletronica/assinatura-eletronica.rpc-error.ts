const RPC_ERROR_CODE_PATTERN = /^[A-Z0-9_]{3,32}$/u;
const RPC_ERROR_MESSAGE_LIMIT = 240;

const sanitizeRpcErrorText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const printable = Array.from(value)
    .filter((character) => character >= " " && character !== "\u007f")
    .join("");
  return printable.replace(/\s+/gu, " ").trim().slice(
    0,
    RPC_ERROR_MESSAGE_LIMIT,
  );
};

const sanitizeRpcErrorCode = (value: unknown): string => {
  if (typeof value !== "string") return "RPC_ERROR";
  const normalized = value.trim().toUpperCase();
  return RPC_ERROR_CODE_PATTERN.test(normalized) ? normalized : "RPC_ERROR";
};

export class ElectronicSignatureRpcError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ElectronicSignatureRpcError";
    this.code = code;
  }
}

export const toElectronicSignatureRpcError = (
  failure: unknown,
): ElectronicSignatureRpcError => {
  const source =
    failure && typeof failure === "object" && !Array.isArray(failure)
      ? failure as Record<string, unknown>
      : {};
  const code = sanitizeRpcErrorCode(source.code);
  const message = sanitizeRpcErrorText(source.message) ||
    "O serviço recusou a operação solicitada.";

  // `details` e `hint` do PostgREST podem conter contexto interno. O toast
  // recebe somente a mensagem limitada e o identificador seguro do erro.
  return new ElectronicSignatureRpcError(`${message} [${code}]`, code);
};
