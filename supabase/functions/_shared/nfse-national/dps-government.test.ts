import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildNationalDps } from './dps.ts';
import type { NationalDpsInput } from './dps.types.ts';
import { createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { productionFixture } from './production.test-fixtures.ts';

/** Only the fiscal choices of the proven municipal lecture scenario; all identities are synthetic. */
function municipalLecture(): NationalDpsInput {
  const input = productionFixture();
  input.service.nbs = '122051900';
  input.service.description = 'Palestra sintetica municipal sem valor fiscal';
  input.recipient.address = {
    municipalityCode: '2803401', postalCode: '00000000', street: 'Rua Sintetica',
    number: '1', district: 'Centro',
  };
  input.values.serviceAmount = '1000.00';
  input.values.totalTaxes = { mode: 'SIMPLE_NATIONAL_PERCENTAGE', percentage: '12.00' };
  input.review.ibscbs = 'DECLARED_CONFIRMED';
  return { ...input, ibscbs: {
    personalUse: '0', operationCode: '030102', recipientIsAcquirer: true,
    cst: '000', classificationCode: '000001', governmentPurchase: { operationType: '1', entityType: '4' },
  } } as NationalDpsInput;
}

Deno.test('municipal lecture serializes the explicit government fields in the production XSD sequence', async () => {
  const input = municipalLecture(), before = globalThis.structuredClone(input);
  const document = buildNationalDps(input);
  assert(document.xml.includes('<IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal><cIndOp>030102</cIndOp>' +
    '<tpOper>1</tpOper><tpEnteGov>4</tpEnteGov><indDest>0</indDest>'));
  assert(document.xml.includes('<gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS>'));
  assert(document.xml.includes('<pTotTribSN>12.00</pTotTribSN>'));
  assert(!document.xml.includes('<gRefNFSe>'));
  assert(!document.xml.includes('<pAliq>'));
  assert.deepEqual(input, before, 'Serialization cannot replace explicit fiscal choices');
  // Existing production profile fixes only the documented official numeric-series regex conflict.
  await createProductionNumericSeriesCompatibilityValidator().validate(document.xml, 'DPS_v1.01.xsd', 'PRODUCAO');
});

Deno.test('municipal advance for future supply preserves type4 and omits referenced notes under E0906', async () => {
  const input = municipalLecture();
  input.ibscbs!.governmentPurchase!.operationType = '4';
  const before = globalThis.structuredClone(input), document = buildNationalDps(input);
  assert(document.xml.includes('<tpOper>4</tpOper><tpEnteGov>4</tpEnteGov>'));
  assert(!document.xml.includes('<gRefNFSe>'));
  assert(!document.xml.includes('<refNFSe>'));
  assert.deepEqual(input, before);
  await createProductionNumericSeriesCompatibilityValidator().validate(document.xml, 'DPS_v1.01.xsd', 'PRODUCAO');
});

Deno.test('government fields cannot expand to unsupported operations or incomplete acquisition addresses', () => {
  const mutators = [
    (value: any) => { value.ibscbs.governmentPurchase.operationType = '2'; },
    (value: any) => { value.ibscbs.governmentPurchase.operationType = '3'; },
    (value: any) => { value.ibscbs.governmentPurchase.operationType = '5'; },
    (value: any) => { value.ibscbs.governmentPurchase.operationType = 4; },
    (value: any) => { value.ibscbs.governmentPurchase.entityType = '1'; },
    (value: any) => { value.ibscbs.governmentPurchase.unreviewed = true; },
    (value: any) => { value.ibscbs.governmentPurchase = null; },
    (value: any) => { value.ibscbs.personalUse = '1'; },
    (value: any) => { value.ibscbs.operationCode = '030101'; },
    (value: any) => { value.ibscbs.recipientIsAcquirer = false; },
    (value: any) => { value.ibscbs.cst = '200'; },
    (value: any) => { value.ibscbs.classificationCode = '000002'; },
    (value: any) => { value.service.nationalTaxCode = '080101'; },
    (value: any) => { value.service.nbs = '122020000'; },
    (value: any) => { value.recipient.taxId = { type: 'CPF', value: '00000000000' }; },
    (value: any) => { delete value.recipient.address; },
    (value: any) => { value.recipient.address.municipalityCode = '3550308'; },
    (value: any) => { value.environment = 'HOMOLOGACAO'; },
  ];
  for (const mutate of mutators) {
    const value = municipalLecture(); mutate(value);
    assert.throws(() => buildNationalDps(value), /GOVERNMENT|IBSCBS|UNSUPPORTED_FIELD/, mutate.toString());
  }
});

Deno.test('omitting government preferences preserves the existing student XML byte for byte', () => {
  const input = productionFixture();
  input.ibscbs = { personalUse: '1', operationCode: '030101', recipientIsAcquirer: true,
    cst: '000', classificationCode: '000001' };
  input.review.ibscbs = 'DECLARED_CONFIRMED';
  const xml = buildNationalDps(input).xml;
  // Captured from the supported serializer before adding government preferences.
  assert.equal(createHash('sha256').update(xml).digest('hex'),
    '0d6cb631328927ab1cba4e7da8d6d3008fa57c93e0d7dcdec19a3bc6c854144d');
  assert(!xml.includes('<tpOper>')); assert(!xml.includes('<tpEnteGov>'));
});
