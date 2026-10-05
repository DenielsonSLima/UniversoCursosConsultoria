import { BaneseAdapterError } from "./types.ts";
import { asRecord } from "./utils.ts";

const PROCESSING_ERROR = "ERRO_BOLETO_COM_PAGAMENTO_NAO_EFETIVADO";
const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

export class BaneseBoletoPaymentProcessingError extends BaneseAdapterError {
  constructor() {
    super("O Banese recusou a baixa porque existe pagamento em processamento. Aguarde a compensação e consulte novamente.");
    this.name = "BaneseBoletoPaymentProcessingError";
  }
}

// O manual não associa este erro a um HTTP específico; o envelope é a prova.
export const bankRejectedCancellationForProcessingPayment = (raw: unknown) => {
  const errors = asRecord(raw).Erros;
  if (!Array.isArray(errors)) return false;
  return errors.some((value) => {
    const error = asRecord(value);
    const code = normalize(error.CodigoErroProcessamento);
    return code === PROCESSING_ERROR ||
      (["400", "500"].includes(code) && normalize(error.Descricao) === PROCESSING_ERROR);
  });
};
