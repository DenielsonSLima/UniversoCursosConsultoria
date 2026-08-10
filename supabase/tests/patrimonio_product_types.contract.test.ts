import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260810110000_create_patrimonio_product_type_catalog.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionDefinition = (name: string) => {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  );
  return sql.match(pattern)?.[0] ?? "";
};

Deno.test("catálogo é empresarial, normalizado, versionado e RPC-only", () => {
  assert.match(sql, /create table public\.patrimonio_tipos_produto/i);
  assert.match(
    sql,
    /company_id uuid not null references public\.empresas\(id\) on delete restrict/i,
  );
  assert.match(
    sql,
    /nome_normalizado text generated always as \([\s\S]*public\.financeiro_normalize_search_text\(btrim\(nome\)\)[\s\S]*\) stored/i,
  );
  assert.match(sql, /status text not null default 'ativo'/i);
  assert.match(sql, /check \(status in \('ativo', 'inativo'\)\)/i);
  assert.match(sql, /request_id uuid not null default gen_random_uuid\(\)/i);
  assert.match(sql, /unique \(company_id, request_id\)/i);
  assert.match(sql, /unique \(company_id, id\)/i);
  assert.match(sql, /created_by uuid/i);
  assert.match(sql, /updated_by uuid/i);
  assert.match(sql, /created_at timestamptz not null default now\(\)/i);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/i);
  assert.match(sql, /deleted_at timestamptz/i);
  assert.match(
    sql,
    /unique index patrimonio_tipos_produto_company_nome_ativo_uidx[\s\S]*where deleted_at is null/i,
  );
  assert.match(
    sql,
    /alter table public\.patrimonio_tipos_produto enable row level security/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.patrimonio_tipos_produto[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant all on table public\.patrimonio_tipos_produto to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant (select|insert|update|delete|all) on (table )?public\.patrimonio_tipos_produto to authenticated/i,
  );
});

Deno.test("seed cobre as sete opções e backfill materializa todo histórico antes da FK", () => {
  const expectedNames = [
    "Equipamento de informática",
    "Mobiliário",
    "Equipamento pedagógico",
    "Veículo",
    "Eletrônico",
    "Instrumento",
    "Outro",
  ];
  for (const name of expectedNames) assert.ok(sql.includes(`('${name}'`));

  assert.match(sql, /from public\.empresas empresa[\s\S]*cross join \(/i);
  assert.match(
    sql,
    /row_number\(\) over[\s\S]*from public\.patrimonios patrimonio[\s\S]*tipo preservado do histórico de patrimônio/i,
  );
  assert.match(sql, /btrim\(patrimonio\.tipo_produto\) as nome/i);
  assert.doesNotMatch(
    sql,
    /upper\(btrim\(patrimonio\.tipo_produto\)\) as nome/i,
  );
  assert.match(
    sql,
    /update public\.patrimonios patrimonio[\s\S]*set tipo_produto_id = tipo\.id/i,
  );
  assert.match(
    sql,
    /if exists \([\s\S]*from public\.patrimonios patrimonio[\s\S]*tipo_produto_id is null[\s\S]*raise exception/i,
  );

  const backfill = sql.indexOf("UPDATE public.patrimonios patrimonio");
  const notNull = sql.indexOf("ALTER COLUMN tipo_produto_id SET NOT NULL");
  assert.ok(backfill >= 0 && notNull > backfill);
  assert.match(
    sql,
    /foreign key \(company_id, tipo_produto_id\)[\s\S]*references public\.patrimonio_tipos_produto\(company_id, id\)[\s\S]*on delete restrict/i,
  );
});

Deno.test("RPCs do catálogo têm JSONB estável, search_path vazio e campos combinados", () => {
  const rpcNames = [
    "listar_patrimonio_tipos_produto_secure",
    "criar_patrimonio_tipo_produto_secure",
    "atualizar_patrimonio_tipo_produto_secure",
    "excluir_patrimonio_tipo_produto_secure",
  ];
  const responseFields = [
    "id",
    "company_id",
    "nome",
    "descricao",
    "status",
    "usage_count",
    "can_delete",
    "created_at",
    "updated_at",
  ];

  for (const name of rpcNames) {
    const definition = functionDefinition(name);
    assert.ok(definition, `RPC ausente: ${name}`);
    assert.match(definition, /returns jsonb/i);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = ''/i);
    assert.match(definition, /auth\.jwt\(\) ->> 'role'/i);
    assert.doesNotMatch(definition, /auth\.role\(\)/i);
    for (const field of responseFields) {
      assert.match(definition, new RegExp(`'${field}'`, "i"));
    }
  }

  assert.match(
    sql,
    /listar_patrimonio_tipos_produto_secure\([\s\S]*p_polo_id uuid,[\s\S]*p_incluir_inativos boolean default false/i,
  );
  assert.match(
    functionDefinition("listar_patrimonio_tipos_produto_secure"),
    /return v_result/i,
  );
  assert.doesNotMatch(
    functionDefinition("listar_patrimonio_tipos_produto_secure"),
    /jsonb_build_object\(\s*'items'/i,
  );
});

Deno.test("mutações do catálogo exigem gestor global, Configurações e Matriz ativa", () => {
  const mutationNames = [
    "criar_patrimonio_tipo_produto_secure",
    "atualizar_patrimonio_tipo_produto_secure",
    "excluir_patrimonio_tipo_produto_secure",
  ];

  for (const name of mutationNames) {
    const definition = functionDefinition(name);
    const authorization = definition.indexOf("public.is_gestor_global()");
    const lookup = definition.indexOf("FROM public.polos polo");
    assert.ok(authorization >= 0 && lookup > authorization);
    assert.match(definition, /public\.gestor_has_module\('configuracoes'\)/i);
    assert.match(definition, /polo\.is_matriz = true/i);
    assert.match(
      definition,
      /lower\(coalesce\(polo\.status, 'ativo'\)\) = 'ativo'/i,
    );
  }

  assert.match(
    functionDefinition("atualizar_patrimonio_tipo_produto_secure"),
    /p_expected_updated_at timestamptz[\s\S]*updated_at is distinct from p_expected_updated_at[\s\S]*errcode = '40001'/i,
  );
  assert.match(
    functionDefinition("excluir_patrimonio_tipo_produto_secure"),
    /deleted_at is not null[\s\S]*return jsonb_build_object/i,
  );
  assert.match(
    functionDefinition("excluir_patrimonio_tipo_produto_secure"),
    /from public\.patrimonios patrimonio[\s\S]*if v_usage_count > 0[\s\S]*deve ser apenas inativado/i,
  );
  assert.match(
    functionDefinition("excluir_patrimonio_tipo_produto_secure"),
    /set[\s\S]*status = 'inativo',[\s\S]*deleted_at = pg_catalog\.now\(\)/i,
  );
  assert.doesNotMatch(
    functionDefinition("excluir_patrimonio_tipo_produto_secure"),
    /delete from public\.patrimonio_tipos_produto/i,
  );
});

Deno.test("criação diferencia duplicado ativo e inativo e preserva concorrência", () => {
  const definition = functionDefinition(
    "criar_patrimonio_tipo_produto_secure",
  );
  assert.match(
    definition,
    /v_duplicate_status = 'inativo'[\s\S]*já existe um tipo de produto inativo com este nome; reative em configurações/i,
  );
  assert.match(
    definition,
    /v_duplicate_status = 'ativo'[\s\S]*já existe um tipo de produto com este nome/i,
  );
  assert.match(
    definition,
    /exception[\s\S]*when unique_violation then[\s\S]*nome_normalizado = public\.financeiro_normalize_search_text\(v_nome\)/i,
  );
});

Deno.test("v2 grava vínculo e snapshot, mas replay precede validação de status", () => {
  const definition = functionDefinition("criar_patrimonio_v2_secure");
  assert.ok(definition);
  assert.match(definition, /p_tipo_produto_id uuid/i);
  assert.match(definition, /returns public\.patrimonios/i);
  assert.match(definition, /security definer[\s\S]*set search_path = ''/i);
  assert.match(definition, /auth\.jwt\(\) ->> 'role'/i);
  assert.doesNotMatch(definition, /auth\.role\(\)/i);

  const authorization = definition.indexOf("public.is_financeiro_for_polo");
  const replayLookup = definition.indexOf(
    "patrimonio.request_id = p_request_id",
  );
  const activeLookup = definition.indexOf("tipo.status = 'ativo'");
  assert.ok(authorization >= 0 && replayLookup > authorization);
  assert.ok(activeLookup > replayLookup);
  assert.match(definition, /tipo\.deleted_at is null/i);
  assert.match(
    definition,
    /tipo_produto_id,[\s\S]*tipo_produto,[\s\S]*v_tipo\.id,[\s\S]*v_tipo\.nome/i,
  );
  assert.match(
    definition,
    /p_valor_unitario > 999999999999\.99[\s\S]*valor unitário excede o limite permitido/i,
  );
  assert.match(
    definition,
    /p_quantidade::numeric \* round\(p_valor_unitario, 2\) > 99999999999999\.99[\s\S]*valor total excede o limite permitido/i,
  );
  assert.match(
    definition,
    /v_existing\.tipo_produto_id is distinct from p_tipo_produto_id/i,
  );
});

Deno.test("wrapper legado preserva assinatura e replay antes do catálogo ativo", () => {
  const definition = functionDefinition("criar_patrimonio_secure");
  assert.ok(definition);
  assert.match(definition, /p_tipo_produto text/i);
  assert.match(definition, /set search_path = ''/i);
  assert.match(definition, /auth\.jwt\(\) ->> 'role'/i);
  assert.doesNotMatch(definition, /auth\.role\(\)/i);

  const authorization = definition.indexOf("public.is_financeiro_for_polo");
  const replayLookup = definition.indexOf(
    "patrimonio.request_id = p_request_id",
  );
  const activeLookup = definition.indexOf("tipo.status = 'ativo'");
  assert.ok(authorization >= 0 && replayLookup > authorization);
  assert.ok(activeLookup > replayLookup);
  assert.match(
    definition,
    /return public\.criar_patrimonio_v2_secure\(/i,
  );
});

Deno.test("listagem patrimonial expõe tipo_produto_id sem alterar total canônico", () => {
  const definition = functionDefinition("listar_patrimonios_secure");
  assert.ok(definition);
  assert.match(definition, /set search_path = ''/i);
  assert.match(definition, /'tipo_produto_id', item\.tipo_produto_id/i);
  assert.match(definition, /'valor_unitario', item\.valor_unitario::text/i);
  assert.match(definition, /'valor_total', item\.valor_total::text/i);
  assert.match(
    definition,
    /v_tipo_produto_id uuid := case[\s\S]*then btrim\(p_tipo_produto\)::uuid/i,
  );
  assert.match(
    definition,
    /patrimonio\.tipo_produto_id = v_tipo_produto_id/i,
  );
  assert.match(
    definition,
    /financeiro_normalize_search_text\(patrimonio\.tipo_produto\) = v_tipo/i,
  );
  assert.match(
    definition,
    /from public\.patrimonio_tipos_produto tipo_atual[\s\S]*tipo_atual\.id = patrimonio\.tipo_produto_id[\s\S]*tipo_atual\.nome_normalizado = v_tipo/i,
  );
  assert.doesNotMatch(definition, /auth\.role\(\)/i);
});

Deno.test("funções públicas revogam defaults e concedem somente execução explícita", () => {
  const signatures = [
    "listar_patrimonio_tipos_produto_secure\\(uuid, boolean\\)",
    "criar_patrimonio_tipo_produto_secure\\(uuid, uuid, text, text\\)",
    "atualizar_patrimonio_tipo_produto_secure\\(uuid, uuid, text, text, text, timestamptz\\)",
    "excluir_patrimonio_tipo_produto_secure\\(uuid, uuid, timestamptz\\)",
    "criar_patrimonio_v2_secure\\(uuid, uuid, date, uuid, text, integer, numeric, text, text\\)",
    "criar_patrimonio_secure\\(uuid, uuid, date, text, text, integer, numeric, text, text\\)",
    "listar_patrimonios_secure\\(uuid, text, text, integer, integer\\)",
  ];

  for (const signature of signatures) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${signature}[\\s\\S]*?to authenticated, service_role`,
        "i",
      ),
    );
  }
});
