import { getClientIp } from "../_shared/http.ts";

export type PortalAuthAction = "login" | "recover" | "signup";
export type PortalAuthChallengeContext = "web" | "native";

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

const DEFAULT_LOCAL_TURNSTILE_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
] as const;
const DEFAULT_PRODUCTION_TURNSTILE_HOSTNAMES = [
  "universocc.com.br",
  "www.universocc.com.br",
];
const DEFAULT_NATIVE_TURNSTILE_HOSTNAMES = [
  "universocc.com.br",
  "www.universocc.com.br",
];
const NATIVE_APP_ORIGINS = new Set([
  "capacitor://localhost",
  "https://localhost",
]);
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

const parseHostnameList = (value?: string | null) =>
  String(value || "")
    .split(/[,\s]+/)
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

const getProductionTurnstileHostnames = () =>
  new Set([
    ...DEFAULT_PRODUCTION_TURNSTILE_HOSTNAMES,
    ...parseHostnameList(Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES")),
  ]);

const getLocalTurnstileHostnames = () =>
  new Set([
    ...DEFAULT_LOCAL_TURNSTILE_HOSTNAMES,
    ...parseHostnameList(Deno.env.get("TURNSTILE_LOCAL_HOSTNAMES")),
  ]);

const getNativeTurnstileHostnames = () =>
  new Set([
    ...DEFAULT_NATIVE_TURNSTILE_HOSTNAMES,
    ...parseHostnameList(Deno.env.get("TURNSTILE_NATIVE_ALLOWED_HOSTNAMES")),
  ]);

const isUniversalTurnstileTestSecret = (secret: string) =>
  /^[123]x0{31}AA$/.test(secret);

export const hashPortalAuthValue = async (value: string) => {
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

export const checkIpRateLimit = async (
  admin: any,
  action: PortalAuthAction,
  request: Request,
) => {
  const ipHash = await hashPortalAuthValue(
    `portal-auth:${action}:ip:${getClientIp(request)}`,
  );
  return consumeRateLimit(
    admin,
    `${action}:ip:${ipHash}`,
    60,
    RATE_LIMIT_WINDOW_SECONDS,
  );
};

export const checkIdentifierRateLimit = async (
  admin: any,
  action: PortalAuthAction,
  identifier: string,
) => {
  const identifierHash = await hashPortalAuthValue(
    `portal-auth:${action}:identifier:${identifier}`,
  );
  const identifierLimit = action === "login" ? 10 : 5;
  return consumeRateLimit(
    admin,
    `${action}:identifier:${identifierHash}`,
    identifierLimit,
    RATE_LIMIT_WINDOW_SECONDS,
  );
};

const getRequestOrigin = (request: Request) => {
  try {
    const origin = request.headers.get("origin");
    return origin ? new URL(origin) : null;
  } catch {
    return null;
  }
};

const getRawRequestOrigin = (request: Request) =>
  String(request.headers.get("origin") || "").trim();

export const verifyTurnstile = async (
  request: Request,
  token: string,
  expectedAction: PortalAuthAction,
  challengeContext: PortalAuthChallengeContext,
) => {
  const rawRequestOrigin = getRawRequestOrigin(request);
  const isNativeChallenge = challengeContext === "native";
  if (isNativeChallenge && !NATIVE_APP_ORIGINS.has(rawRequestOrigin)) {
    return false;
  }
  if (!isNativeChallenge && NATIVE_APP_ORIGINS.has(rawRequestOrigin)) {
    return false;
  }

  const requestOrigin = getRequestOrigin(request);
  const callerHostname = requestOrigin?.hostname.toLowerCase() || "";
  if (!requestOrigin || !callerHostname) return false;

  const isLocalHostname = getLocalTurnstileHostnames().has(callerHostname);
  const isProductionHostname = getProductionTurnstileHostnames().has(
    callerHostname,
  );
  const isAllowedProtocol = isLocalHostname
    ? requestOrigin.protocol === "http:" || requestOrigin.protocol === "https:"
    : requestOrigin.protocol === "https:";
  if (
    !isNativeChallenge &&
    ((!isLocalHostname && !isProductionHostname) || !isAllowedProtocol)
  ) {
    return false;
  }

  const secretName = isNativeChallenge
    ? "TURNSTILE_NATIVE_SECRET_KEY"
    : isLocalHostname
    ? "TURNSTILE_LOCAL_SECRET_KEY"
    : "TURNSTILE_SECRET_KEY";
  const secret = String(
    Deno.env.get(secretName) ||
      (isNativeChallenge ? Deno.env.get("TURNSTILE_SECRET_KEY") : "") ||
      "",
  ).trim();
  if (!secret || isUniversalTurnstileTestSecret(secret)) {
    if (secret) {
      console.error(
        "portal-auth: chave universal de teste Turnstile recusada no endpoint público",
      );
    }
    return false;
  }

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
    const verifiedHostname = String(result.hostname || "").toLowerCase();
    const hostnameAccepted = isNativeChallenge
      ? getNativeTurnstileHostnames().has(verifiedHostname)
      : verifiedHostname === callerHostname;
    return result.success === true &&
      String(result.action || "") === expectedAction &&
      hostnameAccepted;
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
