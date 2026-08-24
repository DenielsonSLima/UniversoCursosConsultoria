import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260823170500_fix_gestao_academic_progress_numeric_contract.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const compactSql = sql.replace(/\s+/g, " ").trim();

Deno.test("fotografia acadêmica preserva o contrato numeric da carga horária", () => {
  assert.match(
    sql,
    /RETURNS TABLE[\s\S]*?carga_horaria numeric,[\s\S]*?horas_realizadas numeric/i,
  );
  assert.match(
    sql,
    /d\.carga_horaria::numeric AS carga_horaria/i,
  );
  assert.match(
    sql,
    /da\.carga_horaria::numeric,[\s\S]*?da\.horas_realizadas::numeric/i,
  );
  assert.doesNotMatch(sql, /\bd\.carga_horaria\s*,/i);
});

Deno.test("RPC mantém validação do lote e autorização por turma", () => {
  assert.match(sql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(sql, /cardinality\(p_turma_ids\) = 0[\s\S]*?RETURN/i);
  assert.match(sql, /cardinality\(p_turma_ids\) > 200/i);
  assert.match(sql, /array_position\(p_turma_ids, NULL\) IS NOT NULL/i);
  assert.match(
    sql,
    /cardinality\(p_turma_ids\) <>[\s\S]*?count\(DISTINCT requested_id\)/i,
  );
  assert.match(
    sql,
    /coalesce\(auth\.role\(\), ''\) <> 'service_role'[\s\S]*?public\.can_operate_turma_academics\(requested\.requested_id\)/i,
  );
  assert.match(sql, /LEFT JOIN public\.turmas t[\s\S]*?WHERE t\.id IS NULL/i);
});

Deno.test("RPC continua fechada para público e anônimo", () => {
  assert.match(
    compactSql,
    /REVOKE ALL ON FUNCTION public\.get_gestao_turmas_academic_progress\(uuid\[\]\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    compactSql,
    /GRANT EXECUTE ON FUNCTION public\.get_gestao_turmas_academic_progress\(uuid\[\]\) TO authenticated, service_role/i,
  );
  assert.doesNotMatch(
    compactSql,
    /GRANT EXECUTE ON FUNCTION public\.get_gestao_turmas_academic_progress\(uuid\[\]\) TO (?:PUBLIC|anon)/i,
  );
  assert.match(
    compactSql,
    /COMMENT ON FUNCTION public\.get_gestao_turmas_academic_progress\(uuid\[\]\) IS 'Fotografia batch autorizada dos cards:/i,
  );
});
