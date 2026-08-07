import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260730030210_allow_gestor_edit_open_diary_content.sql',
  import.meta.url,
);

Deno.test('Gestão e professor podem ajustar conteúdo somente com escrita acadêmica aberta', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const contentFunction = source.slice(
    source.indexOf('create or replace function public.atualizar_titulo_encontro_professor'),
    source.indexOf('create or replace function public.enforce_aulas_turma_role_boundaries'),
  );

  assert.match(contentFunction, /public\.can_write_academic_record_open/i);
  assert.match(contentFunction, /set titulo = v_titulo/i);
  assert.match(contentFunction, /char_length\(v_titulo\) > 1000/i);
  assert.doesNotMatch(contentFunction, /set[\s\S]{0,120}(data_aula|carga_horaria|sessao)\s*=/i);
});

Deno.test('Gestão pode informar conteúdo no planejamento canônico', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const boundaryFunction = source.slice(
    source.indexOf('create or replace function public.enforce_aulas_turma_role_boundaries'),
  );

  assert.match(boundaryFunction, /public\.can_operate_turma_academics/i);
  assert.match(boundaryFunction, /tg_op = 'INSERT'[\s\S]*nullif\(trim\(new\.titulo\), ''\) is not null/i);
  assert.match(boundaryFunction, /char_length\(trim\(new\.titulo\)\) <= 1000/i);
  assert.match(boundaryFunction, /new\.data_aula is not null/i);
  assert.match(boundaryFunction, /new\.sessao in \('M', 'T'\) and new\.carga_horaria = 4/i);
});

Deno.test('Professor continua sem poder alterar agenda e sessões', async () => {
  const source = await Deno.readTextFile(migrationUrl);
  const professorBoundary = source.slice(
    source.indexOf("if tg_op = 'UPDATE'\n    and public.is_professor_assigned_disciplina_open"),
  );

  assert.match(professorBoundary, /new\.data_aula is not distinct from old\.data_aula/i);
  assert.match(professorBoundary, /new\.carga_horaria is not distinct from old\.carga_horaria/i);
  assert.match(professorBoundary, /new\.sessao is not distinct from old\.sessao/i);
});
