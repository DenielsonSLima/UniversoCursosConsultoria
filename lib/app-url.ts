const PRODUCTION_SITE_ORIGIN = 'https://universocc.com.br';

const configuredSiteOrigin = () => {
  const rawValue = String(import.meta.env.VITE_PUBLIC_SITE_URL || PRODUCTION_SITE_ORIGIN).trim();
  try {
    return new URL(rawValue).origin;
  } catch {
    return PRODUCTION_SITE_ORIGIN;
  }
};

export const getAuthRedirectOrigin = () => {
  if (typeof window === 'undefined') return configuredSiteOrigin();
  if (import.meta.env.PROD) return configuredSiteOrigin();

  const hostname = window.location.hostname.toLowerCase();
  const isLocalDevHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  return !isLocalDevHost ? configuredSiteOrigin() : window.location.origin;
};

export const buildAuthRedirectUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAuthRedirectOrigin()}${normalizedPath}`;
};
