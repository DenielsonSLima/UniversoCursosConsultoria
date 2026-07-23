export type AsaasReceivableEnvironment = "sandbox" | "production";

const normalized = (value: unknown) => String(value || "").trim().toLowerCase();

export const hasExistingAsaasRemoteState = (receivable: any) => {
  const provider = normalized(receivable?.gateway_provider);
  const hasAsaasIdentity = Boolean(
    receivable?.asaas_payment_id || receivable?.asaas_payment_link_id,
  );
  const hasGenericAsaasIdentity = provider === "asaas" && Boolean(
    receivable?.gateway_payment_id ||
      receivable?.gateway_payment_link_id ||
      receivable?.gateway_boleto_nosso_numero,
  );
  const hasAmbiguousCreation = provider === "asaas" &&
    [receivable?.asaas_status, receivable?.gateway_status].some((status) =>
      normalized(status) === "creating"
    );
  return hasAsaasIdentity || hasGenericAsaasIdentity || hasAmbiguousCreation;
};

export const resolveExistingAsaasEnvironment = (
  receivable: any,
): AsaasReceivableEnvironment | null => {
  if (!hasExistingAsaasRemoteState(receivable)) return null;

  const provider = normalized(receivable?.gateway_provider);
  if (provider && provider !== "asaas") {
    throw new Error(
      "A cobrança mistura identidade Asaas com outro provedor. Reconcilie antes de operar o título remoto.",
    );
  }

  const environment = normalized(receivable?.gateway_environment);
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error(
      "O ambiente original da cobrança Asaas não está registrado. Reconcilie o título antes de consultar, cancelar ou alterar.",
    );
  }
  return environment;
};

export const resolveExistingAsaasEnvironmentForMany = (
  receivables: any[],
): AsaasReceivableEnvironment | null => {
  const environments = new Set<AsaasReceivableEnvironment>();
  for (const receivable of receivables || []) {
    const environment = resolveExistingAsaasEnvironment(receivable);
    if (environment) environments.add(environment);
  }
  if (environments.size > 1) {
    throw new Error(
      "A seleção contém cobranças Asaas de ambientes diferentes. Processe sandbox e produção separadamente.",
    );
  }
  return [...environments][0] || null;
};
