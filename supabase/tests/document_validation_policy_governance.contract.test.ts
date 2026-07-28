// @ts-nocheck -- contrato executado pelo Deno, fora do runtime TypeScript da aplicação.

const migrationUrl = new URL(
  "../migrations/20260728051701_realtime_document_validation_policy_governance.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  assert(pattern.test(value), message);
}

Deno.test("políticas têm SELECT autenticado com RLS e nenhuma policy de escrita", () => {
  assertMatch(
    sql,
    /create policy "gestores_consultam_politicas_validacao"[\s\S]*for select\s+to authenticated[\s\S]*gestor_has_any_module\([\s\S]*'cadastros', 'secretaria'/,
    "SELECT precisa ser limitado por módulo autorizado",
  );
  for (const action of ["insert", "update", "delete", "write"]) {
    assertMatch(
      sql,
      new RegExp(
        `drop policy if exists "portal_documentos_validacao_politicas_${action}"`,
      ),
      `policy legada de ${action} precisa ser removida`,
    );
  }
  assertMatch(
    sql,
    /revoke all on table public\.documentos_validacao_politicas\s+from public, anon, authenticated/,
    "privilégios amplos precisam ser revogados antes do SELECT mínimo",
  );
  assertMatch(
    sql,
    /grant select on table public\.documentos_validacao_politicas\s+to authenticated/,
    "authenticated precisa de SELECT para receber eventos autorizados",
  );
  assert(
    !/grant (insert|update|delete|all)[\s\S]*documentos_validacao_politicas/i.test(sql),
    "migration não pode conceder escrita direta nas políticas",
  );
});

Deno.test("Realtime publica só a política e remove o histórico bruto", () => {
  assertMatch(
    sql,
    /from pg_publication_tables[\s\S]*tablename = 'documentos_validacao_politicas'/,
    "membership da política precisa consultar pg_publication_tables",
  );
  assertMatch(
    sql,
    /alter publication supabase_realtime\s+add table public\.documentos_validacao_politicas\s*;/,
    "política vigente precisa entrar na publicação",
  );
  assertMatch(
    sql,
    /if exists \([\s\S]*tablename = 'documentos_validacao_politicas_historico'[\s\S]*alter publication supabase_realtime\s+drop table public\.documentos_validacao_politicas_historico/,
    "histórico pré-publicado precisa ser removido de forma idempotente",
  );
  assert(
    !/add table public\.documentos_validacao_politicas_historico/i.test(sql),
    "histórico bruto não pode entrar no Realtime",
  );
  assert(
    !/when duplicate_object/i.test(sql),
    "idempotência não pode engolir duplicate_object",
  );
  assertMatch(
    sql,
    /documentos_validacao_politicas\s+replica identity using index documentos_validacao_politicas_pkey/,
    "UPDATE/DELETE de política precisa identificar documento pela PK",
  );
  assert(
    !/replica identity full\s*;/i.test(sql),
    "linhas antigas completas não podem ser publicadas",
  );
});

Deno.test("RPC de histórico é privada, audit-safe e ordenada", () => {
  const rpcStart = sql.indexOf(
    "public.listar_historico_politica_validacao_documento(p_documento text)",
  );
  const rpcEnd = sql.indexOf("$function$;", rpcStart);
  assert(rpcStart >= 0 && rpcEnd > rpcStart, "RPC de histórico ausente");
  const rpc = sql.slice(rpcStart, rpcEnd);

  for (const field of [
    "documento",
    "versao",
    "prefixo",
    "campos_publicos",
    "consulta_publica_ativa",
    "validacao_publica",
    "validade_dias",
    "ator_role",
    "motivo",
    "created_at",
  ]) {
    assertMatch(
      rpc,
      new RegExp(`\\b${field}\\b`),
      `campo audit-safe ausente: ${field}`,
    );
  }
  assert(
    !/\bator_id\b/.test(rpc),
    "RPC não pode expor ator_id",
  );
  assertMatch(
    rpc,
    /coalesce\(\(select auth\.role\(\)\), ''\) <> 'service_role'[\s\S]*gestor_has_any_global_module/,
    "RPC precisa exigir service_role ou gestor global autorizado",
  );
  assertMatch(
    rpc,
    /order by history\.versao desc, history\.created_at desc/,
    "histórico precisa retornar a versão mais nova primeiro",
  );
  assertMatch(
    sql,
    /revoke all on function\s+public\.listar_historico_politica_validacao_documento\(text\)\s+from public, anon/,
    "RPC não pode ser executada por anon/public",
  );
  assertMatch(
    sql,
    /grant execute on function\s+public\.listar_historico_politica_validacao_documento\(text\)\s+to authenticated, service_role/,
    "RPC deve ser concedida só a authenticated/service_role",
  );
});

Deno.test("P2 preserva histórico append-only e remove toda policy de leitura bruta", () => {
  assert(
    !/drop trigger if exists trg_bloquear_mutacao_historico_politica_validacao/i
      .test(sql),
    "P2 não pode remover proteção append-only",
  );
  assert(
    !/create\s+policy\s+(?:"[^"]+"|\S+)\s+on\s+public\.documentos_validacao_politicas_historico/i
      .test(sql),
    "P2 não pode criar policy de leitura do histórico bruto",
  );
  assertMatch(
    sql,
    /drop policy if exists "gestores_consultam_historico_politicas_validacao"\s+on public\.documentos_validacao_politicas_historico/,
    "P2 precisa remover a policy latente do histórico bruto",
  );
  assert(
    !/grant (insert|update|delete|all)[\s\S]*documentos_validacao_politicas_historico/i
      .test(sql),
    "histórico não pode receber grants de escrita",
  );
  assertMatch(
    sql,
    /revoke all on table public\.documentos_validacao_politicas_historico\s+from public, anon, authenticated/,
    "authenticated não pode consultar o histórico bruto por PostgREST",
  );
  assert(
    !/grant select on table public\.documentos_validacao_politicas_historico\s+to authenticated/i
      .test(sql),
    "SELECT direto do histórico não pode ser restaurado para authenticated",
  );
  assertMatch(
    sql,
    /grant select on table public\.documentos_validacao_politicas_historico\s+to service_role/,
    "service_role pode manter leitura interna para auditoria",
  );
  assert(
    !/to anon\b/.test(
      sql.slice(
        sql.indexOf("listar_historico_politica_validacao_documento"),
      ),
    ),
    "nenhum caminho do histórico deve ser concedido a anon",
  );
});
