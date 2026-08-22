import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const privateKeysUrl = new URL(
  "../migrations/20260822114000_create_private_ead_answer_keys.sql",
  import.meta.url,
);
const coreUrl = new URL(
  "../migrations/20260822114100_lock_ead_completion_enrollment.sql",
  import.meta.url,
);
const feedbackUrl = new URL(
  "../migrations/20260822114200_add_authoritative_ead_assessment_feedback.sql",
  import.meta.url,
);
const mutationsUrl = new URL(
  "../migrations/20260822114300_serialize_ead_assessment_mutations.sql",
  import.meta.url,
);
const sanitizeUrl = new URL(
  "../migrations/20260822114400_sanitize_public_ead_configs.sql",
  import.meta.url,
);
const managementUrl = new URL(
  "../migrations/20260822114500_authorize_course_management_kpis.sql",
  import.meta.url,
);

const [privateKeys, core, feedback, mutations, sanitize, management] =
  await Promise.all([
    Deno.readTextFile(privateKeysUrl),
    Deno.readTextFile(coreUrl),
    Deno.readTextFile(feedbackUrl),
    Deno.readTextFile(mutationsUrl),
    Deno.readTextFile(sanitizeUrl),
    Deno.readTextFile(managementUrl),
  ]);

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

Deno.test("gabaritos ficam no schema privado sem ACL para papéis da API", () => {
  assert.match(
    privateKeys,
    /CREATE TABLE internal_academic\.ead_assessment_answer_keys/i,
  );
  assert.match(
    privateKeys,
    /course_id uuid PRIMARY KEY[\s\S]*?REFERENCES public\.cursos\(id\) ON DELETE CASCADE/i,
  );
  assert.match(
    compact(privateKeys),
    /REVOKE ALL ON TABLE internal_academic\.ead_assessment_answer_keys FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    privateKeys,
    /INSERT INTO internal_academic\.ead_assessment_answer_keys[\s\S]*?FROM public\.cursos c/i,
  );
  assert.doesNotMatch(
    privateKeys,
    /GRANT\s+(SELECT|ALL).*ead_assessment_answer_keys/i,
  );
});

Deno.test("normalização aceita aliases compatíveis e rejeita conflitos ou faixas inválidas", () => {
  for (
    const alias of [
      "respostaCorreta",
      "resposta_correta",
      "correctAnswer",
      "correct_answer",
      "gabarito",
    ]
  ) {
    assert.match(privateKeys, new RegExp(`'${alias}'`));
  }
  assert.match(privateKeys, /Aliases de gabarito conflitantes no mesmo item/i);
  assert.match(privateKeys, /v_seen_activities \? v_id/i);
  assert.match(privateKeys, /v_seen_questions \? v_id/i);
  assert.match(
    privateKeys,
    /Toda atividade EAD precisa de título e enunciado/i,
  );
  assert.match(
    privateKeys,
    /v_answer::numeric >= jsonb_array_length\(v_options\)/i,
  );
});

Deno.test("restauração gestora devolve respostaCorreta como JSON number canônico", () => {
  assert.match(
    privateKeys,
    /to_jsonb\(\(p_activity_answers ->> v_id\)::integer\)/i,
  );
  assert.match(
    privateKeys,
    /to_jsonb\(\(p_quiz_answers ->> v_id\)::integer\)/i,
  );
  assert.doesNotMatch(
    privateKeys,
    /to_jsonb\(p_(?:activity|quiz)_answers ->> v_id\)/i,
  );
});

Deno.test("payload armazenado em cursos é sanitizado em carga atual e em toda escrita futura", () => {
  assert.match(
    privateKeys,
    /v_item - 'respostaCorreta' - 'resposta_correta'[\s\S]*?- 'correctAnswer' - 'correct_answer' - 'gabarito'/i,
  );
  assert.match(
    sanitize,
    /CREATE TRIGGER secure_ead_course_config[\s\S]*?BEFORE INSERT OR UPDATE OF ead_config, modalidade/i,
  );
  assert.match(
    sanitize,
    /v_collected := internal_academic\.ead_collect_assessment_answer_keys/i,
  );
  assert.match(
    sanitize,
    /NEW\.ead_config := internal_academic\.ead_sanitize_assessment_config/i,
  );
  assert.match(
    sanitize,
    /UPDATE public\.cursos[\s\S]*?WHERE modalidade = 'EAD'/i,
  );
});

Deno.test("gestor recupera configuração canônica somente por RPC batch autorizada", () => {
  assert.match(
    sanitize,
    /get_ead_course_configs_for_management\([\s\S]*?p_course_ids uuid\[\]/i,
  );
  assert.match(sanitize, /cardinality\(p_course_ids\) > 200/i);
  assert.match(
    sanitize,
    /public\.is_gestor_global\(\)[\s\S]*?public\.gestor_can_manage_curso_modalidade\('EAD'\)/i,
  );
  assert.match(sanitize, /internal_academic\.ead_restore_assessment_answers/i);
  assert.match(
    compact(sanitize),
    /REVOKE ALL ON FUNCTION public\.get_ead_course_configs_for_management\(uuid\[\]\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(management, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(
    management,
    /public\.is_gestor_global\(\)[\s\S]*?public\.gestor_can_manage_curso_modalidade\(v_modalidade\)/i,
  );
  assert.match(
    management,
    /WHEN c\.modalidade = 'EAD' THEN internal_academic\.ead_restore_assessment_answers/i,
  );
});

Deno.test("feedback autoritativo só contém correção depois da submissão persistida", () => {
  assert.match(
    feedback,
    /CREATE FUNCTION internal_academic\.ead_assessment_feedback/i,
  );
  assert.match(feedback, /NOT \(v_saved_activities \? v_id\)[\s\S]*?CONTINUE/i);
  assert.match(
    feedback,
    /'submitted', true[\s\S]*?'selectedIndex'[\s\S]*?'correctIndex'[\s\S]*?'isCorrect'/i,
  );
  assert.match(
    feedback,
    /v_quiz_submitted := v_progress \? 'lastQuizScoreAt'/i,
  );
  assert.match(
    feedback,
    /'submitted', v_quiz_submitted[\s\S]*?'score'[\s\S]*?'passed'[\s\S]*?'results'/i,
  );
  assert.match(
    feedback,
    /RETURN v_result \|\| jsonb_build_object\([\s\S]*?'assessmentFeedback'/i,
  );
  assert.match(
    compact(feedback),
    /REVOKE ALL ON FUNCTION public\.ead_get_aluno_progress_core_20260822\(uuid, uuid\) FROM PUBLIC, anon, authenticated, service_role/i,
  );
});

Deno.test("mutação trava matrícula antes do progresso e do curso", () => {
  const enrollmentLock = mutations.indexOf("FOR UPDATE OF m");
  const progressLock = mutations.indexOf("FROM public.ead_aluno_progresso ep");
  const courseLock = mutations.indexOf("FOR SHARE OF c, k");
  assert.ok(enrollmentLock > 0);
  assert.ok(progressLock > enrollmentLock);
  assert.ok(courseLock > progressLock);
  assert.match(
    mutations,
    /v_matricula_status <> 'ATIVO'[\s\S]*?ead_progress_meets_completion/i,
  );
  assert.match(
    mutations,
    /PERFORM internal_academic\.ead_collect_assessment_answer_keys/i,
  );
  assert.match(
    mutations,
    /SELECT count\(\*\) FROM jsonb_each\(v_answers\)[\s\S]*?v_questions_total/i,
  );
  assert.match(mutations, /quizAnswers'[\s\S]*?IS DISTINCT FROM v_answers/i);
});

Deno.test("núcleo conclui somente estado ATIVO e verifica o efeito da atualização", () => {
  assert.match(core, /internal_academic\.ead_restore_assessment_answers/i);
  assert.match(core, /LIMIT 1[\s\S]*?FOR UPDATE OF m/i);
  assert.match(core, /upper\(coalesce\(status, ''\)\) = 'ATIVO'/i);
  assert.match(core, /GET DIAGNOSTICS v_updated_rows = ROW_COUNT/i);
  assert.match(core, /v_updated_rows <> 1[\s\S]*?ERRCODE = '40001'/i);
  assert.match(
    compact(core),
    /REVOKE ALL ON FUNCTION public\.ead_update_aluno_progress_core_20260822\( uuid, uuid, text, text, jsonb \) FROM PUBLIC, anon, authenticated, service_role/i,
  );
});

Deno.test("replay de conclusão de conteúdo e vídeo é monotônico", () => {
  assert.match(
    core,
    /completedContentIds'[\s\S]*?\? p_item_id[\s\S]*?RETURN public\.ead_get_aluno_progress/i,
  );
  assert.match(
    core,
    /completedVideoIds'[\s\S]*?\? p_item_id[\s\S]*?RETURN public\.ead_get_aluno_progress/i,
  );
});
