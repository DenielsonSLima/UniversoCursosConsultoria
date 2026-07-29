import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  json as sendJson,
} from "../_shared/http.ts";
import { resolveRedirectTarget } from "../portal-user-management/redirects.ts";

const GENERIC_LOGIN_ERROR =
  "Não foi possível autenticar com as credenciais informadas. Verifique seus dados e tente novamente.";
const GENERIC_RECOVERY_MESSAGE =
  "Se existir uma conta vinculada aos dados informados, enviaremos as instruções de recuperação.";
const RATE_LIMIT_ERROR =
  "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

type PortalAuthPayload = {
  action?: "login" | "recover";
  identifier?: string;
  password?: string;
  redirectTo?: string;
  turnstileToken?: string;
};

type RateLimitResult = {
  allowed: boolean;
  retry_after_seconds: number;
};

type TurnstileVerification = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

const LOCAL_TURNSTILE_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "192.168.1.109",
  "192.168.3.107",
]);

const normalizeIdentifier = (value?: string) =>
  String(value || "").trim().toLowerCase();

const isTurnstileRequired = () =>
  String(Deno.env.get("TURNSTILE_REQUIRED") || "").trim().toLowerCase() ===
    "true";

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

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const consumeRateLimit = async (
  admin: any,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
) => {
  const { data, error } = await admin.rpc("consume_portal_auth_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as RateLimitResult | null;
  return row?.allowed === true;
};

const checkRateLimits = async (
  admin: any,
  action: "login" | "recover",
  request: Request,
  identifier: string,
) => {
  const [ipHash, identifierHash] = await Promise.all([
    sha256(`portal-auth:${action}:ip:${getClientIp(request)}`),
    sha256(`portal-auth:${action}:identifier:${identifier}`),
  ]);
  const identifierLimit = action === "login" ? 10 : 5;

  const [ipAllowed, identifierAllowed] = await Promise.all([
    consumeRateLimit(admin, `${action}:ip:${ipHash}`, 60, 15 * 60),
    consumeRateLimit(
      admin,
      `${action}:identifier:${identifierHash}`,
      identifierLimit,
      15 * 60,
    ),
  ]);

  return ipAllowed && identifierAllowed;
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

const getRequestHostname = (request: Request) => {
  try {
    const origin = request.headers.get("origin");
    return origin ? new URL(origin).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

const verifyTurnstile = async (
  request: Request,
  token: string,
  expectedAction: "login" | "recover",
) => {
  const expectedHostname = getRequestHostname(request);
  if (!expectedHostname) return false;

  const secretName = LOCAL_TURNSTILE_HOSTNAMES.has(expectedHostname)
    ? "TURNSTILE_LOCAL_SECRET_KEY"
    : "TURNSTILE_SECRET_KEY";
  const secret = String(Deno.env.get(secretName) || "").trim();
  if (!secret) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  form.set("remoteip", getClientIp(request));
  form.set("idempotency_key", crypto.randomUUID());

  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      },
    );
    if (!response.ok) return false;

    const result = await response.json() as TurnstileVerification;
    return result.success === true &&
      String(result.action || "") === expectedAction &&
      String(result.hostname || "").toLowerCase() === expectedHostname;
  } catch (error) {
    console.error(
      "portal-auth: falha na validação Turnstile",
      error instanceof Error ? error.name : "erro desconhecido",
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(async (request: Request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (payload: unknown, status = 200) =>
    sendJson(payload, status, request);

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
    return json({ error: "Serviço temporariamente indisponível." }, 503);
  }

  let payload: PortalAuthPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: GENERIC_LOGIN_ERROR }, 400);
  }

  const action = payload.action;
  const identifier = normalizeIdentifier(payload.identifier);
  const turnstileToken = String(payload.turnstileToken || "").trim();
  if (
    (action !== "login" && action !== "recover") ||
    !identifier ||
    identifier.length > 254 ||
    turnstileToken.length > 2048
  ) {
    return json({
      error: action === "recover"
        ? GENERIC_RECOVERY_MESSAGE
        : GENERIC_LOGIN_ERROR,
    }, 400);
  }

  if (
    action === "login" &&
    (!payload.password || payload.password.length > 256)
  ) {
    return json({ error: GENERIC_LOGIN_ERROR }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const allowed = await checkRateLimits(admin, action, request, identifier);
    if (!allowed) return json({ error: RATE_LIMIT_ERROR }, 429);
  } catch (error) {
    console.error(
      "portal-auth: falha fechada no limitador",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    return json({ error: "Serviço temporariamente indisponível." }, 503);
  }

  const requiresTurnstile = isTurnstileRequired();
  const turnstileValid = turnstileToken
    ? await verifyTurnstile(request, turnstileToken, action)
    : !requiresTurnstile;
  if (!turnstileValid) {
    return json({
      error: action === "recover"
        ? GENERIC_RECOVERY_MESSAGE
        : GENERIC_LOGIN_ERROR,
    }, 403);
  }

  let resolvedEmail: string | null;
  try {
    resolvedEmail = await resolveLoginIdentity(admin, identifier);
  } catch (error) {
    console.error(
      "portal-auth: falha ao resolver identidade",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    return json({ error: "Serviço temporariamente indisponível." }, 503);
  }

  // Mantém o caminho e o custo da chamada ao Auth semelhantes mesmo quando a
  // matrícula não existe, reduzindo diferenças observáveis de tempo.
  const fallbackHash = await sha256(`unknown:${identifier}`);
  const authEmail = resolvedEmail ||
    `unknown.${fallbackHash.slice(0, 24)}@acesso.universocc.invalid`;

  if (action === "recover") {
    const redirect = resolveRedirectTarget(
      payload.redirectTo || "/recuperar-senha",
    );
    if (!redirect.redirectTo) {
      return json({ message: GENERIC_RECOVERY_MESSAGE });
    }

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
    }

    return json({ message: GENERIC_RECOVERY_MESSAGE });
  }

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

    if (
      !authResponse.ok ||
      typeof authData?.access_token !== "string" ||
      typeof authData?.refresh_token !== "string"
    ) {
      return json({ error: GENERIC_LOGIN_ERROR }, 401);
    }

    return json({
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
    });
  } catch (error) {
    console.error(
      "portal-auth: falha interna no login",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    return json({ error: GENERIC_LOGIN_ERROR }, 401);
  }
});
