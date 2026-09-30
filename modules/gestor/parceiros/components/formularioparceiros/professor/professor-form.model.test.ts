import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createInitialProfessorFormData,
  formatPixKeyInput,
  getProfessorFormError,
  normalizePixKey,
  validatePixKey,
} from './professor-form.model.ts';

const VALID_POLO_ID = '11111111-1111-4111-8111-111111111111';
const LEGACY_POLO_ID = '44444444-4444-4444-4444-444444444444';
const formSource = readFileSync(new URL('./ParceiroProfessorForm.tsx', import.meta.url), 'utf8');

test('inicia o professor no polo UUID recebido sem recorrer à matriz legada', () => {
  const form = createInitialProfessorFormData(VALID_POLO_ID);

  assert.equal(form.poloId, VALID_POLO_ID);
  assert.deepEqual(form.poloIds, [VALID_POLO_ID]);
  assert.equal(form.tipoConta, '');

  const legacyForm = createInitialProfessorFormData(LEGACY_POLO_ID);
  assert.equal(legacyForm.poloId, LEGACY_POLO_ID);
  assert.deepEqual(legacyForm.poloIds, [LEGACY_POLO_ID]);
});

test('exige somente polo, nome e CPF no cadastro mínimo', () => {
  const empty = createInitialProfessorFormData();
  assert.match(getProfessorFormError(empty)?.message || '', /polo/i);

  const valid = {
    ...empty,
    poloId: VALID_POLO_ID,
    poloIds: [VALID_POLO_ID],
    nomeCompleto: 'PROFESSORA DE TESTE',
    cpf: '529.982.247-25',
  };

  assert.equal(getProfessorFormError(valid), null);
});

test('formata e normaliza chaves Pix de acordo com o tipo selecionado', () => {
  assert.equal(formatPixKeyInput('CPF', '52998224725'), '529.982.247-25');
  assert.equal(normalizePixKey('CPF', '529.982.247-25'), '52998224725');
  assert.equal(formatPixKeyInput('PHONE', '79996883477'), '(79) 99688-3477');
  assert.equal(normalizePixKey('PHONE', '(79) 99688-3477'), '+5579996883477');
  assert.equal(normalizePixKey('EMAIL', ' Docente@Exemplo.COM '), 'docente@exemplo.com');
});

test('recusa chave Pix incompatível com o tipo escolhido', () => {
  assert.match(validatePixKey('CPF', '123') || '', /CPF válido/i);
  assert.match(validatePixKey('PHONE', '79999999') || '', /telefone brasileiro completo/i);
  assert.match(validatePixKey('PHONE', '999999999') || '', /telefone brasileiro completo/i);
  assert.equal(validatePixKey('PHONE', '(79) 99999-9999'), null);
  assert.match(validatePixKey('EMAIL', 'email-inválido') || '', /e-mail válido/i);
  assert.match(validatePixKey('CNPJ', 'ABCDEFGHIJKLMN') || '', /CNPJ válido/i);
  assert.match(validatePixKey('CNPJ', '00.000.000/0000-00') || '', /CNPJ válido/i);
  assert.equal(validatePixKey('CNPJ', '12.ABC.345/01DE-35'), null);
  assert.equal(validatePixKey('EVP', '550e8400-e29b-41d4-a716-446655440000'), null);
});

test('não reaproveita o botão próximo como submit ao entrar na última etapa', () => {
  assert.match(formSource, /key="next-step" type="button"/);
  assert.match(formSource, /key="submit-professor" type="submit"/);
  assert.match(formSource, /<form onSubmit=\{handleSubmit\} noValidate>/);
});
