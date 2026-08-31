import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260831133000_add_active_class_filter_to_receivables.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test('filtro de turma restringe página, grupos e resumo no mesmo contrato seguro', () => {
  for (const functionName of [
    'get_receivables_modality_page_v3_secure',
    'get_receivables_modality_groups_page_v3_secure',
    'get_receivables_modality_summary_v3_secure',
  ]) {
    const start = sql.indexOf(`FUNCTION public.${functionName}(`);
    assert.notEqual(start, -1, `RPC ${functionName} deve existir.`);
    const body = sql.slice(start, sql.indexOf('$function$;', start));

    assert.match(body, /p_turma_id uuid DEFAULT NULL/i);
    assert.match(body, /cr\.turma_id = p_turma_id/i);
    assert.match(body, /SECURITY DEFINER/i);
    assert.match(body, /SET search_path = ''/i);
    assert.match(body, /assert_receivables_filter_scope\(p_polo_id\)/i);
  }
});

Deno.test('as novas RPCs preservam privilégios mínimos e recarregam o schema PostgREST', () => {
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assert_receivables_filter_scope\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_receivables_modality_page_v3_secure[\s\S]*TO authenticated, service_role/i,
  );
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/i);
});
