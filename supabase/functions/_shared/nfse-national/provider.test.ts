import { buildNationalDps } from './dps.ts';
import { TextDecoder } from 'node:util';
import type { NationalDpsInput } from './dps.types.ts';
import { buildNationalCancellation, projectCancellationState } from './events.ts';
import { assertNationalLiveContract, nationalRoute, prepareNationalSignedXml } from './provider.ts';
import { signNationalXml, verifyNationalXml } from './signature.ts';
import { createNationalMtlsTransport } from './mtls.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
function throws(fn: () => unknown, code: string) {
  let caught: unknown;
  try { fn(); } catch (error) { caught = error; }
  assert(caught instanceof Error && caught.message === code, `Expected ${code}`);
}
function fixture(): NationalDpsInput {
  return {
    environment: 'HOMOLOGACAO', purpose: 'REGULAR', issuedAt: '2026-11-08T12:00:00-03:00', applicationVersion: 'Universo_TESTE_1',
    series: '1', number: '123', competence: '2026-10-15', issuerMunicipalityCode: '2802908',
    issuer: { taxId: { type: 'CNPJ', value: '00000000000000' }, simpleNationalOption: '3',
      simpleNationalAssessment: '1', specialTaxRegime: '0' },
    recipient: { taxId: { type: 'CPF', value: '00000000000' }, name: 'Tomador Sintetico',
      address: { municipalityCode: '2802908', postalCode: '00000000', street: 'Rua Teste',
        number: '1', district: 'Centro' } },
    service: { municipalityCode: '2802908', nationalTaxCode: '080201',
      description: 'Servico sintetico & verificacao <XML>' },
    values: { serviceAmount: '123.45', receivedAmount: '123.45', issTaxation: '1', issRetention: '1',
      totalTaxes: { mode: 'SIMPLE_NATIONAL_PERCENTAGE', percentage: '6.00' } },
    review: { recipientConfirmed: true, competenceConfirmed: true, classificationConfirmed: true,
      ibscbs: 'NOT_APPLICABLE_CONFIRMED', federalRetentions: 'NONE_CONFIRMED',
      deductionsAndDiscounts: 'NONE_CONFIRMED' },
  };
}

async function command(cmd: string, args: string[]) {
  const result = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' }).output();
  assert(result.success, `${cmd}: ${new TextDecoder().decode(result.stderr)}`);
}

async function validate(xml: string, schema: string, environment = 'HOMOLOGACAO') {
  const schemaDir = new URL(environment === 'HOMOLOGACAO' ? './schemas/prodrest-20261020/' :
    './schemas/1.01/', import.meta.url).pathname;
  const path = await Deno.makeTempFile({ dir: '/tmp', suffix: '.xml' });
  try {
    await Deno.writeTextFile(path, xml);
    await command('xmllint', ['--nonet', '--noout', '--schema', `${schemaDir}${schema}`, path]);
  } finally { await Deno.remove(path); }
}

Deno.test('DPS deterministica preserva competencia fiscal, decimais e identidades', () => {
  const input = fixture();
  const result = buildNationalDps(input);
  assert(result.referenceId === 'DPS280290820000000000000000001000000000000123');
  assert(result.xml.includes('<dCompet>2026-10-15</dCompet>'));
  assert(result.xml.includes('<vServ>123.45</vServ>'));
  assert(result.xml.includes('Servico sintetico &amp; verificacao &lt;XML&gt;'));
  assert(buildNationalDps(input).xml === result.xml);
});

Deno.test('DPS bloqueia dados fiscais nao revisados e campos desconhecidos', () => {
  const input = fixture();
  throws(() => buildNationalDps({ ...input, review: { ...input.review, competenceConfirmed: false } } as never),
    'FISCAL_REVIEW_REQUIRED');
  throws(() => buildNationalDps({ ...input, IBSCBS: {} } as never), 'UNSUPPORTED_FIELD');
  throws(() => buildNationalDps({ ...input, number: '0001' }), 'INVALID_DPS_NUMBER');
  throws(() => buildNationalDps({ ...input, competence: '2026-02-30' }), 'INVALID_DATE');
  throws(() => buildNationalDps({ ...input, values: { ...input.values, serviceAmount: '1e3' } }), 'INVALID_DECIMAL');
  throws(() => buildNationalDps({ ...input, values: { ...input.values, issTaxation: '3' } } as never),
    'UNSUPPORTED_ISS_SCENARIO');
  throws(() => buildNationalDps({ ...input, service: { ...input.service, additionalInformation: 'Nao descartar' } } as never),
    'UNSUPPORTED_FIELD');
});

Deno.test('imunidade explicitamente confirmada suporta tipos1a5 no XSD de homologacao', async () => {
  const input = fixture();
  for (const immunityType of ['1', '2', '3', '4', '5'] as const) {
    const doc = buildNationalDps({ ...input, values: { ...input.values, issTaxation: '2', immunityType } });
    assert(doc.xml.includes(`<tribISSQN>2</tribISSQN><tpImunidade>${immunityType}</tpImunidade>`));
    assert(!doc.xml.includes('<pAliq>'));
    await validate(doc.xml, 'DPS_v1.01.xsd');
  }
  const nonIncident = buildNationalDps({ ...input, values: { ...input.values, issTaxation: '4' } });
  await validate(nonIncident.xml, 'DPS_v1.01.xsd');
});

Deno.test('imunidade e nao incidencia rejeitam retencao, aliquota e regime especial incompatíveis', () => {
  const input = fixture();
  const immune = { ...input, values: { ...input.values, issTaxation: '2' as const, immunityType: '3' as const } };
  throws(() => buildNationalDps({ ...input, values: { ...input.values, issTaxation: '2' } }), 'E0592');
  throws(() => buildNationalDps({ ...input, values: { ...input.values, immunityType: '3' } }), 'E0592');
  throws(() => buildNationalDps({ ...immune, values: { ...immune.values, immunityType: '0' } } as never), 'E0592');
  for (const issTaxation of ['2', '4'] as const) {
    const values = { ...input.values, issTaxation, ...(issTaxation === '2' ? { immunityType: '3' as const } : {}) };
    throws(() => buildNationalDps({ ...input, values: { ...values, issRetention: '2' } }), 'E0580');
    throws(() => buildNationalDps({ ...input, values: { ...values, issRate: '0.00' } }), 'E0602');
    throws(() => buildNationalDps({ ...input, issuer: { ...input.issuer, specialTaxRegime: '1' }, values }), 'E0172');
  }
  throws(() => buildNationalDps({ ...input, values: { ...input.values, issRate: '5.01' } }), 'E0595');
  throws(() => buildNationalDps({ ...input, recipient: { ...input.recipient, address: undefined },
    values: { ...input.values, issRetention: '2' } }), 'E0237');
});

const syntheticAccessKey = `280290822${'0'.repeat(13)}12611${'0'.repeat(23)}`;

Deno.test('cancelamento e solicitacao possuem PRE e descricao oficiais distintos', async () => {
  for (const eventCode of ['101101', '101103'] as const) {
    const doc = buildNationalCancellation({ environment: 'HOMOLOGACAO', applicationVersion: 'Universo_TESTE_1',
      occurredAt: '2026-11-08T12:00:00-03:00', accessKey: syntheticAccessKey,
      author: { type: 'CNPJ', value: '0'.repeat(14) }, eventCode, reasonCode: '2',
      reason: 'Servico sintetico nao foi prestado' });
    assert(doc.referenceId === `PRE${syntheticAccessKey}${eventCode}`);
    assert(doc.referenceId.length === 59);
    await validate(doc.xml, 'pedRegEvento_v1.01.xsd');
  }
  throws(() => buildNationalCancellation({ eventCode: '105104' } as never), 'INVALID_ENVIRONMENT');
});

Deno.test('evento de solicitacao nao cancela; deferimento cancela; chave/ambiente divergentes falham', () => {
  const key = '0'.repeat(50);
  const event = (code: string) => ({ accessKey: key, environment: 'HOMOLOGACAO' as const,
    code, sequence: '001', id: `EVT${key}${code}001` });
  assert(projectCancellationState(key, 'HOMOLOGACAO', [event('101103')]) === 'AWAITING_ANALYSIS');
  assert(projectCancellationState(key, 'HOMOLOGACAO', [event('101103'), event('105104')]) === 'CANCELLED');
  assert(projectCancellationState(key, 'HOMOLOGACAO', [event('101103'), event('105105')]) === 'ANALYSIS_DENIED');
  assert(projectCancellationState(key, 'HOMOLOGACAO', [event('105102')]) === 'SUBSTITUTED');
  throws(() => projectCancellationState(key, 'PRODUCAO', [event('101101')]), 'EVENT_IDENTITY_MISMATCH');
});

Deno.test('assinatura XMLDSig real e verificacao rejeitam adulteracao e certificado diferente', async () => {
  const temp = await Deno.makeTempDir({ dir: '/tmp', prefix: 'nfse-synthetic-cert-' });
  try {
    for (const id of ['first', 'other']) await command('openssl', ['req', '-x509', '-newkey', 'rsa:2048',
      '-nodes', '-days', '1', '-subj', '/CN=NFSE-SYNTHETIC-TEST',
      '-keyout', `${temp}/${id}.key`, '-out', `${temp}/${id}.crt`]);
    const material = { privateKeyPem: await Deno.readTextFile(`${temp}/first.key`),
      certificatePem: await Deno.readTextFile(`${temp}/first.crt`) };
    const doc = buildNationalDps(fixture());
    for (const profile of ['RSA_SHA1_LEGACY', 'RSA_SHA256'] as const) {
      const signed = signNationalXml(doc, material, profile);
      assert(verifyNationalXml(doc, signed, material.certificatePem, profile));
      assert(!verifyNationalXml(doc, signed.replace('<vServ>123.45', '<vServ>123.46'), material.certificatePem, profile));
      assert(!verifyNationalXml(doc, signed, await Deno.readTextFile(`${temp}/other.crt`), profile));
      await validate(signed, 'DPS_v1.01.xsd');
    }
    const prepared = await prepareNationalSignedXml(doc, { schema: { validate }, credential: material,
      signatureProfile: 'RSA_SHA256' });
    assert(prepared.liveReady === false);
    throws(() => assertNationalLiveContract(), 'CONTRACT_UNVERIFIED');
    for (const eventCode of ['101101', '101103'] as const) {
      const event = buildNationalCancellation({ environment: 'HOMOLOGACAO', applicationVersion: 'Universo_TESTE_1',
        occurredAt: '2026-11-08T12:00:00-03:00', accessKey: syntheticAccessKey,
        author: { type: 'CNPJ', value: '0'.repeat(14) }, eventCode, reasonCode: '2',
        reason: 'Servico sintetico nao foi prestado' });
      const eventXml = signNationalXml(event, material, 'RSA_SHA256');
      assert(verifyNationalXml(event, eventXml, material.certificatePem, 'RSA_SHA256'));
      await validate(eventXml, 'pedRegEvento_v1.01.xsd');
    }
    const substitution = buildNationalDps({ ...fixture(), substitution: { originalAccessKey: syntheticAccessKey,
      reasonCode: '99', reason: 'Correcao exclusivamente sintetica' } });
    await validate(substitution.xml, 'DPS_v1.01.xsd');
  } finally { await Deno.remove(temp, { recursive: true }); }
});

Deno.test('XSD original de producao bloqueia serie numerica: divergencia documental preservada', async () => {
  const dps = buildNationalDps({ ...fixture(), environment: 'PRODUCAO' });
  let error: unknown;
  try { await validate(dps.xml, 'DPS_v1.01.xsd', 'PRODUCAO'); } catch (caught) { error = caught; }
  assert(error instanceof Error && error.message.includes("pattern '^0{0,4}\\d{1,5}$'"));
  assert(!dps.xml.includes('<finNFSe>'), 'Production does not inherit restricted-environment layout');
});

Deno.test('rotas fixas e mTLS bloqueiam destinos arbitrarios antes de rede', () => {
  const dps = buildNationalDps(fixture());
  assert(nationalRoute('CONSULT_DPS', dps.referenceId) === `/dps/${dps.referenceId}`);
  assert(nationalRoute('REGISTER_EVENT', '0'.repeat(50)) === `/nfse/${'0'.repeat(50)}/eventos`);
  throws(() => nationalRoute('CONSULT_NFSE', '../outside'), 'INVALID_ACCESS_KEY');
  const transport = createNationalMtlsTransport('HOMOLOGACAO', { certificateChainPem: '', privateKeyPem: '' });
  try {
    throws(() => transport.request('GET', '//attacker.invalid'), 'UNSUPPORTED_FISCAL_ROUTE');
    throws(() => transport.request('GET', '/nfse'), 'UNSUPPORTED_FISCAL_ROUTE');
    throws(() => transport.request('POST', `/dps/${dps.referenceId}`, '{}'), 'UNSUPPORTED_FISCAL_ROUTE');
    throws(() => transport.request('POST', '/nfse'), 'INVALID_REQUEST_BODY');
    throws(() => transport.request('POST', '/nfse', '{}'), 'CONTRACT_UNVERIFIED');
    throws(() => transport.request('POST', `/nfse/${syntheticAccessKey}/eventos`, '{}'), 'CONTRACT_UNVERIFIED');
  }
  finally { transport.close(); }
});
