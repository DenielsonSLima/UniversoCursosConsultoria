import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireGestorAtivo,
  requireGestorGlobal,
} from "../../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../../_shared/http.ts";
import { getPaymentIssuerOverview, savePaymentIssuer } from "./issuer.ts";
import {
  assertProviderAdapterReady,
  credentialWebhookUrlFor,
  enforceProviderFixedMetadata,
  extractSecretInput,
  GESTOR_ACTIONS,
  GLOBAL_ACTIONS,
  normalizeEnvironment,
  normalizeMethod,
  normalizeModalidade,
  normalizeProviderCode,
  pickMetadata,
  providerOverviewRow,
  PROVIDERS,
  webhookUrlFor,
} from "./config.ts";
import {
  getCredential,
  isCredentialConfiguredForProvider,
  isCredentialConfiguredForRoute,
  mergeAsaasLegacyCredential,
  setAsaasLegacySecret,
  setGatewaySecret,
  testProvider,
  updateAsaasLegacyConfig,
} from "./credentials.ts";
import { reconcileBaneseReceivable } from "./banese.ts";

Deno.serve(async (req: Request) => {
  const corsHeadersForRequest = buildCorsHeaders(req);
  const respondJson = (body: unknown, status = 200) => json(body, status, req);

  if (
    isRateLimitExceeded(`payment-gateway-api:${getClientIp(req)}`, 180, 60000)
  ) {
    return new Response(
      JSON.stringify({
        error: "Muitas requisicoes em curto periodo. Aguarde alguns instantes.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeadersForRequest,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest });
  }
  if (req.method !== "POST") {
    return respondJson({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const gestor = GESTOR_ACTIONS.has(action)
      ? await requireGestorAtivo(req, admin)
      : null;
    if (gestor && GLOBAL_ACTIONS.has(action)) requireGestorGlobal(gestor);

    if (action === "get-overview") {
      const [
        providersResult,
        credentialsResult,
        routesResult,
        configResult,
        issuerOverview,
      ] = await Promise.all([
        admin.from("payment_gateway_providers").select("*").eq(
          "active",
          true,
        ).order("name", { ascending: true }),
        admin.from("payment_gateway_credentials").select("*").order(
          "provider_code",
          { ascending: true },
        ).order("environment", { ascending: true }),
        admin.from("payment_gateway_routes").select("*").order("modalidade", {
          ascending: true,
        }).order("payment_method", { ascending: true }).order("environment", {
          ascending: true,
        }),
        admin.from("asaas_config").select("environment").maybeSingle(),
        getPaymentIssuerOverview(admin),
      ]);
      if (providersResult.error) throw providersResult.error;
      if (credentialsResult.error) throw credentialsResult.error;
      if (routesResult.error) throw routesResult.error;
      if (configResult.error) throw configResult.error;

      const credentials = await Promise.all(
        (credentialsResult.data || []).map(async (credential: any) => {
          const mergedCredential = await mergeAsaasLegacyCredential(
            admin,
            credential,
          );
          return {
            ...mergedCredential,
            webhook_url: mergedCredential.webhook_url ||
              credentialWebhookUrlFor(
                supabaseUrl,
                mergedCredential.provider_code,
                mergedCredential.environment,
              ),
          };
        }),
      );

      return respondJson({
        providers: (providersResult.data || []).map(providerOverviewRow),
        credentials,
        routes: routesResult.data || [],
        activeEnvironment: normalizeEnvironment(configResult.data?.environment),
        issuerConfig: issuerOverview.config,
        issuerCandidates: issuerOverview.candidates,
        activePolosCount: issuerOverview.active_polos_count,
        webhookUrls: {
          asaas: webhookUrlFor(supabaseUrl, "asaas"),
          mercado_pago: webhookUrlFor(supabaseUrl, "mercado_pago"),
          banco_inter: webhookUrlFor(supabaseUrl, "banco_inter"),
          banese_card: webhookUrlFor(supabaseUrl, "banese_card"),
        },
      });
    }

    if (action === "save-issuer") {
      if (!gestor) throw new Error("Gestor nao identificado.");
      const issuerConfig = await savePaymentIssuer(
        admin,
        gestor,
        body.issuerPoloId,
      );
      return respondJson({ success: true, issuerConfig });
    }

    if (action === "save-credential") {
      const providerCode = normalizeProviderCode(body.providerCode);
      const environment = normalizeEnvironment(body.environment);
      const metadata = enforceProviderFixedMetadata(
        providerCode,
        pickMetadata(body.metadata),
      );
      const current = await getCredential(admin, providerCode, environment);
      const checkedCurrent = current
        ? await mergeAsaasLegacyCredential(admin, current)
        : current;
      const secrets = extractSecretInput(body);
      const currentMetadata =
        current?.metadata && typeof current.metadata === "object" &&
          !Array.isArray(current.metadata)
          ? current.metadata
          : {};
      const metadataWithSecretFlags = {
        ...metadata,
        ...(secrets.certificate_pem
          ? { interCertificateConfigured: true }
          : {}),
        ...(secrets.private_key_pem ? { interPrivateKeyConfigured: true } : {}),
        ...(secrets.crt_access_token
          ? { baneseCrtAccessTokenConfigured: true }
          : {}),
      };

      const nextFlags = {
        api_key_configured: checkedCurrent?.api_key_configured === true,
        access_token_configured:
          checkedCurrent?.access_token_configured === true,
        public_key_configured: checkedCurrent?.public_key_configured === true,
        client_id_configured: checkedCurrent?.client_id_configured === true,
        client_secret_configured:
          checkedCurrent?.client_secret_configured === true,
        webhook_secret_configured:
          checkedCurrent?.webhook_secret_configured === true,
      };

      for (const [kind, value] of Object.entries(secrets)) {
        if (!value) continue;
        if (kind === "api_key") nextFlags.api_key_configured = true;
        if (kind === "access_token") nextFlags.access_token_configured = true;
        if (kind === "public_key") nextFlags.public_key_configured = true;
        if (kind === "client_id") nextFlags.client_id_configured = true;
        if (kind === "client_secret") nextFlags.client_secret_configured = true;
        if (kind === "webhook_secret" || kind === "webhook_token") {
          nextFlags.webhook_secret_configured = true;
        }
      }

      const nextMetadata = {
        ...currentMetadata,
        ...metadataWithSecretFlags,
        ...(providerCode === "banese_card"
          ? enforceProviderFixedMetadata(providerCode, {})
          : {}),
      };
      const configured = isCredentialConfiguredForProvider(providerCode, {
        ...nextFlags,
        metadata: nextMetadata,
      });

      const testResult = configured
        ? await testProvider(admin, providerCode, environment, secrets)
        : { status: "PENDING", message: "Credenciais salvas parcialmente." };

      for (const [kind, value] of Object.entries(secrets)) {
        if (!value) continue;
        await setGatewaySecret(admin, providerCode, environment, kind, value);
        if (providerCode === "asaas" && kind === "api_key") {
          await setAsaasLegacySecret(admin, environment, "api_key", value);
        }
        if (
          providerCode === "asaas" &&
          (kind === "webhook_token" || kind === "webhook_secret")
        ) {
          await setAsaasLegacySecret(
            admin,
            environment,
            "webhook_token",
            value,
          );
        }
      }

      const { data, error } = await admin
        .from("payment_gateway_credentials")
        .upsert({
          id: current?.id,
          provider_code: providerCode,
          environment,
          label: body.label || current?.label || null,
          configured,
          ...nextFlags,
          webhook_url: body.webhookUrl ||
            credentialWebhookUrlFor(supabaseUrl, providerCode, environment),
          metadata: nextMetadata,
          last_test_at: new Date().toISOString(),
          last_test_status: testResult.status,
          last_test_message: testResult.message,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      if (providerCode === "asaas") {
        await updateAsaasLegacyConfig(admin, environment, metadata, testResult);
      }

      return respondJson({
        success: true,
        credential: {
          ...data,
          webhook_url: data.webhook_url ||
            credentialWebhookUrlFor(supabaseUrl, providerCode, environment),
        },
      });
    }

    if (action === "save-route") {
      const providerCode = normalizeProviderCode(body.providerCode);
      const environment = normalizeEnvironment(body.environment);
      const modalidade = normalizeModalidade(body.modalidade);
      const paymentMethod = normalizeMethod(body.paymentMethod);
      const routeEnabled = body.enabled !== false;

      if (
        routeEnabled && providerCode === "banese_card" &&
        environment !== "sandbox"
      ) {
        throw new Error(
          "Banese permanece bloqueado em producao ate a conclusao formal da homologacao.",
        );
      }
      if (
        routeEnabled && providerCode === "banese_card" &&
        paymentMethod === "PIX"
      ) {
        throw new Error(
          "Pix Banese nao pode ser ativado: o banco informou que o servico de homologacao esta indisponivel e a liberacao ocorrera somente em producao.",
        );
      }

      if (routeEnabled) {
        assertProviderAdapterReady(providerCode, paymentMethod);
        if (!PROVIDERS[providerCode].supports.includes(paymentMethod)) {
          throw new Error(
            "Este provedor nao atende a forma de pagamento selecionada.",
          );
        }
      }

      let credentialId = body.credentialId ? String(body.credentialId) : null;
      let configuredCredential: any = null;
      if (credentialId) {
        const { data: credential, error: credentialError } = await admin
          .from("payment_gateway_credentials")
          .select("*")
          .eq("id", credentialId)
          .maybeSingle();
        if (credentialError) throw credentialError;
        if (
          !credential || credential.provider_code !== providerCode ||
          credential.environment !== environment
        ) {
          throw new Error(
            "A credencial selecionada nao pertence a este provedor e ambiente.",
          );
        }
        configuredCredential = credential;
      } else {
        const credential = await getCredential(
          admin,
          providerCode,
          environment,
        );
        configuredCredential = credential;
        credentialId = credential?.id || null;
      }
      if (routeEnabled) {
        const credentialConfigured = await isCredentialConfiguredForRoute(
          admin,
          providerCode,
          environment,
          paymentMethod,
          configuredCredential,
        );
        if (!configuredCredential?.id || !credentialConfigured) {
          throw new Error(
            "Cadastre as chaves deste provedor e ambiente antes de ativar a rota.",
          );
        }
      }

      const { data, error } = await admin
        .from("payment_gateway_routes")
        .upsert({
          modalidade,
          payment_method: paymentMethod,
          environment,
          provider_code: providerCode,
          credential_id: credentialId,
          enabled: routeEnabled,
          notes: body.notes || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "modalidade,payment_method,environment",
        })
        .select()
        .single();
      if (error) throw error;
      return respondJson({ success: true, route: data });
    }

    if (action === "test-connection") {
      const providerCode = normalizeProviderCode(body.providerCode);
      const environment = normalizeEnvironment(body.environment);
      const secrets = extractSecretInput(body);
      const result = await testProvider(
        admin,
        providerCode,
        environment,
        secrets,
      );
      const current = await getCredential(admin, providerCode, environment);
      if (current?.id) {
        const { error } = await admin
          .from("payment_gateway_credentials")
          .update({
            last_test_at: new Date().toISOString(),
            last_test_status: result.status,
            last_test_message: result.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.id);
        if (error) throw error;
      }
      return respondJson({ success: true, ...result });
    }

    if (action === "reconcile-banese-receivable") {
      return respondJson(
        await reconcileBaneseReceivable(admin, body.receivableId),
      );
    }

    return respondJson({ error: "Acao nao reconhecida." }, 400);
  } catch (error) {
    console.error("Erro na integracao bancaria:", error);
    return respondJson({
      error: error instanceof Error ? error.message : "Erro interno.",
    }, 400);
  }
});
