const PHOTO_BUCKET = 'fotos-perfil';
const PHOTO_MARKER = 'profile-photo://';
const PHOTO_FIELDS = new Set(['foto_url', 'photo_url', 'studentPhotoUrl', 'fotoUrl', 'foto']);
const PHOTO_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/perfil\/[a-z0-9][a-z0-9_.-]*$/i;
const TTL_SECONDS = 300;

export const profilePhotoReference = (path: string) => {
  if (!PHOTO_PATH.test(path)) throw new Error('Caminho de foto pessoal inválido.');
  return PHOTO_MARKER + path;
};

export const profilePhotoPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith(PHOTO_MARKER)) return null;
  const path = value.slice(PHOTO_MARKER.length);
  return PHOTO_PATH.test(path) ? path : null;
};

const signedPhotoReference = (value: unknown, origin: string) => {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    const prefixes = [`/storage/v1/object/sign/${PHOTO_BUCKET}/`, '/storage/v1/object/public/documentos/'];
    const prefix = prefixes.find(candidate => url.pathname.startsWith(candidate));
    if (url.origin !== origin || !prefix) return value;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return PHOTO_PATH.test(path) ? profilePhotoReference(path) : value;
  } catch {
    return value;
  }
};

const canonicalizeFields = (value: unknown, origin: string): unknown => {
  if (Array.isArray(value)) return value.map(item => canonicalizeFields(item, origin));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    PHOTO_FIELDS.has(key) ? signedPhotoReference(child, origin) : canonicalizeFields(child, origin),
  ]));
};

/**
 * Adapta somente referências dedicadas em campos de fotografia do PostgREST.
 * Não busca URLs externas nem mantém cache compartilhado entre usuários.
 * URLs temporárias são normalizadas antes de gravar cadastros/snapshots.
 */
export const createProfilePhotoFetch = (
  projectUrl: string,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch => {
  const project = new URL(projectUrl);
  return async (input, init) => {
    let request = new Request(input, init);
    const url = new URL(request.url);
    const rest = url.origin === project.origin && url.pathname.startsWith('/rest/v1/');
    if (!rest) return fetcher(request);

    let originalBody: Record<string, unknown> | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD'
      && request.headers.get('content-type')?.includes('application/json')) {
      try {
        const body = await request.clone().json();
        if (body && typeof body === 'object' && !Array.isArray(body)) originalBody = body;
        const normalized = JSON.stringify(canonicalizeFields(body, project.origin));
        const headers = new Headers(request.headers);
        headers.delete('content-length');
        request = new Request(request, { body: normalized, headers });
      } catch {
        // Deixa o servidor validar payloads que não sejam JSON válido.
      }
    }

    const response = await fetcher(request);
    const responseType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (!response.ok || request.method === 'HEAD'
      || !['application/json', 'application/vnd.pgrst.object+json'].includes(responseType || '')) return response;
    let data: unknown;
    try { data = await response.clone().json(); } catch { return response; }

    const code = url.pathname === '/rest/v1/rpc/validar_documento_por_codigo'
      && typeof originalBody?.p_codigo === 'string'
      ? originalBody.p_codigo.replace(/\s+/g, '').toUpperCase() : null;
    const result = data && !Array.isArray(data) && typeof data === 'object'
      ? data as Record<string, unknown> : null;
    const publicCode = code && result?.code === code && result.status === 'ACTIVE'
      && Array.isArray(result.visibleFields) && result.visibleFields.includes('studentPhotoUrl')
      ? code : null;
    const photoPath = (value: unknown) => profilePhotoPath(signedPhotoReference(value, project.origin));
    const paths = new Set<string>();
    const collect = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(collect); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        const path = PHOTO_FIELDS.has(key) ? photoPath(child) : null;
        if (path) paths.add(path); else collect(child);
      }
    };
    collect(data);
    if (!paths.size) return response;
    const urls = new Map<string, string | null>([...paths].map(path => [path, null]));
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const name of ['authorization', 'apikey']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const signedUrl = (value: unknown, path: string) => {
      if (typeof value !== 'string') return null;
      try {
        const target = new URL(value.startsWith('/object/') ? `/storage/v1${value}` : value, project);
        const prefix = `/storage/v1/object/sign/${PHOTO_BUCKET}/`;
        return target.origin === project.origin && target.pathname.startsWith(prefix)
          && decodeURIComponent(target.pathname.slice(prefix.length)) === path ? target.toString() : null;
      } catch { return null; }
    };
    if (publicCode) {
      // Uma validação pública autoriza exclusivamente a foto raiz da capability.
      const path = photoPath(result?.studentPhotoUrl);
      if (path) {
        try {
          const signed = await fetcher(new URL('/functions/v1/profile-photo-access', project), {
            method: 'POST', headers, body: JSON.stringify({ code: publicCode, path }), signal: request.signal,
          });
          if (signed.ok) {
            const payload = await signed.json();
            urls.set(path, signedUrl(payload?.signedURL || payload?.signedUrl, path));
          }
        } catch { /* Referência indisponível permanece oculta. */ }
      }
    } else {
      // A API em lote aplica a mesma RLS por objeto, sem N+1 de chamadas.
      const allPaths = [...paths];
      for (let offset = 0; offset < allPaths.length; offset += 100) {
        const batch = allPaths.slice(offset, offset + 100);
        try {
          const signed = await fetcher(new URL(`/storage/v1/object/sign/${PHOTO_BUCKET}`, project), {
            method: 'POST', headers, body: JSON.stringify({ expiresIn: TTL_SECONDS, paths: batch }), signal: request.signal,
          });
          if (!signed.ok) continue;
          const payload = await signed.json();
          if (!Array.isArray(payload)) continue;
          for (const item of payload) {
            if (!item?.error && typeof item?.path === 'string' && batch.includes(item.path)) {
              urls.set(item.path, signedUrl(item.signedURL || item.signedUrl, item.path));
            }
          }
        } catch { /* Falhas de um lote não expõem caminhos nem impedem os demais. */ }
      }
    }
    const hydrate = async (value: unknown): Promise<unknown> => {
      if (Array.isArray(value)) return Promise.all(value.map(hydrate));
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => {
        const path = PHOTO_FIELDS.has(key) ? photoPath(child) : null;
        if (path) return [key, urls.get(path) || null];
        return [key, await hydrate(child)];
      })));
    };
    const hydrated = await hydrate(data);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-length'); responseHeaders.delete('content-encoding');
    return new Response(JSON.stringify(hydrated), { status: response.status, statusText: response.statusText, headers: responseHeaders });
  };
};
