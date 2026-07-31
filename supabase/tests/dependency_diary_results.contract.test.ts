import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260731014843_integrate_dependency_diary_results.sql",
  import.meta.url,
);

Deno.test("dependência libera somente a oferta exata no diário", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function internal_academic\.is_dependency_student_in_diary/i,
  );
  assert.match(
    source,
    /tentativa\.turma_id = p_turma_id[\s\S]*tentativa\.disciplina_id = p_disciplina_id/i,
  );
  assert.match(
    source,
    /p_write[\s\S]*tentativa\.status in \('LIBERADA', 'EM_CURSO'\)/i,
  );
  assert.match(
    source,
    /create or replace function internal_academic\.can_write_student_in_diary[\s\S]*is_dependency_student_in_diary/i,
  );
  assert.doesNotMatch(
    source,
    /insert into public\.matriculas[\s\S]*depend[eê]ncia/i,
  );
});

Deno.test("pagamento apenas libera a tentativa e não pré-cria diário", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.release_dependency_on_payment/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(functionSource, /new\.status[\s\S]*'PAGO'/i);
  assert.match(functionSource, /new\.tipo_lancamento[\s\S]*'DEPENDENCIA'/i);
  assert.match(
    functionSource,
    /status = 'LIBERADA'[\s\S]*status = 'AGUARDANDO_PAGAMENTO'/i,
  );
  assert.doesNotMatch(functionSource, /insert into public\.diario_/i);
  assert.doesNotMatch(functionSource, /insert into public\.matriculas/i);
});

Deno.test("fechamento total registra resultado e vencedor canônico", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function internal_academic\.finalize_dependency_attempts_for_diary/i,
  );
  assert.match(
    source,
    /p1_get_diario_resultados_20260719[\s\S]*status = v_status[\s\S]*resultado_destino = v_result\.resultado_final/i,
  );
  assert.match(
    source,
    /status = 'APROVADO'[\s\S]*tentativa_aprovada_id = v_attempt\.id/i,
  );
  assert.match(
    source,
    /p_bloqueio = 'TOTAL'[\s\S]*finalize_dependency_attempts_for_diary/i,
  );
  assert.match(
    source,
    /p_bloqueio = 'TOTAL'[\s\S]*tentativa\.status = 'AGUARDANDO_PAGAMENTO'[\s\S]*ainda não pode ser encerrado/i,
  );
  assert.match(
    source,
    /tentativa\.status in \([\s\S]*'AGUARDANDO_PAGAMENTO'[\s\S]*'LIBERADA'[\s\S]*'EM_CURSO'[\s\S]*\)[\s\S]*for update/i,
  );
  assert.match(
    source,
    /resultado_final not in \([\s\S]*'APROVADO'[\s\S]*'APROVEITADO'[\s\S]*'REPROVADO'[\s\S]*'REPROVADO_FREQUENCIA'[\s\S]*resultado não terminal/i,
  );
  assert.match(
    source,
    /'RESULTADO_REABERTO'[\s\S]*resultadoDestino/i,
  );
});

Deno.test("resultado canônico substitui a reprovação sem duplicar componente", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.get_enrollment_results/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /from internal_academic\.p1_get_enrollment_results_20260730/i,
  );
  assert.match(
    functionSource,
    /left join dependencia_aprovada[\s\S]*on dependencia\.disciplina_id = origem\.disciplina_id/i,
  );
  assert.match(
    functionSource,
    /when dependencia\.disciplina_id is not null then 'APROVADO'/i,
  );
  assert.doesNotMatch(functionSource, /union all/i);
});

Deno.test("conclusão espera todas as dependências e preserva estágio", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function internal_academic\.final_enrollment_status/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /bool_and[\s\S]*'APROVADO'[\s\S]*'APROVEITADO'/i,
  );
  assert.match(functionSource, /matriculas_estagios/i);
  assert.match(
    functionSource,
    /then 'CONCLUIDO'[\s\S]*then 'EM_DEPENDENCIA'/i,
  );
  assert.match(source, /'MATRICULA_CONCLUIDA'/i);
  assert.match(
    source,
    /old\.status = 'EM_DEPENDENCIA'[\s\S]*new\.status = 'CONCLUIDO'/i,
  );
});

Deno.test("boletim exibe uma linha aprovada em dependência com metadados", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.get_secretaria_documento_academico/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(functionSource, /'Aprovado em dependência'/i);
  assert.match(functionSource, /'dependencyAttemptId'/i);
  assert.match(functionSource, /'dependencyClassId'/i);
  assert.match(
    functionSource,
    /join public\.turmas_disciplinas oferta[\s\S]*oferta\.turma_id = matricula\.turma_id/i,
  );
});

Deno.test("workspace conserva tentativas encerradas e regras financeiras", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.get_secretaria_dependencias_workspace_secure/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /order by[\s\S]*tentativa_ordenada\.numero_tentativa desc/i,
  );
  assert.doesNotMatch(
    functionSource,
    /tentativa_ordenada\.status in \('AGUARDANDO_PAGAMENTO', 'LIBERADA', 'EM_CURSO'\)/i,
  );
  assert.match(functionSource, /'regras_financeiras'/i);
  assert.match(functionSource, /'tentativaStatus'/i);
  assert.match(functionSource, /'cobranca_status'/i);
  assert.doesNotMatch(functionSource, /gateway_bank_slip_url/i);
});
