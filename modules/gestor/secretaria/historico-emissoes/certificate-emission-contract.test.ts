import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCertificateAlignedWithEmission,
  isCertificateAlignedWithEmission,
} from './certificate-emission-contract.ts';

test('fallback aceita somente certificado com o código da emissão canônica', () => {
  assert.equal(
    isCertificateAlignedWithEmission(
      { codigo_validacao: ' cert-e1 ' },
      { codigo: 'CERT-E1' },
    ),
    true,
  );
  assert.equal(
    isCertificateAlignedWithEmission(
      { codigo_validacao: 'CERT-OUTRO' },
      { codigo: 'CERT-E1' },
    ),
    false,
  );
});

test('divergência de código bloqueia a geração do certificado', () => {
  assert.throws(
    () => assertCertificateAlignedWithEmission(
      { codigo_validacao: 'CERT-OUTRO' },
      { codigo: 'CERT-E1' },
    ),
    /código de validação diferente da emissão canônica/i,
  );
});
