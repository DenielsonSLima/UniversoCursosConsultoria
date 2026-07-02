type CorsOptions = {
  methods?: string;
};

const SECURITY_RESPONSE_HEADERS = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'self'; form-action 'self';",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://universocc.com.br",
];

const ORIGIN_PARSE_TARGETS = [
  "PORTAL_ALLOWED_REDIRECT_ORIGINS",
  "ALLOWED_REDIRECT_ORIGINS",
  "ALLOWED_ORIGINS",
  "PUBLIC_SITE_URL",
  "SITE_URL",
  "APP_URL",
  "VITE_PUBLIC_SITE_URL",
  "SUPABASE_URL",
];

const normalizeOriginInput = (value?: string | null) =>
  String(value || "").trim();

const parseOrigin = (value?: string | null) => {
  try {
    const url = new URL(normalizeOriginInput(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

const parseOriginList = (value?: string | null) =>
  normalizeOriginInput(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const getAllowedCorsOrigins = () => {
  const origins = new Set<string>();
  for (const fallback of DEFAULT_ALLOWED_ORIGINS) {
    const origin = parseOrigin(fallback);
    if (origin) origins.add(origin);
  }

  for (const key of ORIGIN_PARSE_TARGETS) {
    for (const rawOrigin of parseOriginList(Deno.env.get(key))) {
      const origin = parseOrigin(rawOrigin);
      if (origin) origins.add(origin);
    }
  }

  return Array.from(origins);
};

const resolveAllowOrigin = (requestOrigin: string | null | undefined) => {
  const allowed = getAllowedCorsOrigins();
  const parsedOrigin = parseOrigin(requestOrigin);
  if (parsedOrigin && allowed.includes(parsedOrigin)) return parsedOrigin;
  return allowed[0] || "https://universocc.com.br";
};

export const buildCorsHeaders = (request?: Request | null, options: CorsOptions = {}) => {
  const methods = options.methods || "POST, OPTIONS";
  const requestOrigin = request?.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": resolveAllowOrigin(requestOrigin),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    ...SECURITY_RESPONSE_HEADERS,
  };
};

export const getClientIp = (req: Request) => {
  const candidate = [
    req.headers.get("x-forwarded-for"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
    req.headers.get("x-client-ip"),
  ].find((value) => typeof value === "string" && value.length > 0);

  const raw = normalizeOriginInput(candidate);
  if (!raw) return "unknown";
  return raw.split(",")[0].trim() || "unknown";
};

type RateLimitBucket = {
  resetAt: number;
  count: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export const isRateLimitExceeded = (key: string, maxRequests: number, windowMs: number) => {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    return false;
  }

  if (bucket.count >= maxRequests) return true;

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return false;
};

export const corsHeaders = buildCorsHeaders();

export type { Environment } from "../asaas/core/runtime.ts";
export {
  apiSecretName,
  baseUrlFor,
  normalizeEnvironment,
  webhookSecretName,
} from "../asaas/core/runtime.ts";
export { isValidCpf } from "../asaas/core/customer.ts";

export const json = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(request ? buildCorsHeaders(request) : corsHeaders),
      "Content-Type": "application/json",
    },
  });

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const ONLINE_MODALIDADES = ["EAD", "LIVRE", "ESPECIALIZACAO", "TECNICO"];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
