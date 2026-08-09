import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809140000_repair_student_registration_voter_templates.sql",
  import.meta.url,
);

const voterTokens = [
  "{{ALUNO_TITULO_ELEITOR}}",
  "{{ALUNO_TITULO_ZONA}}",
  "{{ALUNO_TITULO_SECAO}}",
  "{{ALUNO_TITULO_EMISSAO}}",
  "{{ALUNO_TITULO_UF}}",
];

Deno.test("migration repara os três modelos pelo conteúdo eleitoral obrigatório", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  for (const token of voterTokens) {
    assert.ok(source.includes(token), `migration sem o token ${token}`);
  }

  assert.match(source, /where template\.id = 'ficha_cadastral_aluno'/i);
  assert.match(source, /where template\.id = 'pasta_identificacao_aluno'/i);
  assert.match(source, /from public\.modelos_fichas as model/i);
  assert.match(
    source,
    /when jsonb_typeof\(model\.template_config -> 'v'\) = 'number'[\s\S]*?or btrim\(coalesce\(model\.template_config ->> 'v', ''\)\) ~ '\^\[0-9\]\+\(\[\.\]\[0-9\]\+\)\?\$'[\s\S]*?then btrim\(model\.template_config ->> 'v'\)::numeric[\s\S]*?end < 12/i,
  );
  assert.ok(
    (source.match(/to_jsonb\(greatest\(/gi) || []).length >= 3,
    "versões dos três modelos devem avançar sem rebaixar versão futura",
  );
  assert.doesNotMatch(source, /->> 'v'\)::integer/i);
  assert.match(
    source,
    /v_existing_voter_block is not null[\s\S]*?v_missing_voter_fields := concat/i,
  );
  assert.match(
    source,
    /case when v_current_html not like '%\{\{ALUNO_TITULO_ZONA\}\}%'/i,
  );
  assert.doesNotMatch(
    source,
    /regexp_replace\([\s\S]{0,300}v_ficha_cadastral_block/i,
  );
});

Deno.test("migration preserva layout, customizações e emissões históricas", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /v_field ->> 'id' = 'pasta_documentos'[\s\S]*?v_field := v_field \|\| jsonb_build_object\('value', v_repaired_html\)/i,
  );
  assert.match(
    source,
    /v_field ->> 'id' = 'ficha_documentos'[\s\S]*?v_field := v_field \|\| jsonb_build_object\('value', v_repaired_html\)/i,
  );
  assert.doesNotMatch(
    source,
    /jsonb_build_object\('value', v_documents_block\)/i,
  );
  assert.match(
    source,
    /grid-template-columns\\s\*:[\s\S]*?1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/i,
  );
  assert.match(
    source,
    /titulo_eleitor_emissao_uf[\s\S]*?Emissão \/ UF[\s\S]*?ALUNO_TITULO_EMISSAO\}\} \/ \{\{ALUNO_TITULO_UF/i,
  );
  assert.match(source, /'x', 76,[\s\S]*?'y', 690,[\s\S]*?'height', 92/i);
  assert.match(source, /jsonb_set\(v_default_field, '\{y\}', '622'::jsonb\)/i);
  assert.match(
    source,
    /v_fields := v_fields \|\| jsonb_build_array\(v_default_field\)/i,
  );
  assert.doesNotMatch(source, /update\s+public\.documentos_validacao/i);
  assert.doesNotMatch(source, /update\s+public\.parceiros/i);
  assert.doesNotMatch(source, /campos_customizados\s*=/i);
  const pastaLock = source.indexOf(
    "where template.id = 'pasta_identificacao_aluno'\n  for update;",
  );
  const pastaAggregate = source.indexOf("for v_field in", pastaLock);
  const pastaUpdate = source.indexOf(
    "update public.documentos_templates as template",
    pastaAggregate,
  );
  assert.ok(pastaLock >= 0, "Pasta deve ser bloqueada antes do reparo");
  assert.ok(
    pastaAggregate > pastaLock,
    "aggregate da Pasta deve ocorrer após o lock",
  );
  assert.ok(
    pastaUpdate > pastaAggregate,
    "update da Pasta deve ocorrer após o reparo bloqueado",
  );
  assert.match(
    source,
    /from public\.modelos_fichas as model[\s\S]*?for update[\s\S]*?loop/i,
  );
  assert.match(source, /commit;\s*$/i);
});
