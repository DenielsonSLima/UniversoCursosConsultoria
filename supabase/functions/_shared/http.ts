type CorsOptions = {
  methods?: string;
};

const SECURITY_RESPONSE_HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'; form-action 'self';",
  "Vary": "Origin",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://universocc.com.br",
  "https://www.universocc.com.br",
  "https://localhost",
  "http://localhost",
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

const normalizeHeaderValue = (value: string) => value.trim().toLowerCase();

const isRequestedHeader = (value: string) => {
  const normalized = normalizeHeaderValue(value);
  return normalized.length > 0 && normalized !== "origin";
};

const mergeRequestedHeaders = (request?: Request | null) => {
  const requestedHeaders = new Set<string>([
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "accept",
    "x-requested-with",
  ]);

  const requestedHeaderList =
    parseOriginList(request?.headers.get("access-control-request-headers"));
  for (const header of requestedHeaderList) {
    const normalized = normalizeHeaderValue(header);
    if (isRequestedHeader(normalized)) {
      requestedHeaders.add(normalized);
    }
  }

  return Array.from(requestedHeaders).sort().join(", ");
};

const parseOriginList = (value?: string | null) =>
  normalizeOriginInput(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const isLocalDevelopmentOrigin = (origin: string) => {
  try {
    const hostname = new URL(origin).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
      return true;
    }
    return /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
      || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  } catch {
    return false;
  }
};

const isUniversityDomain = (origin: string) => {
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "universocc.com.br") return true;
    return parsed.hostname.endsWith(".universocc.com.br");
  } catch {
    return false;
  }
};

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
  if (parsedOrigin && (isLocalDevelopmentOrigin(parsedOrigin) || isUniversityDomain(parsedOrigin))) return parsedOrigin;
  if (parsedOrigin && allowed.includes(parsedOrigin)) return parsedOrigin;
  return allowed[0] || "https://universocc.com.br";
};

export const buildCorsHeaders = (request?: Request | null, options: CorsOptions = {}) => {
  const methods = options.methods || "POST, OPTIONS";
  const requestOrigin = request?.headers.get("origin");
  const requestedHeaders = mergeRequestedHeaders(request);
  return {
    "Access-Control-Allow-Origin": resolveAllowOrigin(requestOrigin),
    "Access-Control-Allow-Headers": requestedHeaders,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    ...SECURITY_RESPONSE_HEADERS,
  };
};

export const corsHeaders = buildCorsHeaders();

export const json = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(request ? buildCorsHeaders(request) : corsHeaders),
      "Content-Type": "application/json",
    },
  });

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

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
