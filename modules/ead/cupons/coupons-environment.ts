export interface EadCouponsEnvironment {
  dev: boolean;
  enabled: unknown;
  supabaseUrl: unknown;
  frontendHostname?: string;
  frontendProtocol?: string;
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const officialHosts = new Set([
  'universocc.com.br', 'www.universocc.com.br', 'universo-cursos-consultoria.vercel.app',
]);
const authorizedPreview = /^universo-cursos-consultoria-[a-z0-9]+(?:-[a-z0-9]+)*-denielson-limas-projects\.vercel\.app$/;
const officialSupabaseOrigin = 'https://kfekgwyqozhicpfuunpo.supabase.co';

/** O destino libera apenas o transporte; a RPC de capacidade controla a disponibilidade. */
export const evaluateEadCouponsEnvironment = (environment: EadCouponsEnvironment): boolean => {
  if (typeof environment.supabaseUrl !== 'string') return false;
  try {
    const endpoint = new URL(environment.supabaseUrl);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || endpoint.pathname !== '/') return false;
    if (environment.dev === true) {
      return environment.enabled === 'true' && loopbackHosts.has(endpoint.hostname)
        && (environment.frontendHostname === undefined || loopbackHosts.has(environment.frontendHostname));
    }
    return environment.dev === false && environment.enabled !== 'false'
      && environment.frontendProtocol === 'https:' && endpoint.origin === officialSupabaseOrigin
      && typeof environment.frontendHostname === 'string'
      && (officialHosts.has(environment.frontendHostname) || authorizedPreview.test(environment.frontendHostname));
  } catch {
    return false;
  }
};

export const isEadCouponsEnvironmentAllowed = (): boolean => evaluateEadCouponsEnvironment({
  dev: import.meta.env?.DEV === true,
  enabled: import.meta.env?.VITE_EAD_COUPONS_ENABLED,
  supabaseUrl: import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.REACT_APP_SUPABASE_URL,
  frontendHostname: typeof window === 'undefined' ? undefined : window.location.hostname,
  frontendProtocol: typeof window === 'undefined' ? undefined : window.location.protocol,
});

export const assertEadCouponsEnvironment = (): void => {
  if (!isEadCouponsEnvironmentAllowed()) {
    throw new Error('Os cupons EAD não estão disponíveis neste ambiente.');
  }
};
