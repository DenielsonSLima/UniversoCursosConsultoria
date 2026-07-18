import type { PublicApiKeyResolution } from "./types.ts";

const SUPABASE_PUBLIC_KEY_ENV_NAMES = [
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
];

const EXPLICIT_REDIRECT_ORIGIN_ENV_NAMES = [
  "PORTAL_ALLOWED_REDIRECT_ORIGINS",
  "ALLOWED_REDIRECT_ORIGINS",
];

const PUBLIC_SITE_URL_ENV_NAMES = [
  "PUBLIC_SITE_URL",
  "SITE_URL",
  "APP_URL",
  "VITE_PUBLIC_SITE_URL",
];

const DEFAULT_ALLOWED_REDIRECT_ORIGINS = [
  "https://universocc.com.br",
];

const normalizeEnvValue = (value?: string | null) => String(value || "").trim();

const normalizeRedirectInput = (value?: string | null) =>
  String(value || "").trim();

export const resolveSupabasePublicApiKey = (
  serviceRoleKey?: string | null,
): PublicApiKeyResolution => {
  const serviceKey = normalizeEnvValue(serviceRoleKey);
  const apiKey = SUPABASE_PUBLIC_KEY_ENV_NAMES
    .map((name) => normalizeEnvValue(Deno.env.get(name)))
    .find((value) => value.length > 0) || null;

  if (!apiKey) {
    return {
      apiKey: null,
      message:
        "Configuração de e-mail ausente no servidor (SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY).",
    };
  }

  if (serviceKey && apiKey === serviceKey) {
    return {
      apiKey: null,
      message:
        "Configuração insegura: a chave pública do Supabase não pode ser a service role key.",
    };
  }

  return { apiKey, message: null };
};

const parseOrigin = (value?: string | null) => {
  try {
    const url = new URL(normalizeEnvValue(value));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

const parseOriginList = (value?: string | null) =>
  normalizeEnvValue(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const getAllowedRedirectOrigins = () => {
  const origins = new Set<string>();

  for (const value of DEFAULT_ALLOWED_REDIRECT_ORIGINS) {
    const origin = parseOrigin(value);
    if (origin) origins.add(origin);
  }

  for (const envName of EXPLICIT_REDIRECT_ORIGIN_ENV_NAMES) {
    for (const value of parseOriginList(Deno.env.get(envName))) {
      const origin = parseOrigin(value);
      if (origin) origins.add(origin);
    }
  }

  for (const envName of PUBLIC_SITE_URL_ENV_NAMES) {
    const origin = parseOrigin(Deno.env.get(envName));
    if (origin) origins.add(origin);
  }

  return Array.from(origins);
};

export const resolveRedirectTarget = (value?: string | null) => {
  const allowedOrigins = getAllowedRedirectOrigins();
  if (allowedOrigins.length === 0) {
    return {
      redirectTo: null,
      status: 500,
      error:
        "Configuração de redirecionamento ausente. Defina PORTAL_ALLOWED_REDIRECT_ORIGINS ou PUBLIC_SITE_URL.",
    };
  }

  try {
    const fallbackOrigin = allowedOrigins[0];
    const rawRedirect = normalizeRedirectInput(value) || "/login";
    const parsed = new URL(rawRedirect, fallbackOrigin);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { redirectTo: null, status: 400, error: "redirectTo inválido." };
    }

    if (!allowedOrigins.includes(parsed.origin)) {
      return {
        redirectTo: null,
        status: 400,
        error: "Origem de redirectTo não permitida.",
      };
    }

    return { redirectTo: parsed.toString(), status: 200, error: null };
  } catch {
    return { redirectTo: null, status: 400, error: "redirectTo inválido." };
  }
};
