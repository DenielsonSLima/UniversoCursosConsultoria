export interface HealthScope { contextKey: string; poloId: string; environment: 'PRODUCAO'; month: string }
export interface HealthObservation {
  state: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  reason: 'NATIONAL_QUERY_OK' | 'NATIONAL_QUERY_ERROR' | 'NO_REFERENCE' | 'VERIFICATION_UNCONFIRMED';
  checkedAt: string;
  expiresAt: string;
}
interface Reference { dpsId: string; accessKey: string; issuerCnpj: string }
interface Material extends HealthScope {
  actorId: string;
  issuer: { cnpj: string };
  certificate: { notBefore: string; expiresAt: string };
  material: { certificatePem: string; chainPem: string; privateKeyPem: string };
}
export interface HealthDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  transport(config: unknown, credential: Material['material']): {
    request(method: 'GET', path: string): Promise<{ status: number; body: Uint8Array }>;
    close(): void;
  };
  now?: () => number;
}

/** One read of an existing own DPS. A successful consultation is not permission to issue. */
export async function probeNationalHealth(scope: HealthScope, actor: string,
  deps: HealthDependencies): Promise<HealthObservation> {
  const now = deps.now || Date.now;
  const observation = (state: HealthObservation['state'], reason: HealthObservation['reason']) => {
    const checked = now();
    return { state, reason, checkedAt: new Date(checked).toISOString(), expiresAt: new Date(checked + 60_000).toISOString() };
  };
  const unknown = () => observation('UNKNOWN', 'VERIFICATION_UNCONFIRMED');
  const args = { p_actor_id: actor, p_context_key: scope.contextKey, p_polo_id: scope.poloId,
    p_environment: scope.environment, p_month: scope.month };
  let transport: ReturnType<HealthDependencies['transport']> | undefined;
  try {
    if (scope.environment !== 'PRODUCAO') return unknown();
    const result = await deps.rpc('get_nfse_health_reference_internal', args) as { reference: Reference | null };
    if (!result || !Object.hasOwn(result, 'reference')) return unknown();
    if (result.reference === null) return observation('UNKNOWN', 'NO_REFERENCE');
    const reference = result.reference;
    if (!/^DPS\d{42}$/.test(reference.dpsId) || !/^\d{50}$/.test(reference.accessKey)
      || !/^\d{14}$/.test(reference.issuerCnpj)) return unknown();
    const material = await deps.rpc('get_nfse_production_material_internal', args) as Material;
    if (!material || material.actorId !== actor || Object.entries(scope).some(([key, value]) =>
      material[key as keyof Material] !== value) || material.issuer.cnpj !== reference.issuerCnpj
      || !Number.isFinite(Date.parse(material.certificate.notBefore))
      || !Number.isFinite(Date.parse(material.certificate.expiresAt))
      || Date.parse(material.certificate.notBefore) > now()
      || Date.parse(material.certificate.expiresAt) <= now()) return unknown();
    const config = await deps.rpc('get_nfse_production_relay_config_internal', args);
    transport = deps.transport(config, material.material);
    const response = await transport.request('GET', `/dps/${reference.dpsId}`);
    if (response.status >= 500 && response.status <= 599) return observation('UNAVAILABLE', 'NATIONAL_QUERY_ERROR');
    // 401/403/404/429 and network/relay failures cannot establish a government outage.
    if (response.status !== 200 || response.body.byteLength > 65_536) return unknown();
    const body = JSON.parse(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(response.body));
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.tipoAmbiente !== 1
      || body.chaveAcesso !== reference.accessKey || Object.hasOwn(body, 'erros')
      || ['idDps', 'idDPS'].some(key => Object.hasOwn(body, key) && body[key] !== reference.dpsId)) return unknown();
    return observation('AVAILABLE', 'NATIONAL_QUERY_OK');
  } catch {
    return unknown();
  } finally {
    transport?.close();
  }
}
