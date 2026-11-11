type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value !== null && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonObject : null;
const identifier = /^[A-Za-z0-9_.{}/$-]{1,180}$/;
const privateKey = /cnpj|cpf|inscri[cç]|nome|razao|endere|logradouro|email|telefone|chave|token|senha|secret|cert|pem|xml/i;
const publicOrigins = new Set(['https://adn.producaorestrita.nfse.gov.br',
  'https://sefin.producaorestrita.nfse.gov.br']);

/** Public static metadata only. Consumers must separately enforce their route allowlists. */
export function publicServiceLocation(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 240 || /[\\{}?#%]|(?:^|\/)\.{1,2}(?:\/|$)/.test(value)) return null;
  const relative = value.startsWith('/') && !value.startsWith('//');
  let url: URL;
  try { url = new URL(value, 'https://adn.producaorestrita.nfse.gov.br'); } catch { return null; }
  if ((!relative && !/^https:\/\//.test(value)) || !publicOrigins.has(url.origin) || url.username || url.password ||
    !/^\/[A-Za-z0-9_./-]{0,180}$/.test(url.pathname) || /\d{11}/.test(url.pathname)) return null;
  return relative ? url.pathname : url.origin + url.pathname;
}

/** Only structural OpenAPI fields are returned; no examples or descriptions. */
function schema(value: unknown, depth = 0): unknown {
  const source = object(value);
  if (!source || depth > 5) return null;
  const result: JsonObject = {};
  for (const key of ['$ref', 'type', 'format', 'pattern']) {
    if (typeof source[key] === 'string' && source[key].length < 300) result[key] = source[key];
  }
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'nullable']) {
    if (typeof source[key] === 'number' || typeof source[key] === 'boolean') result[key] = source[key];
  }
  for (const key of ['required', 'enum']) {
    if (Array.isArray(source[key])) result[key] = source[key].filter((item) =>
      typeof item === 'number' || typeof item === 'boolean' ||
      (typeof item === 'string' && item.length <= 120)).slice(0, 80);
  }
  const properties = object(source.properties);
  if (properties) result.properties = Object.fromEntries(Object.entries(properties).slice(0, 100)
    .filter(([key]) => identifier.test(key)).map(([key, item]) => [key, schema(item, depth + 1)]));
  if (source.items) result.items = schema(source.items, depth + 1);
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(source[key])) result[key] = source[key].slice(0, 12).map((item) => schema(item, depth + 1));
  }
  return result;
}

export function parsePublicSpec(body: string): JsonObject | null {
  try {
    const parsed = object(JSON.parse(body));
    return parsed && (typeof parsed.swagger === 'string' || typeof parsed.openapi === 'string')
      && object(parsed.paths) ? parsed : null;
  } catch { return null; }
}

export function summarizePublicSpec(spec: JsonObject) {
  const paths = object(spec.paths) || {};
  const pathsSummary = Object.entries(paths).slice(0, 100).filter(([path]) => identifier.test(path))
    .map(([path, definition]) => ({ path, operations: Object.entries(object(definition) || {})
      .filter(([method]) => ['get', 'head', 'post', 'put', 'delete', 'patch'].includes(method))
      .map(([method, operation]) => {
        const op = object(operation) || {};
        const body = object(op.requestBody);
        const content = object(body?.content);
        return { method: method.toUpperCase(), parameters: Array.isArray(op.parameters)
          ? op.parameters.slice(0, 30).map((parameter) => {
            const p = object(parameter) || {};
            return { name: typeof p.name === 'string' && identifier.test(p.name) ? p.name : null,
              in: p.in, required: p.required === true, schema: schema(p.schema || p) };
          }) : [],
          requestBody: content ? Object.fromEntries(Object.entries(content).slice(0, 8)
            .map(([type, entry]) => [type, schema(object(entry)?.schema)])) : null,
        };
      }) }));
  const definitions = object(spec.definitions) || object(object(spec.components)?.schemas) || {};
  const schemas = Object.fromEntries(Object.entries(definitions).slice(0, 100)
    .filter(([name]) => identifier.test(name)).map(([name, definition]) => [name, schema(definition)]));
  const bytes = JSON.stringify(spec);
  const algorithms = [...new Set(bytes.match(/https?:\/\/[^\s"<>]*?(?:rsa-sha(?:1|256)|sha(?:1|256)|xml-exc-c14n#|REC-xml-c14n-20010315)/g) || [])];
  const servers = Array.isArray(spec.servers) ? spec.servers.slice(0, 8).flatMap(server => {
    const url = publicServiceLocation(object(server)?.url);
    return url ? [{ url }] : [];
  }) : [];
  const basePath = publicServiceLocation(spec.basePath);
  const host = typeof spec.host === 'string' && ['adn.producaorestrita.nfse.gov.br',
    'sefin.producaorestrita.nfse.gov.br'].includes(spec.host) ? spec.host : null;
  return { version: spec.openapi || spec.swagger, servers, basePath, host, paths: pathsSummary, schemas,
    signatureAlgorithmReferences: algorithms.slice(0, 12) };
}

/** Municipality parameters are public flags/codes. Identity and free text are discarded. */
export function sanitizeMunicipalParameters(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeMunicipalParameters(item, depth + 1));
  const source = object(value);
  if (!source) return null;
  return Object.fromEntries(Object.entries(source).slice(0, 100).filter(([key]) =>
    /^[\p{L}\p{N}_-]{1,80}$/u.test(key) && !privateKey.test(key)).flatMap(([key, item]) => {
    if (typeof item === 'string') {
      if (/\d{11}/.test(item)) return [];
      const date = /^\d{4}-\d{2}-\d{2}(?:T[0-9:.+Z-]{1,24})?$/.test(item);
      const code = /^(codigo|code|status|ambiente|situacao|tipo|regime)/i.test(key)
        && /^[\p{L}\p{N}_ ./-]{1,60}$/u.test(item);
      return date || code ? [[key, item]] : [];
    }
    const clean = sanitizeMunicipalParameters(item, depth + 1);
    return clean === null ? [] : [[key, clean]];
  }));
}

export function publicObject(body: string): JsonObject | null {
  try { return object(JSON.parse(body)); } catch { return null; }
}
