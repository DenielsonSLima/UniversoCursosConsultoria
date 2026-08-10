import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260810143000_create_patrimonio_lifecycle.sql",
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

Deno.test("patrimônio preserva aquisição e materializa saldo disponível canônico", () => {
  assert.match(
    sql,
    /add column status text not null default 'ativo'/i,
  );
  assert.match(
    sql,
    /check \(status in \('ativo', 'baixado', 'excluido'\)\)/i,
  );
  assert.match(
    sql,
    /add column quantidade_baixada integer not null default 0/i,
  );
  assert.match(
    sql,
    /quantidade_disponivel integer generated always as \([\s\S]*quantidade - quantidade_baixada[\s\S]*\) stored/i,
  );
  assert.match(
    sql,
    /valor_patrimonial_ativo numeric\(16, 2\) generated always as \([\s\S]*when status = 'excluido' then 0::numeric[\s\S]*quantidade - quantidade_baixada[\s\S]*valor_unitario[\s\S]*\) stored/i,
  );
  assert.match(sql, /add column updated_by uuid/i);
  assert.match(sql, /add column excluido_at timestamptz/i);
  assert.match(sql, /add column excluido_by uuid/i);
  assert.match(
    sql,
    /quantidade_baixada >= 0[\s\S]*quantidade_baixada <= quantidade/i,
  );
  assert.match(
    sql,
    /status = 'baixado'[\s\S]*ativo = false[\s\S]*quantidade_baixada = quantidade/i,
  );
  assert.match(
    sql,
    /status = 'excluido'[\s\S]*ativo = false[\s\S]*excluido_at is not null/i,
  );
  assert.match(
    sql,
    /existem patrimônios inativos sem classificação histórica/i,
  );
});

Deno.test("eventos são empresariais, tipados, imutáveis e inacessíveis diretamente", () => {
  assert.match(sql, /create table public\.patrimonio_eventos/i);
  assert.match(
    sql,
    /patrimonio_id uuid not null references public\.patrimonios\(id\) on delete restrict/i,
  );
  assert.match(sql, /effective_on date not null/i);
  assert.match(sql, /quantidade_movimento integer/i);
  assert.match(sql, /quantidade_original integer not null/i);
  assert.match(sql, /quantidade_baixada integer not null/i);
  assert.match(sql, /quantidade_disponivel integer not null/i);
  assert.match(sql, /valor_unitario numeric\(14, 2\) not null/i);
  assert.match(sql, /valor_patrimonial_ativo numeric\(16, 2\) not null/i);
  assert.match(sql, /unique \(company_id, request_id\)/i);
  assert.match(
    sql,
    /tipo in \('criacao', 'edicao', 'baixa_perda', 'exclusao_cadastro'\)/i,
  );
  assert.match(
    sql,
    /alter table public\.patrimonio_eventos enable row level security/i,
  );
  assert.match(
    sql,
    /create policy patrimonio_eventos_service_read[\s\S]*for select[\s\S]*to service_role[\s\S]*using \(true\)/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.patrimonio_eventos[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /create trigger patrimonio_eventos_immutable[\s\S]*before update or delete/i,
  );
  assert.match(
    functionDefinition("protect_patrimonio_eventos_immutability"),
    /eventos do patrimônio são imutáveis/i,
  );
});

Deno.test("migração cria baseline e toda criação nova grava evento atomicamente", () => {
  const createDefinition = functionDefinition("criar_patrimonio_v2_secure");
  const legacyDefinition = functionDefinition("criar_patrimonio_secure");

  assert.match(
    sql,
    /insert into public\.patrimonio_eventos[\s\S]*'criacao'[\s\S]*cadastro inicial preservado na implantação do ciclo de vida/i,
  );
  assert.match(
    sql,
    /patrimonio\.request_id,[\s\S]*patrimonio\.data_aquisicao/i,
  );
  assert.match(createDefinition, /returns public\.patrimonios/i);
  assert.match(createDefinition, /security definer/i);
  assert.match(createDefinition, /set search_path = ''/i);
  assert.match(
    createDefinition,
    /insert into public\.patrimonios[\s\S]*returning \* into v_result[\s\S]*insert into public\.patrimonio_eventos/i,
  );
  assert.match(createDefinition, /'criacao'/i);
  assert.match(
    createDefinition,
    /p_data_aquisicao > current_date[\s\S]*data de aquisição não pode estar no futuro/i,
  );
  assert.match(
    legacyDefinition,
    /return public\.criar_patrimonio_v2_secure\(/i,
  );
});

Deno.test("criação e listagem legadas preservam assinatura sem acoplamento financeiro", () => {
  const createDefinition = functionDefinition("criar_patrimonio_secure");
  const listDefinition = functionDefinition("listar_patrimonios_secure");

  for (const definition of [createDefinition, listDefinition]) {
    assert.match(definition, /public\.gestor_has_module\('patrimonio'\)/i);
    assert.match(definition, /public\.gestor_allowed_polo_ids\(\)/i);
    assert.doesNotMatch(definition, /public\.is_financeiro_for_polo/i);
    assert.match(definition, /set search_path = ''/i);
  }
  assert.match(listDefinition, /'ativos'/i);
  assert.match(
    listDefinition,
    /return public\.listar_patrimonios_v2_secure\(/i,
  );
});

Deno.test("edição é idempotente, concorrente e bloqueia reescrita econômica após perda", () => {
  const definition = functionDefinition("atualizar_patrimonio_secure");
  assert.ok(definition);
  assert.match(definition, /returns jsonb/i);
  assert.match(definition, /security definer[\s\S]*set search_path = ''/i);

  const authorization = definition.indexOf(
    "public.gestor_has_module('patrimonio')",
  );
  const replayLookup = definition.indexOf("evento.request_id = p_request_id");
  const rowLock = definition.indexOf("FOR UPDATE");
  assert.ok(authorization >= 0 && replayLookup > authorization);
  assert.ok(rowLock > replayLookup);

  assert.match(
    definition,
    /v_event\.tipo is distinct from 'edicao'[\s\S]*v_event\.payload is distinct from v_payload/i,
  );
  assert.match(
    definition,
    /evento\.company_id = v_company_id[\s\S]*evento\.polo_id = p_polo_id[\s\S]*evento\.request_id = p_request_id/i,
  );
  assert.match(
    definition,
    /updated_at is distinct from p_expected_updated_at[\s\S]*errcode = '40001'/i,
  );
  assert.match(
    definition,
    /quantidade_baixada > 0[\s\S]*data_aquisicao[\s\S]*quantidade[\s\S]*valor_unitario[\s\S]*não podem mudar após uma baixa/i,
  );
  assert.match(
    definition,
    /tipo\.company_id = v_company_id[\s\S]*tipo\.status = 'ativo'[\s\S]*tipo\.deleted_at is null/i,
  );
  assert.match(
    definition,
    /p_data_aquisicao > current_date[\s\S]*data de aquisição não pode estar no futuro/i,
  );
  assert.match(definition, /'edicao'/i);
});

Deno.test("baixa por perda é parcial, limitada ao saldo e efetiva por data", () => {
  const definition = functionDefinition("baixar_patrimonio_perda_secure");
  assert.ok(definition);
  assert.match(definition, /returns jsonb/i);
  assert.match(definition, /security definer[\s\S]*set search_path = ''/i);
  assert.match(definition, /for update/i);
  assert.match(
    definition,
    /p_data_baixa < v_existing\.data_aquisicao or p_data_baixa > current_date/i,
  );
  assert.match(
    definition,
    /p_quantidade_baixa > v_existing\.quantidade_disponivel/i,
  );
  assert.match(
    definition,
    /quantidade_baixada = patrimonio\.quantidade_baixada \+ p_quantidade_baixa/i,
  );
  assert.match(
    definition,
    /when patrimonio\.quantidade_baixada \+ p_quantidade_baixa = patrimonio\.quantidade[\s\S]*then 'baixado'[\s\S]*else 'ativo'/i,
  );
  assert.match(definition, /'baixa_perda'/i);
  assert.match(
    definition,
    /evento\.company_id = v_company_id[\s\S]*evento\.polo_id = p_polo_id[\s\S]*evento\.request_id = p_request_id/i,
  );
  assert.match(definition, /effective_on[\s\S]*p_data_baixa/i);
  assert.match(
    definition,
    /v_motivo not in \('perda', 'furto', 'dano', 'obsolescencia', 'outro'\)/i,
  );
  assert.match(
    definition,
    /v_motivo = 'outro' and v_observacao is null/i,
  );
  assert.doesNotMatch(
    definition,
    /set[\s\S]*observacao = coalesce\(v_observacao, patrimonio\.observacao\)/i,
  );
});

Deno.test("exclusão é global, lógica, retroativa e rejeita patrimônio com perda", () => {
  const definition = functionDefinition("excluir_patrimonio_secure");
  assert.ok(definition);
  assert.match(definition, /public\.is_gestor_global\(\)/i);
  assert.match(definition, /public\.gestor_has_module\('patrimonio'\)/i);
  assert.match(definition, /for update/i);
  assert.match(
    definition,
    /quantidade_baixada > 0[\s\S]*evento\.tipo = 'baixa_perda'/i,
  );
  assert.match(
    definition,
    /set[\s\S]*status = 'excluido',[\s\S]*ativo = false,[\s\S]*excluido_at = pg_catalog\.clock_timestamp\(\)/i,
  );
  assert.doesNotMatch(definition, /delete from public\.patrimonios/i);
  assert.match(definition, /'exclusao_cadastro'/i);
  assert.match(
    definition,
    /evento\.company_id = v_company_id[\s\S]*evento\.polo_id = p_polo_id[\s\S]*evento\.request_id = p_request_id/i,
  );
});

Deno.test("listagem v2 expõe ciclo completo e protege excluídos", () => {
  const definition = functionDefinition("listar_patrimonios_v2_secure");
  assert.ok(definition);
  assert.match(definition, /returns jsonb/i);
  assert.match(definition, /security definer[\s\S]*set search_path = ''/i);
  assert.match(definition, /v_status = 'todos'/i);
  assert.match(
    definition,
    /v_can_view_excluded or patrimonio\.status <> 'excluido'/i,
  );
  assert.match(
    definition,
    /somente gestor global pode consultar patrimônios excluídos/i,
  );

  const helper = functionDefinition("patrimonio_build_result_json");
  const fields = [
    "quantidade",
    "quantidade_original",
    "quantidade_baixada",
    "quantidade_disponivel",
    "valor_unitario",
    "valor_total",
    "valor_total_original",
    "valor_disponivel",
    "status",
    "can_edit_economic_fields",
    "can_write_off",
    "can_delete",
    "ultima_baixa_em",
    "ultima_baixa_motivo",
    "updated_at",
  ];
  for (const field of fields) {
    assert.match(helper, new RegExp(`'${field}'`, "i"));
  }
  assert.match(helper, /valor_unitario::text/i);
  assert.match(
    helper,
    /'quantidade', \(p_item\)\.quantidade[\s\S]*'quantidade_original', \(p_item\)\.quantidade/i,
  );
  assert.match(
    helper,
    /'valor_total', \(p_item\)\.valor_total::text[\s\S]*'valor_total_original', \(p_item\)\.valor_total::text/i,
  );
  assert.match(helper, /valor_total::text/i);
  assert.match(helper, /valor_patrimonial_ativo::text/i);
  assert.match(helper, /language sql[\s\S]*stable[\s\S]*set search_path = ''/i);
});

Deno.test("resumo Caixa calcula posição no fechamento sem compor resultado", () => {
  const definition = functionDefinition("get_caixa_patrimonio_resumo_secure");
  assert.ok(definition);
  assert.match(definition, /returns jsonb/i);
  assert.match(definition, /security definer[\s\S]*set search_path = ''/i);
  assert.match(definition, /public\.gestor_has_module\('caixa'\)/i);
  assert.match(definition, /public\.gestor_allowed_polo_ids\(\)/i);
  assert.doesNotMatch(definition, /public\.is_financeiro_for_polo/i);
  assert.match(
    definition,
    /v_inicio > date_trunc\('month', current_date\)::date[\s\S]*competência do resumo patrimonial não pode estar em mês futuro/i,
  );
  assert.match(definition, /evento\.effective_on <= v_fim/i);
  assert.match(definition, /patrimonio\.status <> 'excluido'/i);
  assert.match(
    definition,
    /patrimonio\.quantidade - coalesce\(perda\.quantidade_baixada, 0\)/i,
  );
  assert.match(definition, /'versao', 1/i);
  assert.match(definition, /'escopo_tipo'/i);
  assert.match(definition, /'escopo_tipo', 'GLOBAL'/i);
  assert.match(
    definition,
    /case when p_polo_id is null then 'GLOBAL' else 'POLO' end/i,
  );
  assert.match(definition, /'polo_id'/i);
  assert.match(definition, /'posicao_fechamento'/i);
  assert.match(definition, /'registros_ativos'/i);
  assert.match(definition, /'unidades_ativas'/i);
  assert.match(definition, /'valor_ativo_custo'/i);
  assert.match(definition, /'aquisicoes_competencia'/i);
  assert.match(definition, /'perdas_competencia'/i);
  assert.match(
    definition,
    /não altera saldo, entradas, saídas ou resultado operacional/i,
  );
  assert.match(
    definition,
    /não há fechamento patrimonial imutável[\s\S]*correções cadastrais retroativas[\s\S]*após a primeira baixa[\s\S]*permanecem bloqueados/i,
  );
  assert.match(
    sql,
    /comment on function public\.get_caixa_patrimonio_resumo_secure\(uuid, date\)[\s\S]*prestação patrimonial recalculável[\s\S]*correções cadastrais retroativas/i,
  );
});

Deno.test("patrimônio mantém Realtime de leitura e escrita somente por RPC", () => {
  assert.match(
    sql,
    /revoke all on table public\.patrimonios from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant select on table public\.patrimonios to authenticated/i,
  );
  assert.match(
    sql,
    /alter table public\.patrimonios replica identity full/i,
  );
  assert.match(
    sql,
    /alter publication supabase_realtime add table public\.patrimonios/i,
  );
  assert.match(
    sql,
    /create trigger patrimonios_emit_finance_realtime_event[\s\S]*after insert or update or delete on public\.patrimonios[\s\S]*execute function public\.emit_finance_realtime_event\(\)/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.patrimonios from service_role[\s\S]*grant select, insert, update on table public\.patrimonios to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant all on table public\.patrimonios to service_role/i,
  );
  assert.match(
    sql,
    /create policy patrimonio_select_scoped[\s\S]*gestor_has_module\('patrimonio'\)[\s\S]*gestor_allowed_polo_ids[\s\S]*status <> 'excluido' or public\.is_gestor_global\(\)/i,
  );
});

Deno.test("RPCs públicas usam search_path vazio e grants explícitos mínimos", () => {
  const signatures = [
    "criar_patrimonio_v2_secure\\(\\s*uuid, uuid, date, uuid, text, integer, numeric, text, text\\s*\\)",
    "criar_patrimonio_secure\\(\\s*uuid, uuid, date, text, text, integer, numeric, text, text\\s*\\)",
    "atualizar_patrimonio_secure\\(\\s*uuid, uuid, uuid, timestamptz, date, uuid, text, integer, numeric, text, text, text\\s*\\)",
    "baixar_patrimonio_perda_secure\\(\\s*uuid, uuid, uuid, timestamptz, date, integer, text, text\\s*\\)",
    "excluir_patrimonio_secure\\(\\s*uuid, uuid, uuid, timestamptz, text\\s*\\)",
    "listar_patrimonios_v2_secure\\(\\s*uuid, text, uuid, text, integer, integer\\s*\\)",
    "listar_patrimonios_secure\\(\\s*uuid, text, text, integer, integer\\s*\\)",
    "get_caixa_patrimonio_resumo_secure\\(uuid, date\\)",
  ];

  const rpcNames = [
    "criar_patrimonio_v2_secure",
    "criar_patrimonio_secure",
    "atualizar_patrimonio_secure",
    "baixar_patrimonio_perda_secure",
    "excluir_patrimonio_secure",
    "listar_patrimonios_v2_secure",
    "listar_patrimonios_secure",
    "get_caixa_patrimonio_resumo_secure",
  ];
  for (const name of rpcNames) {
    const definition = functionDefinition(name);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = ''/i);
    assert.match(definition, /auth\.jwt\(\) ->> 'role'/i);
    assert.doesNotMatch(definition, /auth\.role\(\)/i);
  }

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
