import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStudentIdentityDocument } from './studentIdentityDocument.ts';

test('CIN oficial usa CPF e ignora RG residual sem apagá-lo', () => {
  const identity = resolveStudentIdentityDocument({
    tipoDocumento: 'CARTEIRA DE IDENTIDADE NACIONAL',
    cpf: '123.456.789-00',
    rg: 'RG-LEGADO',
  });

  assert.equal(identity.number, '123.456.789-00');
  assert.equal(identity.isCin, true);
});

test('default legado permanece ambíguo e continua mostrando o número antigo', () => {
  const identity = resolveStudentIdentityDocument({
    tipo_documento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    cpf_cnpj: '123.456.789-00',
    rg: '1234567',
  });

  assert.match(identity.label, /legada/i);
  assert.equal(identity.number, '1234567');
  assert.equal(identity.isCin, false);
});

test('tipo vazio não presume CIN nem RG', () => {
  const identity = resolveStudentIdentityDocument({ cpf: '123', rg: '456' });
  assert.equal(identity.type, '');
  assert.equal(identity.number, '');
});

test('CNH usa somente o registro e ignora metadados residuais de RG', () => {
  const identity = resolveStudentIdentityDocument({
    tipoDocumento: 'CNH',
    rg: '01234567890',
    orgaoEmissor: 'SSP',
    rgUfEmissao: 'SE',
    rgDataEmissao: '2020-01-01',
  });

  assert.equal(identity.number, '01234567890');
  assert.equal(identity.issuer, '');
  assert.equal(identity.state, '');
  assert.equal(identity.issueDate, '');
});
