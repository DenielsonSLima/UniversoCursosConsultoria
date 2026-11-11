import { parsePublicSpec, publicObject, sanitizeMunicipalParameters, summarizePublicSpec } from './public-contract.ts';
import { createPreflightTransport, safeTransportCode } from './transport.ts';
import type { PreflightCheck, PreflightIntent, PreflightMaterial, PreflightTransport, PublicProbeResponse } from './types.ts';

const sefin = 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional';
const municipal = 'https://adn.producaorestrita.nfse.gov.br/parametrizacao';
const discovery = [
  { code: 'SEFIN_SWAGGER2', url: `${sefin}/swagger/docs/v1`, kind: 'SEFIN' },
  { code: 'SEFIN_OPENAPI', url: `${sefin}/swagger/v1/swagger.json`, kind: 'SEFIN' },
  { code: 'MUNICIPAL_SWAGGER2', url: `${municipal}/swagger/docs/v1`, kind: 'MUNICIPAL' },
  { code: 'MUNICIPAL_OPENAPI', url: `${municipal}/swagger/v1/swagger.json`, kind: 'MUNICIPAL' },
] as const;

export function municipalRoutes(spec: Record<string, unknown>, material: PreflightMaterial, intent: PreflightIntent) {
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const routes: { code: string; url: string }[] = [];
  const location = summarizePublicSpec(spec);
  const bases = [...location.servers.map(server => server.url), ...(location.basePath ? [location.basePath] : [])]
    .map(value => new URL(value, 'https://adn.producaorestrita.nfse.gov.br'))
    .filter(url => url.origin === 'https://adn.producaorestrita.nfse.gov.br' &&
      /^\/parametrizacao(?:\/ParametrosMunicipais)?\/?$/i.test(url.pathname));
  const serviceBases = bases.length ? bases : [new URL(municipal)];
  for (const [path, operations] of Object.entries(paths)) {
    if (!operations || typeof operations !== 'object' || !operations.get) continue;
    let route = path;
    route = route.replace(/\{(?:codigoMunicipio|codMunicipio|municipio|cLocEmi)\}/gi, material.issuer.municipalityCode);
    if (intent.serviceCode) route = route.replace(/\{(?:codigoServico|codServico|cTribNac)\}/gi, intent.serviceCode);
    route = route.replace(/\{(?:competencia|dataCompetencia)\}/gi, intent.referenceDate);
    if (/[{}]/.test(route)) continue;
    const operation = operations.get as Record<string, unknown>;
    const parameters = [...(Array.isArray(operations.parameters) ? operations.parameters : []),
      ...(Array.isArray(operation.parameters) ? operation.parameters : [])];
    const unsupportedRequired = parameters.some((parameter) => {
      const p = parameter as Record<string, unknown>;
      return p.required === true && p.in === 'query' && !/^(dataCompetencia|dataInicial|dataFinal)$/i.test(String(p.name));
    });
    if (unsupportedRequired) continue;
    for (const base of serviceBases) {
      const pathname = route.startsWith('/parametrizacao/') ? route : base.pathname.replace(/\/$/, '') + route;
      // The spec can choose a public prefix only; never a host, path traversal or arbitrary route.
      if (!/^\/parametrizacao\/(?:ParametrosMunicipais\/)?[0-9]{7}(?:\/[0-9]{6})?(?:\/20[0-9]{2}-[0-9]{2}-[0-9]{2})?\/(?:convenio|aliquota|aliquotas|retencoes|beneficiomunicipal|regimes_especiais|regimesespeciais|parametros)$/i.test(pathname)) continue;
      const url = new URL(pathname, base.origin);
      for (const parameter of parameters) {
        const p = parameter as Record<string, unknown>;
        if (p.in === 'query' && /^(dataCompetencia|dataInicial|dataFinal)$/i.test(String(p.name))) {
          url.searchParams.set(String(p.name), intent.referenceDate);
        }
      }
      routes.push({ code: 'MUNICIPAL_' + url.pathname.split('/').pop()!.toUpperCase(), url: url.href });
    }
  }
  return routes.slice(0, 8);
}

/** Uses only GET on restricted-namespace endpoints. A successful probe never enables emission. */
export async function runPreflight(material: PreflightMaterial,
  options: { intent?: PreflightIntent; transport?: PreflightTransport; now?: () => Date } = {}) {
  if (material.environment !== 'HOMOLOGACAO' || !/^\d{7}$/.test(material.issuer.municipalityCode)) {
    throw new Error('PREFLIGHT_SCOPE_DENIED');
  }
  const intent = options.intent || { scope: material, referenceDate: `${material.month}-01` };
  const transport = options.transport || createPreflightTransport(material.material);
  const endpoints: { code: string; url: string; status: number | null; tlsVerified: boolean; error: string | null }[] = [];
  const read = async (endpoint: { code: string; url: string }): Promise<PublicProbeResponse | null> => {
    try {
      const response = await transport.get(endpoint.url);
      endpoints.push({ ...endpoint, status: response.status, tlsVerified: response.tlsVerified, error: null });
      return response;
    } catch (error) {
      endpoints.push({ ...endpoint, status: null, tlsVerified: false, error: safeTransportCode(error) });
      return null;
    }
  };
  try {
    const results = await Promise.all(discovery.map(async (endpoint) => ({ endpoint, response: await read(endpoint) })));
    const contracts: { kind: string; url: string; summary: ReturnType<typeof summarizePublicSpec> }[] = [];
    const municipalSpecs: Record<string, unknown>[] = [];
    for (const { endpoint, response } of results) {
      const spec = response?.status === 200 ? parsePublicSpec(response.body) : null;
      if (!spec) continue;
      contracts.push({ kind: endpoint.kind, url: endpoint.url, summary: summarizePublicSpec(spec) });
      if (endpoint.kind === 'MUNICIPAL') municipalSpecs.push(spec);
    }
    const routes = municipalSpecs.flatMap((spec) => municipalRoutes(spec, material, intent));
    if (!routes.some((route) => route.code === 'MUNICIPAL_CONVENIO')) routes.push({ code: 'MUNICIPAL_CONVENIO',
      url: `${municipal}/${material.issuer.municipalityCode}/convenio` });
    const uniqueRoutes = [...new Map(routes.map((route) => [route.url, route])).values()];
    const municipalParameters = await Promise.all(uniqueRoutes.map(async (route) => {
      const response = await read(route);
      const payload = response?.status === 200 ? publicObject(response.body) : null;
      return { code: route.code, url: route.url, status: response?.status || null,
        diagnostic: !response ? 'CONNECTION_UNCONFIRMED' : response.status === 404 ? 'NOT_FOUND_UNCLASSIFIED'
          : response.status !== 200 ? 'HTTP_ERROR' : payload ? 'PUBLIC_PARAMETERS_RETURNED' : 'NON_JSON_RESPONSE',
        parameters: payload ? sanitizeMunicipalParameters(payload) : null };
    }));
    const sefinTls = endpoints.some((endpoint) => endpoint.code.startsWith('SEFIN') && endpoint.tlsVerified);
    const municipalData = municipalParameters.some((result) => result.parameters !== null);
    const checks: PreflightCheck[] = [
      { code: 'CERTIFICATE_VALID', status: 'PASSED', message: 'A1 da matriz vigente e vinculado ao estabelecimento.' },
      { code: 'SEFIN_CONNECTION', status: sefinTls ? 'PASSED' : 'BLOCKED',
        message: sefinTls ? 'Conexão TLS verificada com A1 configurado no ambiente de homologação.' : 'Não foi possível comprovar a conexão TLS com a SEFIN de homologação.' },
      { code: 'SEFIN_CONTRACT', status: contracts.some((contract) => contract.kind === 'SEFIN') ? 'PASSED' : 'BLOCKED',
        message: contracts.some((contract) => contract.kind === 'SEFIN') ? 'Contrato público da API consultado com o A1.' : 'Contrato público da API ainda indisponível na consulta com A1.' },
      { code: 'MUNICIPALITY_PARAMETERS', status: municipalData ? 'PASSED' : 'UNKNOWN',
        message: municipalData ? 'Parâmetros municipais retornados; a elegibilidade depende das regras e datas do serviço.' : 'Parametrização municipal ainda não comprovada no ambiente.' },
      { code: 'REPRESENTATION', status: 'UNKNOWN', message: 'A conexão técnica não comprova autorização fiscal para emitir.' },
      { code: 'REVOCATION_STATUS', status: 'UNKNOWN', message: 'O sistema não possui uma prova própria atualizada de CRL/OCSP.' },
      { code: 'PRODUCTION', status: 'BLOCKED', message: 'Este teste não acessa nem habilita produção.' },
    ];
    return { checkedAt: (options.now || (() => new Date()))().toISOString(), environment: 'HOMOLOGACAO' as const,
      referenceDate: intent.referenceDate, checks, pilot: { available: false, reason: 'PILOT_EXECUTOR_NOT_CONFIGURED' as string | null },
      certificateExpiresAt: material.certificate.expiresAt, endpoints, contracts, municipalParameters };
  } finally { transport.close(); }
}
