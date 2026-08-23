import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260822103822_harden_ead_assessment_mutations.sql',
  import.meta.url,
);
const activitiesPanelUrl = new URL(
  '../../modules/aluno/cursos/components/EadActivitiesPanel.tsx',
  import.meta.url,
);
const quizPanelUrl = new URL(
  '../../modules/aluno/cursos/components/EadQuizPanel.tsx',
  import.meta.url,
);
const coursesPageUrl = new URL(
  '../../modules/aluno/cursos/CursosPage.tsx',
  import.meta.url,
);

const [sql, activitiesPanel, quizPanel, coursesPage] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(activitiesPanelUrl),
  Deno.readTextFile(quizPanelUrl),
  Deno.readTextFile(coursesPageUrl),
]);
const compactSql = sql.replace(/\s+/g, ' ').trim();

Deno.test('RPC EAD pública encapsula o núcleo e fecha a execução direta', () => {
  assert.match(
    compactSql,
    /ALTER FUNCTION public\.ead_update_aluno_progress\(uuid, uuid, text, text, jsonb\) RENAME TO ead_update_aluno_progress_core_20260822/i,
  );
  assert.match(
    compactSql,
    /ALTER FUNCTION public\.ead_update_aluno_progress_core_20260822\(uuid, uuid, text, text, jsonb\) SET search_path = ''/i,
  );
  assert.match(
    compactSql,
    /REVOKE ALL ON FUNCTION public\.ead_update_aluno_progress_core_20260822\(uuid, uuid, text, text, jsonb\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(sql, /CREATE FUNCTION public\.ead_update_aluno_progress\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(
    compactSql,
    /REVOKE ALL ON FUNCTION public\.ead_update_aluno_progress\(uuid, uuid, text, text, jsonb\) FROM PUBLIC, anon/i,
  );
  assert.match(
    compactSql,
    /GRANT EXECUTE ON FUNCTION public\.ead_update_aluno_progress\(uuid, uuid, text, text, jsonb\) TO authenticated, service_role/i,
  );
});

Deno.test('atividade usa lock, identificador canônico e conclusão idempotente', () => {
  assert.match(sql, /FROM public\.ead_aluno_progresso ep[\s\S]*?FOR UPDATE/i);
  assert.match(sql, /FROM public\.cursos c[\s\S]*?FOR SHARE/i);
  assert.match(sql, /'complete_activity'/);
  assert.match(sql, /completedActivityIds[\s\S]*?RETURN public\.ead_get_aluno_progress/i);
  assert.match(sql, /O toggle legado passa a compartilhar a semântica monotônica\/idempotente/);
  assert.match(sql, /v_action := 'toggle_activity'/);
  assert.match(sql, /resposta objetiva da atividade EAD é inválida/i);
  assert.match(sql, /atividade só pode ser concluída após a resposta correta/i);
  assert.match(activitiesPanel, /updateProgress\('complete_activity', activityId\)/);
  assert.doesNotMatch(activitiesPanel, /updateProgress\('toggle_activity'/);
});

Deno.test('prova exige configuração e conjunto exato antes da correção autoritativa', () => {
  assert.match(sql, /v_questions_total < 10/);
  assert.match(sql, /GROUP BY question ->> 'id'[\s\S]*?HAVING count\(\*\) > 1/i);
  assert.match(sql, /jsonb_array_length\(question -> 'opcoes'\) < 2/i);
  assert.match(sql, /question ->> 'respostaCorreta'[\s\S]*?\^\(0\|\[1-9\]\[0-9\]\*\)\$/i);
  assert.match(sql, /SELECT count\(\*\) FROM jsonb_each\(v_answers\)[\s\S]*?v_questions_total/i);
  assert.match(sql, /WHERE NOT \(v_answers \? \(question ->> 'id'\)\)/i);
  assert.match(sql, /answer_entry\.value #>> '\{\}'[\s\S]*?jsonb_array_length\(question -> 'opcoes'\)/i);
  assert.match(sql, /length\(answer_entry\.value #>> '\{\}'\) > 10/i);
  assert.match(
    sql,
    /ead_progress_meets_completion\(v_progress, v_course_config\)[\s\S]*?quizAnswers[\s\S]*?IS DISTINCT FROM v_answers[\s\S]*?RETURN public\.ead_get_aluno_progress/i,
  );
  assert.match(sql, /RETURN public\.ead_update_aluno_progress_core_20260822\(/i);
  assert.match(quizPanel, /getEadQuizSubmissionAnswers\(randomizedQuizQuestions, quizAnswers\)/);
});

Deno.test('guardas de identidade e leitura segura permanecem no contrato', () => {
  assert.match(sql, /auth\.role\(\)[\s\S]*?public\.current_aluno_id\(\) IS DISTINCT FROM p_aluno_id/i);
  assert.match(sql, /PERFORM public\.ead_get_aluno_progress\(p_aluno_id, p_curso_id\)/i);
  assert.match(
    compactSql,
    /ALTER FUNCTION public\.ead_get_aluno_progress\(uuid, uuid\) SET search_path = ''/i,
  );
});

Deno.test('sala EAD e rascunhos permanecem vinculados ao aluno e curso atuais', () => {
  assert.match(coursesPage, /selectedCourseContext\?\.alunoId === selectedCourseOwnerId/);
  assert.match(coursesPage, /setSelectedCourseContext\(course \? \{ alunoId: selectedCourseOwnerId, course \} : null\)/);
  assert.match(coursesPage, /setSelectedCourseContext\(null\)[\s\S]*?initialCheckoutCourseRef\.current = null/);
  assert.match(coursesPage, /updatedCourse[\s\S]*?!hasEadAccess\(updatedCourse\)[\s\S]*?setSelectedCourse\(null\)/);
  assert.match(activitiesPanel, /progressContextKey \|\| selectedCourse\?\.id/);
});
