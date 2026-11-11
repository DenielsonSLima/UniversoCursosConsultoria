import { SignedXml } from 'npm:xml-crypto@6.4.0';
import { pilotFixture } from './pilot-fixtures.ts';
import type { NationalDpsInput } from './dps.types.ts';
import type { CancellationInput } from './events.ts';
import type { ProductionDependencies } from './production.types.ts';

/** Offline-only fixtures. No real partner, CNPJ or tax assumption is represented. */
export function productionFixture(): NationalDpsInput {
  const input = pilotFixture();
  return { ...input, environment: 'PRODUCAO', series: '49998',
    issuer: { ...input.issuer, simpleNationalOption: '3', simpleNationalAssessment: '1' },
    service: { ...input.service, nationalTaxCode: '080201', complementaryInfo: 'Complemento sintetico offline' },
    review: { ...input.review, ibscbs: 'NOT_APPLICABLE_CONFIRMED' } };
}

export function cancellationFixture(accessKey: string, eventCode: '101101' | '101103' = '101101'): CancellationInput {
  return { environment: 'PRODUCAO', accessKey, applicationVersion: 'TEST_OFFLINE',
    occurredAt: '2026-11-10T15:00:00-03:00', author: { type: 'CNPJ', value: '00000000000000' },
    eventCode, reasonCode: '1', reason: 'Valor informado incorretamente no documento sintetico offline' };
}

export async function withProductionTestCertificate(run: (credential: ProductionDependencies['credential']) => Promise<void>) {
  const path = await Deno.makeTempDir({ dir: '/tmp', prefix: 'nfse-production-offline-' });
  try {
    const generated = await new Deno.Command('openssl', { args: ['req', '-x509', '-newkey', 'rsa:2048',
      '-nodes', '-days', '1', '-subj', '/CN=NFSE-OFFLINE-ONLY', '-keyout', `${path}/key.pem`,
      '-out', `${path}/cert.pem`], stdout: 'null', stderr: 'piped' }).output();
    if (!generated.success) throw new Error('Synthetic certificate generation failed');
    await run({ privateKeyPem: await Deno.readTextFile(`${path}/key.pem`),
      certificatePem: await Deno.readTextFile(`${path}/cert.pem`) });
  } finally { await Deno.remove(path, { recursive: true }); }
}

export function syntheticProductionEvent(request: string, accessKey: string, eventCode: string,
  credential: ProductionDependencies['credential']): string {
  const body = request.replace(/^<\?xml[^?]*\?>/, '');
  const xml = `<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infEvento Id="EVT${accessKey}${eventCode}001"><verAplic>TEST_OFFLINE</verAplic><ambGer>2</ambGer>` +
    '<nSeqEvento>001</nSeqEvento><dhProc>2026-11-10T15:00:01-03:00</dhProc><nDFSe>1</nDFSe>' +
    `${body}</infEvento></evento>`;
  const signer = new SignedXml({ privateKey: credential.privateKeyPem, publicCert: credential.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' });
  signer.addReference({ xpath: "//*[local-name()='infEvento']", digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'] });
  signer.computeSignature(xml, { location: { reference: "//*[local-name()='infEvento']", action: 'after' } });
  return signer.getSignedXml();
}
