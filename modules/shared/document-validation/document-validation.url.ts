const DEFAULT_PUBLIC_SITE_URL = "https://universocc.com.br";

type PublicSiteImportMeta = ImportMeta & {
  env?: {
    VITE_PUBLIC_SITE_URL?: unknown;
  };
};

const getConfiguredPublicSiteUrl = () => (
  (import.meta as PublicSiteImportMeta).env?.VITE_PUBLIC_SITE_URL
);

const isPrivateOrLocalHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) ||
    normalized.includes(":");
};

export const resolveDocumentValidationPublicSiteUrl = (
  configuredUrl: unknown,
): string => {
  if (typeof configuredUrl !== "string" || !configuredUrl.trim()) {
    return DEFAULT_PUBLIC_SITE_URL;
  }

  try {
    const url = new URL(configuredUrl.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      isPrivateOrLocalHostname(url.hostname)
    ) {
      return DEFAULT_PUBLIC_SITE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
};

export const getDocumentValidationBaseUrl = () => {
  const publicSiteUrl = resolveDocumentValidationPublicSiteUrl(
    getConfiguredPublicSiteUrl(),
  );
  return `${publicSiteUrl}/validador`;
};

export const getDocumentValidationUrl = (code: string) =>
  `${getDocumentValidationBaseUrl()}?code=${encodeURIComponent(code)}`;

interface DocumentValidationDisplayUrlOptions {
  includeSearch?: boolean;
}

/**
 * Formata a URL canônica somente para leitura humana no documento.
 * O QR e os links continuam usando a URL HTTPS original.
 */
export const formatDocumentValidationUrlForDisplay = (
  value: string,
  options: DocumentValidationDisplayUrlOptions = {},
) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    isPrivateOrLocalHostname(url.hostname)
  ) {
    throw new Error("A URL de validação pública não é segura para exibição.");
  }

  const normalizedHostname = url.hostname.toLowerCase();
  const displayHostname = normalizedHostname === "universocc.com.br"
    ? "www.universocc.com.br"
    : normalizedHostname;
  const search = options.includeSearch === false ? "" : url.search;
  return `${displayHostname}${
    url.port ? `:${url.port}` : ""
  }${url.pathname}${search}`;
};
