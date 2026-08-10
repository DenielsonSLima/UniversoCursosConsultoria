import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

const [service, patrimonioService, toolbar, config, moduleContent, migration] = await Promise.all([
  read('./patrimonio-product-types.service.ts'),
  read('./patrimonio.service.ts'),
  read('./components/PatrimonioToolbar.tsx'),
  read('../configuracoes/tipos-produtos/TiposProdutosConfig.tsx'),
  read('../components/GestorModuleContent.tsx'),
  read('../../../supabase/migrations/20260810110000_create_patrimonio_product_type_catalog.sql'),
]);

Deno.test('cliente do catálogo usa os nomes e argumentos exatos das RPCs', () => {
  const contracts = [
    ['listar_patrimonio_tipos_produto_secure', ['p_polo_id', 'p_incluir_inativos']],
    ['criar_patrimonio_tipo_produto_secure', ['p_request_id', 'p_polo_matriz_id', 'p_nome', 'p_descricao']],
    ['atualizar_patrimonio_tipo_produto_secure', ['p_tipo_id', 'p_polo_matriz_id', 'p_nome', 'p_descricao', 'p_status', 'p_expected_updated_at']],
    ['excluir_patrimonio_tipo_produto_secure', ['p_tipo_id', 'p_polo_matriz_id', 'p_expected_updated_at']],
  ] as const;

  for (const [rpc, args] of contracts) {
    assert.ok(service.includes(`'${rpc}'`), `RPC ausente no cliente: ${rpc}`);
    assert.match(migration, new RegExp(`function public\\.${rpc}\\(`, 'i'));
    for (const arg of args) assert.ok(service.includes(`${arg}:`), `Argumento ausente: ${rpc}.${arg}`);
  }
});

Deno.test('cadastro e filtro patrimonial usam UUID e preservam decimais como texto', () => {
  assert.ok(patrimonioService.includes("supabase.rpc('criar_patrimonio_v2_secure'"));
  assert.ok(patrimonioService.includes('p_tipo_produto_id: input.tipoProdutoId'));
  assert.ok(patrimonioService.includes('valorTotalOriginal: asDecimalText(row.valor_total_original ?? row.valor_total)'));
  assert.ok(patrimonioService.includes('valorDisponivel: asDecimalText('));
  assert.match(toolbar, /value=\{productType\.id\}/);
  assert.match(migration, /v_tipo_produto_id uuid := case/i);
  assert.match(migration, /patrimonio\.tipo_produto_id = v_tipo_produto_id/i);
  assert.match(migration, /'valor_unitario', item\.valor_unitario::text/i);
  assert.match(migration, /'valor_total', item\.valor_total::text/i);
});

Deno.test('Configurações mantém replay estável e a UI repete a guarda global do banco', () => {
  assert.match(config, /createReplayRef = useRef/);
  assert.match(config, /createReplayRef\.current\.requestId/);
  assert.doesNotMatch(
    config,
    /requestId:\s*createPatrimonioRequestId\(\),\s*\n\s*poloId:/,
  );
  assert.match(
    moduleContent,
    /canManageProductTypes=\{isGlobal && canAccessGestorModule\(permissions, 'configuracoes'\)\}/,
  );
  assert.match(migration, /public\.is_gestor_global\(\)[\s\S]*public\.gestor_has_module\('configuracoes'\)/i);
});
