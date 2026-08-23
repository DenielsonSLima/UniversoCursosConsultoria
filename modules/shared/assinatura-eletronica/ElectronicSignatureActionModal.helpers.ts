import { ElectronicSignatureRequestError } from "./assinatura-eletronica.service";

export const newRequestId = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "Este navegador não oferece a chave segura exigida para assinar.",
    );
  }
  return globalThis.crypto.randomUUID();
};

export const formatDateTime = (value: string | null) => {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Informado pelo serviço";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(parsed);
};

export const electronicSignatureErrorMessage = (error: unknown) => {
  if (!(error instanceof ElectronicSignatureRequestError)) {
    return error instanceof Error
      ? error.message
      : "Não foi possível concluir a assinatura.";
  }
  if (error.code === "PASSWORD_REAUTH_UNAVAILABLE") {
    return "Esta conta ainda não possui senha. Configure uma senha pela recuperação de acesso antes de assinar.";
  }
  if (error.code === "INVALID_PASSWORD") {
    return "A senha informada não confere.";
  }
  if (error.code === "SIGNATURE_ORDER_BLOCKED") {
    return "A assinatura anterior ainda não foi concluída. Atualize o documento e tente novamente depois.";
  }
  if (error.code === "SIGNATURE_POLICY_DISABLED") {
    return "A política deste documento ainda não foi habilitada pelo serviço autorizado.";
  }
  if (error.code === "RATE_LIMITED") {
    return error.retryAfterSeconds
      ? `Muitas tentativas. Aguarde ${error.retryAfterSeconds} segundos e tente novamente.`
      : "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  return error.message;
};
