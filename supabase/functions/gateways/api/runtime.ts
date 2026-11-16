import { saveGatewayRuntimeConfig } from "../runtime-config.ts";
import { getPaymentIssuerOverview } from "./issuer.ts";
import { isCredentialConfiguredForRoute } from "./credentials.ts";
import type { Environment } from "./config.ts";

const assertEnabledEnvironmentReady = async (admin: any, environment: Environment) => {
  const { config: issuer } = await getPaymentIssuerOverview(admin);
  if (!issuer?.active || !issuer.applies_to_all_polos || !issuer.issuer) {
    throw new Error("O emissor financeiro global deve ser uma matriz ativa antes de ativar a integracao.");
  }
  const { data: routes, error: routeError } = await admin
    .from("payment_gateway_routes")
    .select("modalidade, provider_code, payment_method, environment, credential_id, enabled")
    .eq("provider_code", "banese_card")
    .eq("payment_method", "BOLETO")
    .eq("environment", environment)
    .eq("enabled", true)
    .in("modalidade", environment === "production"
      ? ["EAD", "TECNICO", "OUTROS_CREDITOS"] : ["EAD"]);
  if (routeError) throw routeError;
  const credentialIds = [...new Set((routes || []).map((route: any) => route.credential_id).filter(Boolean))];
  if (credentialIds.length === 0) {
    throw new Error("Ative uma rota de boleto Banese homologada neste ambiente antes de ativar a integracao.");
  }
  const { data: credentials, error: credentialError } = await admin
    .from("payment_gateway_credentials")
    .select("*")
    .eq("provider_code", "banese_card")
    .eq("environment", environment)
    .in("id", credentialIds);
  if (credentialError) throw credentialError;
  for (const credential of credentials || []) {
    if (await isCredentialConfiguredForRoute(admin, "banese_card", environment, "BOLETO", credential)) {
      return;
    }
  }
  throw new Error("A credencial Banese do ambiente selecionado nao esta pronta para ativar a integracao.");
};

// Esta ação altera somente o interruptor e o ambiente; nunca prepara ou emite títulos.
export const saveBankingRuntimeConfiguration = async (
  admin: any,
  body: { enabled?: unknown; activeEnvironment?: unknown },
  updatedBy: string,
) => {
  const environment = body.activeEnvironment;
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("Selecione explicitamente sandbox ou producao para a integracao bancaria.");
  }
  if (typeof body.enabled !== "boolean") {
    throw new Error("Informe se a integracao bancaria deve ficar ativa ou inativa.");
  }
  // Desligar permanece possível mesmo com rota, credencial ou emissor indisponíveis.
  if (body.enabled) await assertEnabledEnvironmentReady(admin, environment);
  return saveGatewayRuntimeConfig(admin, {
    enabled: body.enabled,
    activeEnvironment: environment,
    updatedBy,
  });
};
