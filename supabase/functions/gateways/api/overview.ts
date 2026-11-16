import { getGatewayRuntimeConfig } from "../runtime-config.ts";
import { getPaymentIssuerOverview } from "./issuer.ts";
import {
  CONFIGURABLE_PROVIDER_CODES,
  credentialWebhookUrlFor,
  providerOverviewRow,
  webhookUrlFor,
} from "./config.ts";
import { getGatewaySecret, mergeAsaasLegacyCredential } from "./credentials.ts";

export const getGatewayOverview = async (admin: any, supabaseUrl: string) => {
  const [
    providersResult,
    credentialsResult,
    routesResult,
    runtimeConfig,
    issuerOverview,
  ] = await Promise.all([
    admin.from("payment_gateway_providers").select("*")
      .eq("active", true)
      .in("code", [...CONFIGURABLE_PROVIDER_CODES])
      .order("name", { ascending: true }),
    admin.from("payment_gateway_credentials").select("*")
      .in("provider_code", [...CONFIGURABLE_PROVIDER_CODES]).order(
        "provider_code",
        { ascending: true },
      ).order("environment", { ascending: true }),
    admin.from("payment_gateway_routes").select("*")
      .in("provider_code", [...CONFIGURABLE_PROVIDER_CODES])
      .order("modalidade", { ascending: true })
      .order("payment_method", { ascending: true })
      .order("environment", { ascending: true }),
    getGatewayRuntimeConfig(admin),
    getPaymentIssuerOverview(admin),
  ]);
  if (providersResult.error) throw providersResult.error;
  if (credentialsResult.error) throw credentialsResult.error;
  if (routesResult.error) throw routesResult.error;

  const credentials = await Promise.all(
    (credentialsResult.data || []).map(async (credential: any) => {
      const mergedCredential = await mergeAsaasLegacyCredential(
        admin,
        credential,
      );
      const nextCredential = {
        ...mergedCredential,
        webhook_url: mergedCredential.provider_code === "banco_inter"
          ? null
          : mergedCredential.webhook_url ||
            credentialWebhookUrlFor(
              supabaseUrl,
              mergedCredential.provider_code,
              mergedCredential.environment,
            ),
      };

      if (nextCredential.provider_code !== "banese_card") {
        return nextCredential;
      }

      const metadata = (nextCredential.metadata || {}) as Record<string, unknown>;
      const crtAccessToken = await getGatewaySecret(
        admin,
        nextCredential.provider_code,
        nextCredential.environment,
        "crt_access_token",
      ).catch(() => null);
      const hasConfiguredCrtToken = Boolean(
        crtAccessToken ||
          metadata.baneseCrtAccessTokenConfigured === true ||
          String(metadata.baneseCrtAccessTokenConfigured || "").toLowerCase() ===
          "true" ||
          metadata.crt_access_token_configured === true ||
          String(metadata.crt_access_token_configured || "").toLowerCase() ===
          "true",
      );
      const hasConvenioPix = Boolean(
        metadata.banesePixConvenio ||
          metadata.baneseConvenio,
      );
      const hasChavePix = Boolean(
        metadata.banesePixChave ||
          metadata.pixChave ||
          metadata.chave,
      );
      const hasCrtToken = hasConfiguredCrtToken;
      const hasPixHomologacao = metadata.banesePixHomologacaoDisponivel === true ||
        String(metadata.banesePixHomologacaoDisponivel || "").toLowerCase() ===
          "true" ||
        (nextCredential.environment === "production"
          ? hasConvenioPix && hasChavePix
          : hasConvenioPix && hasChavePix && hasCrtToken);

      return {
        ...nextCredential,
        metadata: {
          ...metadata,
          baneseCrtAccessTokenConfigured: hasCrtToken,
          banesePixHomologacaoDisponivel: hasPixHomologacao,
        },
      };
    }),
  );

  return {
    providers: (providersResult.data || []).map(providerOverviewRow),
    credentials,
    routes: routesResult.data || [],
    integrationEnabled: runtimeConfig.enabled,
    activeEnvironment: runtimeConfig.activeEnvironment,
    issuerConfig: issuerOverview.config,
    issuerCandidates: issuerOverview.candidates,
    activePolosCount: issuerOverview.active_polos_count,
    webhookUrls: {
      mercado_pago: webhookUrlFor(supabaseUrl, "mercado_pago"),
      banese_card: webhookUrlFor(supabaseUrl, "banese_card"),
    },
  };
};
