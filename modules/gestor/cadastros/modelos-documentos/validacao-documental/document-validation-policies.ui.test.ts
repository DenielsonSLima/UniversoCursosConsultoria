import assert from 'node:assert/strict';
import {
  DOCUMENT_VALIDATION_CATALOG,
  NON_VALIDATABLE_DOCUMENTS,
} from './document-validation-policies.registry.ts';
import {
  PUBLIC_VALIDATION_FIELD_CATALOG,
  isPublicValidationFieldCompatible,
} from '../../../../public/validator/validator.fields.ts';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('editor inclui Diário uma única vez e permite prefixo próprio', () => {
  assert.equal(
    DOCUMENT_VALIDATION_CATALOG.filter((item) => item.id === 'diario_classe').length,
    1,
  );
  assert.equal(
    NON_VALIDATABLE_DOCUMENTS.some((item) => item.id === 'diario_classe'),
    false,
  );
});

Deno.test('editor não oferece QR Code nem validade para rematrícula', () => {
  assert.equal(
    DOCUMENT_VALIDATION_CATALOG.map((item) => String(item.id)).includes('rematricula'),
    false,
  );
});

Deno.test('editor do Diário oferece somente campos sem dados pessoais', () => {
  const compatible = PUBLIC_VALIDATION_FIELD_CATALOG
    .filter((field) => isPublicValidationFieldCompatible(field, 'diario_classe'))
    .map((field) => field.id);

  assert.deepEqual(compatible, [
    'courseName',
    'className',
    'institutionName',
    'institutionCnpj',
    'unitName',
    'issuedAt',
    'lastIssuedAt',
    'expiresAt',
    'issueCount',
  ]);
});

Deno.test('editor comunica bloqueio, readonly e navegação acessível', async () => {
  const source = await Deno.readTextFile(
    new URL('./DocumentValidationPoliciesPage.tsx', import.meta.url),
  );
  const parentSource = await Deno.readTextFile(
    new URL('../ModelosDocumentosPage.tsx', import.meta.url),
  );
  const moduleSource = await Deno.readTextFile(
    new URL('../../../components/GestorModuleContent.tsx', import.meta.url),
  );

  assert.match(source, /checked=\{!draft\.consultaPublicaAtiva\}/);
  assert.match(source, /consultaPublicaAtiva:\s*!blocked/);
  assert.match(source, /readOnly \|\| saving/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-selected=\{section === id\}/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /event\.key === 'ArrowRight'/);
  assert.match(source, /Consulta pública bloqueada/);
  assert.match(source, /validityDays === null/);
  assert.match(source, /const code = `\$\{prefix \|\| 'DOC'\}-EXEMPLO-2026`/);
  assert.match(source, /type: documentType,\s+code,\s+status:/);
  assert.match(source, /\}, code\);/);
  assert.match(parentSource, /readOnly=\{!canEditValidationPolicies\}/);
  assert.match(moduleSource, /canEditValidationPolicies=\{isGlobal\}/);
});
