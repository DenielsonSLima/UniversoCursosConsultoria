import assert from 'node:assert/strict';
import { syntheticPilotScenario } from './scenario.ts';
import { buildNationalDps } from '../_shared/nfse-national/dps.ts';
import type { PreflightMaterial } from '../nfse-national-preflight/types.ts';
const material: PreflightMaterial = {
  actorId: '00000000-0000-0000-0000-000000000001', contextKey: '00000000-0000-0000-0000-000000000002',
  poloId: '00000000-0000-0000-0000-000000000003', environment: 'HOMOLOGACAO', month: '2026-11', configurationVersion: 3,
  issuer: { cnpj: '00000000000100', municipalityCode: '2803401', municipalRegistration: 'IM-SINTETICA', opSimpNac: '3', regEspTrib: '0', regApTribSN: '1' },
  certificate: { notBefore: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', fingerprint: 'a'.repeat(64) },
  material: { certificatePem: 'CERTIFICATE_SENTINEL', privateKeyPem: 'KEY_SENTINEL', chainPem: 'CHAIN_SENTINEL' },
};
Deno.test('server-owned partner snapshot changes only recipient and preview provenance in isolated R$1 test', () => {
  const now = new Date('2026-11-10T01:00:00Z');
  const partner = { partnerId: '00000000-0000-0000-0000-000000000004', name: 'PARCEIRO SINTÉTICO', document: '00000000000' };
  const old = syntheticPilotScenario(material, now), next = syntheticPilotScenario(material, now, partner);
  if (!('synthetic' in old.preview)) throw new Error('Expected legacy preview');
  if (!('technicalTest' in next.preview)) throw new Error('Expected partner preview');
  assert.equal(old.preview.synthetic, true); assert.equal(old.fiscalInput.recipient.taxId.value, material.issuer.cnpj);
  assert.equal('synthetic' in next.preview, false); assert.equal(next.preview.technicalTest, true);
  assert.equal(next.preview.recipientSource, 'PARTNER'); assert.equal(next.preview.recipientPartnerId, partner.partnerId);
  assert.deepEqual(next.fiscalInput.recipient, { taxId: { type: 'CPF', value: partner.document }, name: partner.name });
  assert.equal(next.fiscalInput.competence, '2026-11-09'); assert.equal(next.fiscalInput.values.serviceAmount, '1.00');
  assert.deepEqual(next.fiscalInput.issuer, old.fiscalInput.issuer); assert.deepEqual(next.fiscalInput.service, old.fiscalInput.service);
  assert(!/CERTIFICATE_SENTINEL|KEY_SENTINEL|CHAIN_SENTINEL/.test(JSON.stringify(next)));
  assert.equal(next.fiscalInput.recipient.address, undefined); assert.equal(next.fiscalInput.recipient.phone, undefined);
  const xml = buildNationalDps(next.fiscalInput).xml;
  assert(xml.includes(`<toma><CPF>${partner.document}</CPF><xNome>${partner.name}</xNome></toma>`));
  for (const change of [{ partnerId: 'bad' }, { document: 'bad' }, { name: '' }, { name: 'X'.repeat(151) }]) {
    assert.throws(() => syntheticPilotScenario(material, now, { ...partner, ...change }), /PILOT_RECIPIENT_UNAVAILABLE/);
  }
});
