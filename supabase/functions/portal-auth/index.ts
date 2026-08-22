import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, json as sendJson } from "../_shared/http.ts";
import { resolveRedirectTarget } from "../portal-user-management/redirects.ts";
import {
  checkIdentifierRateLimit,
  checkIpRateLimit,
  hashPortalAuthValue,
  verifyTurnstile,
} from "./request-security.ts";

const GENERIC_LOGIN_ERROR =
  "Não foi possível autenticar com as credenciais informadas. Verifique seus dados e tente novamente.";
const EMAIL_CONFIRMATION_REQUIRED_ERROR =
  "Confirme o e-mail enviado para ativar sua conta. Verifique também Spam ou Lixo eletrônico.";
const GENERIC_RECOVERY_MESSAGE =
  "Se existir uma conta vinculada aos dados informados, enviaremos as instruções de recuperação.";
const RATE_LIMIT_ERROR =
  "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

type PortalAuthPayload = {
  action?: "login" | "recover" | "signup";
  identifier?: string;
  cpf?: string;
  password?: string;
  redirectTo?: string;
  turnstileToken?: string;
  challengeContext?: "web" | "native";
};

const normalizeIdentifier = (value?: string) =>
  String(value || "").trim().toLowerCase();

const resolvePublicApiKey = (serviceRoleKey: string) => {
  const publicApiKey = [
    Deno.env.get("SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    Deno.env.get("VITE_SUPABASE_ANON_KEY"),
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (!publicApiKey || publicApiKey === serviceRoleKey) return null;
  return publicApiKey;
};

const resolveLoginIdentity = async (admin: any, identifier: string) => {
  const { data, error } = await admin.rpc("resolve_portal_login_identity", {
    p_identifier: identifier,
  });
  if (error) throw error;
  return typeof data === "string" && data.trim()
    ? data.trim().toLowerCase()
    : null;
};

const readAuthResponse = async (response: Response) => {
  const body = await response.json().catch(() => null);
  return body && typeof body === "object"
    ? body as Record<string, unknown>
    : null;
};

const isEmailConfirmationRequired = (body: Record<string, unknown> | null) => {
  const codes = [body?.code, body?.error_code]
    .map((value) => String(value || "").trim().toLowerCase());
  const message = String(body?.msg || body?.message || "")
    .trim()
    .toLowerCase();

  return codes.includes("email_not_confirmed") ||
    message === "email not confirmed";
};

Deno.serve(async (request: Request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (payload: unknown, status = 200) =>
    sendJson(payload, status, request);
  const requestStartedAt = globalThis.performance.now();

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(
    /\/$/,
    "",
  );
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ).trim();
  const publicApiKey = resolvePublicApiKey(serviceRoleKey);

  if (!supabaseUrl || !serviceRoleKey || !publicApiKey) {
    console.error("portal-auth: configuração obrigatória ausente ou insegura");
    return json({
      error: "Serviço temporariamente indisponível.",
      code: "service_unavailable",
    }, 503);
  }

  let payload: PortalAuthPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: GENERIC_LOGIN_ERROR }, 400);
  }

  const action = payload.action;
  const challengeContext = payload.challengeContext === "native"
    ? "native"
    : "web";
  const identifier = normalizeIdentifier(payload.identifier);
  const cpf = String(payload.cpf || "").replace(/\D/g, "");
  const turnstileToken = String(payload.turnstileToken || "").trim();
  if (
    (action !== "login" && action !== "recover" && action !== "signup") ||
    !identifier ||
    identifier.length > 254 ||
    (action === "signup" && cpf.length !== 11) ||
    turnstileToken.length > 2048
  ) {
    return json({
      error: action === "recover"
        ? GENERIC_RECOVERY_MESSAGE
        : GENERIC_LOGIN_ERROR,
      code: "invalid_request",
    }, 400);
  }

  if (
    action === "login" &&
    (!payload.password || payload.password.length > 256)
  ) {
    return json({
      error: GENERIC_LOGIN_ERROR,
      code: "invalid_credentials",
    }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const timings = {
    ipRateLimitMs: 0,
    turnstileMs: 0,
    identifierRateLimitMs: 0,
    identityMs: 0,
    authMs: 0,
  };
  const elapsedSince = (startedAt: number) =>
    Math.round((globalThis.performance.now() - startedAt) * 100) / 100;
  const logTiming = (outcome: string) => {
    console.info(
      "portal-auth: timing",
      JSON.stringify({
        action,
        outcome,
        ...timings,
        totalMs: elapsedSince(requestStartedAt),
      }),
    );
  };

  const ipRateLimitStartedAt = globalThis.performance.now();
  try {
    const allowed = await checkIpRateLimit(admin, action, request);
    timings.ipRateLimitMs = elapsedSince(ipRateLimitStartedAt);
    if (!allowed) {
      logTiming("ip_rate_limited");
      return json({
        error: RATE_LIMIT_ERROR,
        code: "rate_limited",
      }, 429);
    }
  } catch (error) {
    timings.ipRateLimitMs = elapsedSince(ipRateLimitStartedAt);
    console.error(
      "portal-auth: falha fechada no limitador",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    logTiming("ip_rate_limit_error");
    return json({
      error: "Serviço temporariamente indisponível.",
      code: "service_unavailable",
    }, 503);
  }

  const turnstileStartedAt = globalThis.performance.now();
  const turnstileValid = turnstileToken
    ? await verifyTurnstile(request, turnstileToken, action, challengeContext)
    : false;
  timings.turnstileMs = elapsedSince(turnstileStartedAt);
  if (!turnstileValid) {
    logTiming("turnstile_rejected");
    return json({
      error: action === "recover"
        ? GENERIC_RECOVERY_MESSAGE
        : GENERIC_LOGIN_ERROR,
      code: "challenge_failed",
    }, 403);
  }

  const identifierRateLimitStartedAt = globalThis.performance.now();
  try {
    const allowed = await checkIdentifierRateLimit(admin, action, identifier);
    timings.identifierRateLimitMs = elapsedSince(identifierRateLimitStartedAt);
    if (!allowed) {
      logTiming("identifier_rate_limited");
      return json({
        error: RATE_LIMIT_ERROR,
        code: "rate_limited",
      }, 429);
    }
  } catch (error) {
    timings.identifierRateLimitMs = elapsedSince(identifierRateLimitStartedAt);
    console.error(
      "portal-auth: falha fechada no limitador por identificador",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    logTiming("identifier_rate_limit_error");
    return json({
      error: "Serviço temporariamente indisponível.",
      code: "service_unavailable",
    }, 503);
  }

  let resolvedEmail: string | null;
  const identityStartedAt = globalThis.performance.now();
  try {
    if (action === "signup") {
      const { data: available, error: availabilityError } = await admin.rpc(
        "is_public_aluno_cpf_available",
        {
          p_cpf: cpf,
          p_exclude_auth_user_id: null,
        },
      );
      if (availabilityError) throw availabilityError;
      timings.identityMs = elapsedSince(identityStartedAt);

      if (available !== true) {
        logTiming("cpf_already_registered");
        return json({
          error: "Este CPF já está cadastrado.",
          code: "cpf_already_registered",
        }, 409);
      }

      logTiming("signup_available");
      return json({ available: true });
    }

    resolvedEmail = identifier.includes("@")
      ? identifier
      : await resolveLoginIdentity(admin, identifier);
    timings.identityMs = elapsedSince(identityStartedAt);
  } catch (error) {
    timings.identityMs = elapsedSince(identityStartedAt);
    console.error(
      "portal-auth: falha ao resolver identidade",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    logTiming("identity_error");
    return json({
      error: "Serviço temporariamente indisponível.",
      code: "service_unavailable",
    }, 503);
  }

  // Mantém o caminho e o custo da chamada ao Auth semelhantes mesmo quando a
  // matrícula não existe, reduzindo diferenças observáveis de tempo.
  const fallbackHash = await hashPortalAuthValue(`unknown:${identifier}`);
  const authEmail = resolvedEmail ||
    `unknown.${fallbackHash.slice(0, 24)}@acesso.universocc.invalid`;

  if (action === "recover") {
    const redirect = resolveRedirectTarget(
      payload.redirectTo || "/recuperar-senha",
    );
    if (!redirect.redirectTo) {
      logTiming("recovery_redirect_rejected");
      return json({ message: GENERIC_RECOVERY_MESSAGE });
    }

    const authStartedAt = globalThis.performance.now();
    try {
      const recoveryUrl = new URL(`${supabaseUrl}/auth/v1/recover`);
      recoveryUrl.searchParams.set("redirect_to", redirect.redirectTo);
      await fetch(recoveryUrl, {
        method: "POST",
        headers: {
          apikey: publicApiKey,
          Authorization: `Bearer ${publicApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: authEmail }),
      });
    } catch (error) {
      console.error(
        "portal-auth: falha interna na recuperação",
        error instanceof Error ? error.message : "erro desconhecido",
      );
    } finally {
      timings.authMs = elapsedSince(authStartedAt);
    }

    logTiming("recovery_accepted");
    return json({ message: GENERIC_RECOVERY_MESSAGE });
  }

  const authStartedAt = globalThis.performance.now();
  try {
    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: publicApiKey,
          Authorization: `Bearer ${publicApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authEmail,
          password: payload.password,
        }),
      },
    );
    const authData = await readAuthResponse(authResponse);
    timings.authMs = elapsedSince(authStartedAt);

    if (
      !authResponse.ok ||
      typeof authData?.access_token !== "string" ||
      typeof authData?.refresh_token !== "string"
    ) {
      if (isEmailConfirmationRequired(authData)) {
        logTiming("email_confirmation_required");
        return json({
          error: EMAIL_CONFIRMATION_REQUIRED_ERROR,
          code: "email_confirmation_required",
        }, 403);
      }
      logTiming("invalid_credentials");
      return json({
        error: GENERIC_LOGIN_ERROR,
        code: "invalid_credentials",
      }, 401);
    }

    logTiming("success");
    const tokenResponse = json({
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
    });
    tokenResponse.headers.set("Cache-Control", "no-store, max-age=0");
    tokenResponse.headers.set("Pragma", "no-cache");
    return tokenResponse;
  } catch (error) {
    timings.authMs = elapsedSince(authStartedAt);
    console.error(
      "portal-auth: falha interna no login",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    logTiming("auth_error");
    return json({
      error: "Serviço temporariamente indisponível.",
      code: "service_unavailable",
    }, 503);
  }
});
