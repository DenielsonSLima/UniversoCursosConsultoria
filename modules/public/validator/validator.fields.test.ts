import assert from 'node:assert/strict';
import {
  PUBLIC_VALIDATION_FIELD_CATALOG,
  PUBLIC_VALIDATION_FIELDS,
  isPublicValidationFieldCompatible,
  isValidationFieldVisible,
  normalizeVisibleFields,
} from './validator.fields.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('registro público mantém a lista fechada sem campos duplicados', () => {
  assert.equal(new Set(PUBLIC_VALIDATION_FIELDS).size, PUBLIC_VALIDATION_FIELDS.length);
  assert.deepEqual(
    PUBLIC_VALIDATION_FIELD_CATALOG.map((field) => field.id).sort(),
    [...PUBLIC_VALIDATION_FIELDS].sort(),
  );
});

Deno.test('ausência de visibleFields usa somente o perfil mínimo seguro', () => {
  assert.deepEqual(
    normalizeVisibleFields(undefined),
    ['institutionName', 'issuedAt'],
  );
});

Deno.test('campos desconhecidos são descartados e obrigatórios são restaurados', () => {
  assert.deepEqual(
    normalizeVisibleFields(['courseName', 'cpfCompleto', 'courseName']),
    ['courseName', 'institutionName', 'issuedAt'],
  );
});

Deno.test('foto é compatível apenas com documentos de identificação', () => {
  const photo = PUBLIC_VALIDATION_FIELD_CATALOG.find(
    (field) => field.id === 'studentPhotoUrl',
  );
  assert.ok(photo);
  assert.equal(isPublicValidationFieldCompatible(photo, 'carteirinha'), true);
  assert.equal(isPublicValidationFieldCompatible(photo, 'cracha_estagio'), true);
  assert.equal(isPublicValidationFieldCompatible(photo, 'certificado_tecnico'), false);
});

Deno.test('período de referência cobre somente documentos periodizados', () => {
  const reference = PUBLIC_VALIDATION_FIELD_CATALOG.find(
    (field) => field.id === 'referencePeriod',
  );
  assert.ok(reference);
  for (const type of [
    'declaracao_frequencia',
    'declaracao_irpf',
    'boletim',
    'termo_estagio',
  ]) {
    assert.equal(isPublicValidationFieldCompatible(reference, type), true);
  }
  assert.equal(
    isPublicValidationFieldCompatible(reference, 'certificado_tecnico'),
    false,
  );
});

Deno.test('Diário aceita somente campos institucionais e da emissão', () => {
  const compatible = PUBLIC_VALIDATION_FIELD_CATALOG
    .filter((field) => isPublicValidationFieldCompatible(field, 'diario_classe'))
    .map((field) => field.id);
  assert.ok(compatible.includes('institutionName'));
  assert.ok(compatible.includes('issuedAt'));
  assert.ok(compatible.includes('courseName'));
  assert.equal(compatible.includes('studentName'), false);
  assert.equal(compatible.includes('studentCpf'), false);
  assert.equal(compatible.includes('maskedEnrollmentNumber'), false);
});

Deno.test('visibilidade pura nunca permite ocultar instituição e emissão', () => {
  assert.equal(isValidationFieldVisible([], 'institutionName'), true);
  assert.equal(isValidationFieldVisible([], 'issuedAt'), true);
  assert.equal(isValidationFieldVisible([], 'studentCpf'), false);
});
