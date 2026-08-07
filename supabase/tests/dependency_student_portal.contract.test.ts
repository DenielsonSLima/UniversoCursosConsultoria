import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migrationUrl = new URL(
  "../migrations/20260731022635_expose_dependency_results_to_student_portal.sql",
  import.meta.url,
);
const queryKeysUrl = new URL(
  "../../modules/aluno/shared/aluno-course-access.queries.ts",
  import.meta.url,
);
const turmasDataUrl = new URL(
  "../../modules/aluno/turmas/hooks/useAlunoTurmasData.ts",
  import.meta.url,
);
const documentDefinitionsUrl = new URL(
  "../../modules/gestor/secretaria/shared/secretaria-documentos.definitions.ts",
  import.meta.url,
);
const academicResultsServiceUrl = new URL(
  "../../modules/shared/secretaria/academic-results.service.ts",
  import.meta.url,
);

Deno.test("acesso histórico inclui EM_DEPENDENCIA somente na turma original", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /create or replace function public\.is_aluno_matriculado_turma/i,
  );
  assert.match(
    source,
    /matricula\.turma_id = p_turma_id[\s\S]*matricula\.aluno_id[\s\S]*turma\.status = 'FINALIZADA'[\s\S]*'EM_DEPENDENCIA'/i,
  );
  assert.doesNotMatch(source, /insert into public\.matriculas/i);
});

Deno.test("RPC do aluno conserva uma linha por componente original", async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const start = source.search(
    /create or replace function public\.get_aluno_diario_resultados/i,
  );
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);

  assert.match(
    functionSource,
    /where matricula\.turma_id = p_turma_id[\s\S]*matricula\.aluno_id = v_aluno_id/i,
  );
  assert.match(
    functionSource,
    /internal_academic\.get_enrollment_results\([\s\S]*v_matricula_id/i,
  );
  assert.match(
    functionSource,
    /componente\.matricula_id = v_matricula_id/i,
  );
  assert.match(
    functionSource,
    /tentativa\.id = componente\.tentativa_aprovada_id/i,
  );
  assert.doesNotMatch(functionSource, /insert into public\.matriculas/i);
  assert.doesNotMatch(
    functionSource,
    /join public\.matriculas[^;]*tentativa\.turma_id/i,
  );
});

Deno.test("resultado vencedor usa somente o diário exato da dependência", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /notas\.turma_id = tentativa\.turma_id[\s\S]*notas\.disciplina_id = tentativa\.disciplina_id[\s\S]*notas\.aluno_id = v_aluno_id/i,
  );
  assert.match(
    source,
    /frequencia\.turma_id = tentativa\.turma_id[\s\S]*frequencia\.disciplina_id = tentativa\.disciplina_id[\s\S]*frequencia\.aluno_id = v_aluno_id/i,
  );
  assert.match(
    source,
    /then 'APROVADO_DEPENDENCIA'/i,
  );
  assert.match(
    source,
    /portal do aluno: mantém a turma original,[\s\S]*sinaliza APROVADO_DEPENDENCIA sem alterar o resultado acadêmico canônico/i,
  );
});

Deno.test("retorno ao Portal invalida todas as consultas acadêmicas do aluno", async () => {
  const [keysSource, turmasSource] = await Promise.all([
    Deno.readTextFile(queryKeysUrl),
    Deno.readTextFile(turmasDataUrl),
  ]);

  assert.match(
    keysSource,
    /technicalAcademicRoot:[\s\S]*\['aluno-turma-technical-academic', alunoId\]/i,
  );
  assert.match(
    keysSource,
    /technicalAcademicRoot\(alunoId\)[\s\S]*bulletinModulesRoot\(alunoId\)[\s\S]*bulletinResultsRoot\(alunoId\)[\s\S]*exact: false[\s\S]*refetchType: 'active'/i,
  );
  assert.match(
    turmasSource,
    /queryKey: alunoCourseAccessKeys\.technicalAcademic\(/i,
  );
});

Deno.test("Secretaria permite boletim e histórico durante a dependência", async () => {
  const definitions = await Deno.readTextFile(documentDefinitionsUrl);
  const bulletinStart = definitions.indexOf("boletim: {");
  const bulletinEnd = definitions.indexOf("atestadoConclusao:", bulletinStart);
  const bulletin = definitions.slice(bulletinStart, bulletinEnd);
  const historyStart = definitions.indexOf("historicoEscolar: {");
  const historyEnd = definitions.indexOf("crachaEstagio:", historyStart);
  const history = definitions.slice(historyStart, historyEnd);

  assert.match(bulletin, /enrollmentStatuses:[\s\S]*'EM_DEPENDENCIA'/i);
  assert.doesNotMatch(bulletin, /activeEnrollmentOnly:\s*true/i);
  assert.doesNotMatch(bulletin, /activeTurmaOnly:\s*true/i);
  assert.match(history, /enrollmentStatuses:[\s\S]*'EM_DEPENDENCIA'/i);
});

Deno.test("boletim gerenciado consome o resultado acadêmico canônico", async () => {
  const service = await Deno.readTextFile(academicResultsServiceUrl);
  const start = service.indexOf("async getForManagedEnrollment(");
  const managedMethod = service.slice(start);

  assert.match(
    managedMethod,
    /get_secretaria_documento_academico/i,
  );
  assert.match(managedMethod, /p_matricula_id: matriculaId/i);
  assert.doesNotMatch(managedMethod, /get_diario_resultados/i);
  assert.match(service, /dependencyAttemptId[\s\S]*APROVADO_DEPENDENCIA/i);
});
