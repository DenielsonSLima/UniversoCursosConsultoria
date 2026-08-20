// @ts-nocheck -- contrato puro do editor executado pelo Deno.

import assert from 'node:assert/strict';

import {
  ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS,
} from '../../../shared/assinatura-eletronica/assinatura-eletronica.contract.ts';
import { getElectronicSignatureStampLockedFields } from './signature-stamp-editor-fields.ts';

Deno.test('editor apresenta a prova individual bloqueada na ordem do carimbo', () => {
  const fields = getElectronicSignatureStampLockedFields(
    ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  );

  assert.deepEqual(fields.map((field) => field.id), [
    'canonicalLabel',
    'signerName',
    'signerCpfMasked',
    'signedAt',
    'signatureHash',
    'verificationUrl',
    'signatureQrCode',
  ]);
  assert.ok(fields.every((field) => field.locked));
  assert.equal(
    fields.find((field) => field.id === 'signerName')?.value,
    ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signerName,
  );
  assert.equal(
    fields.find((field) => field.id === 'signerCpfMasked')?.value,
    ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signerCpfMasked,
  );
  assert.equal(
    fields.find((field) => field.id === 'signatureHash')?.value,
    ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signatureHash,
  );
  assert.equal(fields.find((field) => field.id === 'signatureQrCode')?.kind, 'DERIVED_QR');
});

Deno.test('editor não contém separação visual por papel', () => {
  const fields = getElectronicSignatureStampLockedFields(
    ELECTRONIC_SIGNATURE_STAMP_CANONICAL_LABEL,
  );

  assert.equal(
    fields.find((field) => field.id === 'signerName')?.value,
    ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.signerName,
  );
  assert.equal(
    fields.find((field) => field.id === 'verificationUrl')?.value,
    ELECTRONIC_SIGNATURE_STAMP_PLACEHOLDERS.verificationUrl,
  );
});
