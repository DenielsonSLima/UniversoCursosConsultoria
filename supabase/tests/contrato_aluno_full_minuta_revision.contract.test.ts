import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../migrations/20260809210000_create_full_technical_contract_draft.sql',
  import.meta.url,
);
const paginationFixUrl = new URL(
  '../migrations/20260809211000_fix_full_technical_contract_v3_pagination.sql',
  import.meta.url,
);
const closingMergeUrl = new URL(
  '../migrations/20260810093000_merge_full_contract_closing_when_safe.sql',
  import.meta.url,
);
const sevenPagePaginationUrl = new URL(
  '../migrations/20260810095500_compact_full_contract_to_seven_pages.sql',
  import.meta.url,
);

const readMigration = () => readFile(migrationUrl, 'utf8');

const readCanonicalBody = async () => {
  const migration = await readMigration();
  const match = migration.match(/'corpo', \$minuta\$\n([\s\S]*?)\n\$minuta\$,/u);
  assert.ok(match, 'corpo canônico da minuta não localizado');
  return match[1];
};

test('nova minuta técnica nasce como revisão jurídica, nunca como aprovação automática', async () => {
  const migration = await readMigration();
  assert.match(migration, /set revisao = 4,\s+status = 'EM_REVISAO'/u);
  assert.match(migration, /'TECNICO',\s+4,\s+'EM_REVISAO'/u);
  assert.doesNotMatch(migration, /insert into public\.documentos_modelos_aprovacoes/iu);
});

test('corpo reconciliado preserva a estrutura integral e usa dados canônicos', async () => {
  const body = await readCanonicalBody();
  const clauses = new Set(
    [...body.matchAll(/CLÁUSULA\s+(\d+)ª/gu)].map((match) => Number(match[1])),
  );
  const paragraphs = [...body.matchAll(/PARÁGRAFO\s+(?:\d+º|ÚNICO)/gu)];

  assert.deepEqual([...clauses].sort((left, right) => left - right),
    Array.from({ length: 24 }, (_, index) => index + 1));
  assert.equal(paragraphs.length, 35);
  assert.ok(body.length >= 24_000, `corpo inesperadamente curto: ${body.length}`);

  for (const token of [
    '{{aluno.nome}}',
    '{{instituicao.razaoSocial}}',
    '{{curso.nome}}',
    '{{curso.cargaHoraria}}',
    '{{financeiro.valorMatricula}}',
    '{{financeiro.valorParcela}}',
    '{{regras.percentualCancelamento}}',
  ]) {
    assert.ok(body.includes(token), `token canônico ausente: ${token}`);
  }

  assert.doesNotMatch(body, /028\.312\.745-75|2\.176\.993-1|6\.717,60|279,90/u);
});

test('V3 mantém históricos, remove continuação e troca o amarelo por três realces controlados', async () => {
  const migration = await readMigration();
  const paginationFix = await readFile(paginationFixUrl, 'utf8');
  assert.match(migration, /CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA/u);
  assert.match(migration, /paginar_contrato_aluno_minuta_completa/u);
  assert.match(migration, /else public\.paginar_texto_documento_canonico/u);
  assert.doesNotMatch(migration, /— continuação/u);
  assert.doesNotMatch(migration, /yellow|amarelo|#ffff00/iu);
  assert.match(paginationFix, /p_max_caracteres integer default 2600/u);
  assert.match(paginationFix, /least\(coalesce\(p_max_caracteres, 2600\), 3000\)/u);

  const attentionBlock = migration.match(
    /'destaquesAtencao', jsonb_build_array\(([\s\S]*?)\),\n\s+'regrasDinamicas'/u,
  );
  assert.ok(attentionBlock, 'lista de realces discretos não localizada');
  assert.equal((attentionBlock[1].match(/^\s*'/gmu) || []).length, 3);
});

test('encerramento ocupa a última página quando houver área segura', async () => {
  const migration = await readFile(closingMergeUrl, 'utf8');

  assert.match(migration, /v_closing_safe_body_limit integer := 1200/u);
  assert.match(migration, /char_length\(v_last_body\) <= v_closing_safe_body_limit/u);
  assert.match(migration, /jsonb_set\([\s\S]*?'footer'[\s\S]*?to_jsonb\(p_footer\)/u);
  assert.match(migration, /else\s+v_pages := v_pages \|\| jsonb_build_array/u);
});

test('paginação final usa a capacidade compacta validada para sete folhas', async () => {
  const migration = await readFile(sevenPagePaginationUrl, 'utf8');

  assert.match(migration, /p_max_caracteres integer default 4000/u);
  assert.match(migration, /greatest\(3400, least\(coalesce\(p_max_caracteres, 4000\), 4200\)\)/u);
  assert.match(migration, /v_closing_safe_body_limit integer := 2000/u);
  assert.match(migration, /revoke all on function public\.paginar_contrato_aluno_minuta_completa/u);
  assert.match(migration, /commit;\s*$/u);
});
