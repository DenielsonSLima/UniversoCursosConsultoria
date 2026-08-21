import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath: string) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [serviceSource, tabSource, responsaveisServiceSource, responsaveisTabSource] = await Promise.all([
  readSource('./coordenacoes.service.ts'),
  readSource('./CoordenacoesTab.tsx'),
  readSource('../responsaveis/responsaveis.service.ts'),
  readSource('../responsaveis/ResponsaveisTab.tsx'),
]);

test('Coordenações consome paginação canônica e opções autorizadas por RPC', () => {
  assert.match(serviceSource, /rpc\('professores_coordenacoes_listar'/);
  assert.match(serviceSource, /p_cursor: input\.cursor \?\? null/);
  assert.match(serviceSource, /items: source\.items\.map\(normalizeCoordenacao\)/);
  assert.match(serviceSource, /nextCursor: nullableCursor\(source\.nextCursor, 'nextCursor'\)/);
  assert.match(serviceSource, /rpc\('professores_coordenacoes_opcoes_cadastro', \{/);
  assert.match(serviceSource, /\.\.\.toRpcScope\(input\.scope\)/);
  assert.match(serviceSource, /\.\.\.toRpcScope\(scope\)/);
  assert.doesNotMatch(serviceSource, /\.from\('cursos'\)|\.from\('polos'\)/);
  assert.match(tabSource, /useInfiniteQuery/);
  assert.match(tabSource, /getNextPageParam: \(lastPage\) => lastPage\.nextCursor \|\| undefined/);
  assert.match(tabSource, /listQuery\.fetchNextPage\(\)/);
  assert.match(tabSource, /professor\.poloIds\.includes\(polo\.id\)/);
  assert.match(tabSource, /invalidatePolo\(result\.poloId\)/);
  assert.match(tabSource, /scope: queryScope/);
  assert.match(tabSource, /activeScopeIdentityRef\.current === mutationScopeIdentity/);
});

test('Responsáveis mantém o cursor opaco e carrega páginas adicionais sem inferir elegibilidade', () => {
  assert.match(responsaveisServiceSource, /rpc\('responsaveis_legais_listar'/);
  assert.match(responsaveisServiceSource, /p_cursor: input\.cursor \?\? null/);
  assert.match(responsaveisServiceSource, /nextCursor: nullableCursor\(source\.nextCursor, 'nextCursor'\)/);
  assert.match(responsaveisTabSource, /useInfiniteQuery/);
  assert.match(responsaveisTabSource, /listQuery\.fetchNextPage\(\)/);
  assert.match(responsaveisTabSource, /selected\?\.canVerify === true/);
  assert.doesNotMatch(responsaveisTabSource, /canVerify === true && selected\.canManageGlobal/);
  assert.match(responsaveisServiceSource, /canCreate: requiredBoolean\(source\.canCreate, 'canCreate'\)/);
  assert.match(responsaveisTabSource, /listAccess\?\.canCreate === true/);
  assert.match(responsaveisServiceSource, /p_include_global: scope\.includeGlobal/);
});
