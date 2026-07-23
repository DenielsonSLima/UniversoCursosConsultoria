import { BANESE_CNAB_PROVIDER, type CnabEnvironment } from "./policy.ts";

export type GestorActor = { id: string };

export type CnabContext = {
  environment: CnabEnvironment;
  convenio: string;
  edi7Code: string;
};

export const digits = (value: unknown) =>
  String(value || "").replace(/\D/g, "");

export const sha256Bytes = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const sha256Text = (value: string) =>
  sha256Bytes(new TextEncoder().encode(value));

export const writeCnabAudit = async (
  admin: any,
  payload: Record<string, unknown>,
) => {
  const { error } = await admin
    .from("payment_gateway_cnab_audit_events")
    .insert(payload);
  if (error) throw error;
};

export const loadCnabContext = async (
  admin: any,
  requestedEnvironment?: unknown,
): Promise<CnabContext> => {
  const { data: active, error: activeError } = await admin
    .from("asaas_config")
    .select("environment")
    .maybeSingle();
  if (activeError) throw activeError;
  const environment: CnabEnvironment = active?.environment === "production"
    ? "production"
    : "sandbox";
  if (
    requestedEnvironment !== undefined &&
    String(requestedEnvironment || "") !== environment
  ) {
    throw new Error(
      "O ambiente informado não corresponde ao ambiente bancário ativo.",
    );
  }

  const { data: credential, error: credentialError } = await admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", BANESE_CNAB_PROVIDER)
    .eq("environment", environment)
    .maybeSingle();
  if (credentialError) throw credentialError;
  const metadata =
    credential?.metadata && typeof credential.metadata === "object"
      ? credential.metadata as Record<string, unknown>
      : {};
  const convenio = digits(
    metadata.baneseBoletoConvenio || metadata.baneseConvenio,
  );
  const edi7Code = digits(metadata.baneseEdi7Code);
  if (!/^\d{1,20}$/.test(convenio)) {
    throw new Error("Convênio de cobrança Banese não configurado.");
  }
  if (!/^\d{6}$/.test(edi7Code)) {
    throw new Error(
      "Configure o código EDI7 de 6 dígitos fornecido pelo Banese antes de usar CNAB240.",
    );
  }
  return { environment, convenio, edi7Code };
};
