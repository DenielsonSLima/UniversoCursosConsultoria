import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260822114500_authorize_course_management_kpis.sql",
  import.meta.url,
);
const classCountMigrationUrl = new URL(
  "../migrations/20260822114600_consolidate_authorized_technical_card_progress.sql",
  import.meta.url,
);
const courseCardUrl = new URL(
  "../../modules/gestor/cadastros/cursos-tecnicos/components/CursoTecnicoCard.tsx",
  import.meta.url,
);
const courseTypesUrl = new URL(
  "../../modules/gestor/cadastros/cadastros.types.ts",
  import.meta.url,
);
const courseContractUrl = new URL(
  "../../modules/gestor/cadastros/cursos-tecnicos/curso-tecnico-card.contract.ts",
  import.meta.url,
);
const classCardUrl = new URL(
  "../../modules/gestor/gestao/components/TurmaCard.tsx",
  import.meta.url,
);
const classMapperUrl = new URL(
  "../../modules/gestor/gestao/gestao.mappers.ts",
  import.meta.url,
);

const [
  sql,
  classCountSql,
  courseCard,
  courseTypes,
  courseContract,
  classCard,
  classMapper,
] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(classCountMigrationUrl),
  Deno.readTextFile(courseCardUrl),
  Deno.readTextFile(courseTypesUrl),
  Deno.readTextFile(courseContractUrl),
  Deno.readTextFile(classCardUrl),
  Deno.readTextFile(classMapperUrl),
]);
const compactSql = sql.replace(/\s+/g, " ").trim();
const compactClassCountSql = classCountSql.replace(/\s+/g, " ").trim();

Deno.test("RPC de cursos calcula o total de disciplinas no banco em uma consulta agregada", () => {
  assert.match(sql, /RETURNS TABLE \([\s\S]*?total_disciplinas bigint/i);
  assert.match(
    sql,
    /grade_kpis AS \([\s\S]*?count\(d\.id\)::bigint AS total_disciplinas[\s\S]*?FROM public\.modulos m[\s\S]*?JOIN public\.disciplinas d ON d\.modulo_id = m\.id[\s\S]*?GROUP BY m\.curso_id/i,
  );
  assert.match(sql, /coalesce\(gk\.total_disciplinas, 0\)::bigint/i);
  assert.match(sql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(
    sql,
    /public\.is_gestor_global\(\)[\s\S]*?public\.gestor_can_manage_curso_modalidade\(v_modalidade\)/i,
  );
  assert.match(
    compactSql,
    /REVOKE ALL ON FUNCTION public\.get_cursos_com_kpis\(text\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    compactSql,
    /GRANT EXECUTE ON FUNCTION public\.get_cursos_com_kpis\(text\) TO authenticated, service_role/i,
  );
});

Deno.test("card de curso somente apresenta o total retornado pela RPC", () => {
  assert.match(courseTypes, /total_disciplinas\?: number/);
  assert.match(courseContract, /total_disciplinas: number/);
  assert.match(
    courseContract,
    /Number\.isSafeInteger\(totalDisciplinas\)[\s\S]*?totalDisciplinas < 0/,
  );
  assert.match(courseCard, /`\$\{curso\.total_disciplinas\} disciplinas`/);
  assert.doesNotMatch(courseCard, /total_disciplinas \?\? 0/);
  assert.doesNotMatch(courseCard, /curso\.modulos/);
  assert.doesNotMatch(courseCard, /\.reduce\(/);
});

Deno.test("card de turma apresenta concluídas/total recebidos pelo RPC acadêmico", () => {
  assert.match(
    classCountSql,
    /get_gestao_turmas_academic_progress[\s\S]*?coalesce\(td\.concluida, false\) AS concluida[\s\S]*?FILTER \(WHERE p\.concluida\)::bigint AS disciplinas_concluidas/i,
  );
  assert.match(classCountSql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(classCountSql, /cardinality\(p_turma_ids\) = 0[\s\S]*?RETURN/i);
  assert.match(
    classCountSql,
    /public\.can_operate_turma_academics\(requested\.requested_id\)/i,
  );
  assert.match(
    compactClassCountSql,
    /REVOKE ALL ON FUNCTION public\.get_gestao_turmas_academic_progress\(uuid\[\]\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    compactClassCountSql,
    /GRANT EXECUTE ON FUNCTION public\.get_gestao_turmas_academic_progress\(uuid\[\]\) TO authenticated, service_role/i,
  );
  assert.match(
    compactClassCountSql,
    /REVOKE ALL ON FUNCTION public\.get_gestao_turmas_completion_counts\(uuid\[\]\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    compactClassCountSql,
    /GRANT EXECUTE ON FUNCTION public\.get_gestao_turmas_completion_counts\(uuid\[\]\) TO service_role/i,
  );
  assert.doesNotMatch(
    compactClassCountSql,
    /GRANT EXECUTE ON FUNCTION public\.get_gestao_turmas_completion_counts\(uuid\[\]\) TO authenticated/i,
  );
  assert.match(
    classMapper,
    /await supabase\.rpc\([\s\S]*?'get_gestao_turmas_academic_progress'[\s\S]*?totalDisciplinas[\s\S]*?disciplinasConcluidas/i,
  );
  assert.doesNotMatch(classMapper, /get_gestao_turmas_completion_counts/i);
  assert.match(classMapper, /typeof progress\.grade_concluida !== 'boolean'/i);
  assert.match(
    classCard,
    /disciplinasConcluidas !== undefined && totalDisciplinas !== undefined[\s\S]*?`\$\{disciplinasConcluidas\}\/\$\{totalDisciplinas\}`/,
  );
  assert.doesNotMatch(classCard, /disciplinasConcluidas\s*[+*%-]/);
});
