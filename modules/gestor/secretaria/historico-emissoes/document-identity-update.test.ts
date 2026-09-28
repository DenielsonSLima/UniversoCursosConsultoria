import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canUpdateDocumentIdentity, identityUpdateError, requestDocumentIdentityUpdate } from './useUpdateDocumentIdentity';
import type { EmissionLog } from './historico-emissoes.types';

const source = { codigo: 'PASTA-ORIGINAL', documento: 'pasta_identificacao', aluno_id: 'aluno', matricula_id: 'matricula', status: 'ATIVO' } as EmissionLog;
const updated = { ...source, codigo: 'PASTA-NOVA' };

test('nova identificação envia origem e UUID e carrega a versão canônica', async () => {
  const calls: unknown[] = [];
  const dependencies = {
    client: { rpc: async (...args: unknown[]) => {
      calls.push(args);
      return { data: [{ codigo: updated.codigo, documento: updated.documento }], error: null };
    } },
    load: async (code: string) => { assert.equal(code, updated.codigo); return updated; },
  } as unknown as Parameters<typeof requestDocumentIdentityUpdate>[2];
  assert.equal(await requestDocumentIdentityUpdate(source, 'request-1', dependencies), updated);
  assert.deepEqual(calls, [['atualizar_identidade_documento_portal', {
    p_codigo_origem: source.codigo, p_request_id: 'request-1',
  }]]);
  assert.equal(source.codigo, 'PASTA-ORIGINAL');
});

test('resposta de outro documento ou vínculo é rejeitada', async () => {
  for (const loaded of [{ ...updated, aluno_id: 'outro' }, { ...updated, matricula_id: 'outra' }]) {
    const dependencies = {
      client: { rpc: async () => ({ data: updated, error: null }) },
      load: async () => loaded,
    } as unknown as Parameters<typeof requestDocumentIdentityUpdate>[2];
    await assert.rejects(requestDocumentIdentityUpdate(source, 'request-1', dependencies));
  }
});

test('ação disponível só para documentos suportados não revogados', () => {
  assert.equal(canUpdateDocumentIdentity(source), true);
  assert.equal(canUpdateDocumentIdentity({ ...source, status: 'REVOGADO' }), false);
  assert.equal(canUpdateDocumentIdentity({ ...source, documento: 'boletim' }), false);
});

test('feedback preserva instrução de correção e não expõe erro desconhecido', () => {
  assert.match(identityUpdateError({ message: 'A identificação deste documento já corresponde ao cadastro atual.' }), /já corresponde/);
  assert.match(identityUpdateError({ message: 'Confirme CIN ou RG.' }), /Confirme o tipo/);
  assert.match(identityUpdateError({ message: 'Documento revogado.' }), /revogado/);
  assert.doesNotMatch(identityUpdateError({ message: 'database-private-raw-detail' }), /database-private/);
});

test('nova carteirinha usa modelo congelado antes do modelo e cores atuais', () => {
  const source = readFileSync('modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts', 'utf8');
  assert.match(source, /\['pasta_identificacao', 'ficha_matricula', 'carteirinha'\]\.includes/);
  assert.ok(source.indexOf(': frozenRegistrationTemplate;') < source.indexOf('await carteirinhaService.getTemplate()'));
  assert.match(source, /modelo congelado da carteirinha está inválido/);
});
