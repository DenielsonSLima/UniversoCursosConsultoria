import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocumentValidationQrDataUrl,
  getDocumentValidationQrValue,
} from './document-validation.qr';

test('wrapper documental não cria URL de validação sem código', async () => {
  assert.equal(getDocumentValidationQrValue(''), '');
  assert.equal(getDocumentValidationQrValue('   '), '');
  await assert.rejects(
    () => createDocumentValidationQrDataUrl(''),
    /código de validação do documento não foi informado/i,
  );
});

test('helper documental gera QR somente quando o código existe', async () => {
  const value = getDocumentValidationQrValue(' CIE-TESTE-123 ');
  assert.match(value, /\/validador\?code=CIE-TESTE-123$/);

  const dataUrl = await createDocumentValidationQrDataUrl('CIE-TESTE-123');
  assert.match(dataUrl, /^data:image\/png;base64,/);
});
