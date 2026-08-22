import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { requireResponsavelRequestId } from './responsaveis.contract.ts';

const [contractSource, serviceSource, accessServiceSource, tabSource, tabActionsSource] = await Promise.all([
  readFile(new URL('./responsaveis.contract.ts', import.meta.url), 'utf8'),
  readFile(new URL('./responsaveis.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./responsavel-access.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./ResponsaveisTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./hooks/useResponsaveisTabActions.ts', import.meta.url), 'utf8'),
]);

const tabFlowSource = `${tabSource}\n${tabActionsSource}`;

test('requestId é obrigatório, validado como UUID e nunca recebe fallback no serviço', () => {
  const requestId = '5d8609ea-fb4d-4cbc-8d9f-dba28c93bca5';

  assert.equal(requireResponsavelRequestId(requestId), requestId);
  for (const invalid of [undefined, null, '', ' request-id ', 'request-id', '5d8609ea-fb4d-4cbc-8d9f']) {
    assert.throws(() => requireResponsavelRequestId(invalid), /UUID válido/);
  }

  assert.match(contractSource, /requestId: string;/);
  assert.doesNotMatch(contractSource, /requestId\?: string \| null/);
  assert.match(serviceSource, /requireResponsavelRequestId\(input\.requestId\)/);
  assert.match(accessServiceSource, /requireResponsavelRequestId\(requestId\)/);
  assert.doesNotMatch(`${serviceSource}\n${accessServiceSource}`, /randomUUID|toRequestId|p_request_id: input\.requestId \|\|/);
});

test('opções de alunos vêm integralmente da RPC autorizada e permanecem lazy na UI', () => {
  assert.match(serviceSource, /rpc\('responsavel_legal_alunos_opcoes_vinculo', \{/);
  assert.match(serviceSource, /\.\.\.toRpcScope\(scope\)/);
  assert.match(serviceSource, /Array\.isArray\(source\.items\)/);
  assert.doesNotMatch(serviceSource, /\.from\('parceiros'\)/);
  assert.match(tabSource, /listarAlunosParaVinculo\(queryScope\)/);
  assert.match(tabSource, /enabled: Boolean\(queryScope && selectedId && showLinkForm\)/);
});

test('leituras e mutações enviam o escopo explícito e invalidam os polos devolvidos pelo backend', () => {
  for (const rpc of [
    'responsaveis_legais_listar',
    'responsavel_legal_alunos_opcoes_vinculo',
    'responsavel_legal_obter',
    'responsavel_legal_salvar',
    'responsavel_legal_vincular_aluno',
  ]) {
    const rpcBlock = serviceSource.slice(serviceSource.indexOf(`rpc('${rpc}'`));
    assert.match(rpcBlock.slice(0, 900), /toRpcScope\(/, `${rpc} precisa enviar polo/includeGlobal`);
  }
  assert.match(serviceSource, /affectedPoloIds: requiredStringArray\(source\.affectedPoloIds/);
  assert.match(tabFlowSource, /invalidateAffectedPolos\(result\.affectedPoloIds\)/);
  assert.match(tabFlowSource, /responsaveisLegaisQueryKeys\.polo\(affectedPoloId\)/);
  assert.match(tabFlowSource, /scope: queryScope/);
});
