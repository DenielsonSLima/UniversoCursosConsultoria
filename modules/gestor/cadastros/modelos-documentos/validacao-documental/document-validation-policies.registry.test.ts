import assert from 'node:assert/strict';
import {
  DOCUMENT_VALIDATION_CATALOG,
  normalizeValidationPrefix,
  validateValidationPrefix,
} from './document-validation-policies.registry.ts';
import {
  DOCUMENT_VALIDATION_POLICIES,
} from '../../../../shared/document-validation/document-validation.policies.ts';
import {
  VALIDATOR_RENDERER_BY_TYPE,
} from '../../../../public/validator/validator.rendering.ts';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('registro documental não contém tipos duplicados', () => {
  const ids = DOCUMENT_VALIDATION_CATALOG.map((document) => document.id);
  assert.equal(new Set(ids).size, ids.length);
});

Deno.test('catálogo, políticas e renderers cobrem os mesmos 19 documentos', () => {
  const catalogTypes = DOCUMENT_VALIDATION_CATALOG
    .map((document) => document.id)
    .sort();
  const policyTypes = Object.keys(DOCUMENT_VALIDATION_POLICIES).sort();
  const rendererTypes = Object.keys(VALIDATOR_RENDERER_BY_TYPE).sort();

  assert.equal(catalogTypes.length, 19);
  assert.equal(catalogTypes.map(String).includes('rematricula'), false);
  assert.deepEqual(policyTypes, catalogTypes);
  assert.deepEqual(policyTypes, rendererTypes);
  assert.ok(catalogTypes.includes('diario_classe'));
  assert.ok(catalogTypes.includes('contrato_aluno'));
  assert.ok(catalogTypes.includes('carteirinha_preceptor'));
});

Deno.test('prefixos padrão são válidos e únicos por documento', () => {
  const prefixes = Object.entries(DOCUMENT_VALIDATION_POLICIES).map(
    ([documentType, policy]) => {
      assert.equal(
        validateValidationPrefix(policy.prefix),
        null,
        `prefixo inválido em ${documentType}`,
      );
      return policy.prefix.toLocaleUpperCase('pt-BR');
    },
  );

  assert.equal(new Set(prefixes).size, prefixes.length);
  assert.equal(DOCUMENT_VALIDATION_POLICIES.diario_classe.prefix, 'DIA');
});

Deno.test('prefixo é normalizado para formato canônico', () => {
  assert.equal(normalizeValidationPrefix('  cert técn/2026  '), 'CERT-TECN-2026');
  assert.equal(normalizeValidationPrefix('FICHA___MAT'), 'FICHA-MAT');
});

Deno.test('prefixo recusa vazio e aceita blocos alfanuméricos', () => {
  assert.ok(validateValidationPrefix('A'));
  assert.equal(validateValidationPrefix('CERT-TEC'), null);
});

Deno.test('serviço usa RPC v2 com versão esperada e auditoria', async () => {
  const serviceSource = await Deno.readTextFile(
    new URL('./document-validation-policies.service.ts', import.meta.url),
  );

  assert.match(serviceSource, /atualizar_politica_validacao_documento_v2/);
  assert.match(serviceSource, /p_expected_version:\s*draft\.versaoPublica/);
  assert.match(serviceSource, /p_campos_publicos:/);
  assert.match(serviceSource, /p_consulta_publica_ativa:/);
  assert.match(serviceSource, /p_motivo:\s*draft\.motivo\.trim\(\)/);
  assert.match(serviceSource, /DocumentValidationPolicyVersionConflictError/);
});
