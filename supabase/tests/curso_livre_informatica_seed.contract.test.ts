import assert from "node:assert/strict";

declare const Deno: {
  readTextFile(path: string | URL): Promise<string>;
  test(name: string, fn: () => void | Promise<void>): void;
};

const seed = await Deno.readTextFile(
  new URL(
    "../migrations/20260822160800_seed_informatica_basica_livre_assessment.sql",
    import.meta.url,
  ),
);

Deno.test("seed resolve o curso normalizado sem UUID de produção", () => {
  assert.match(
    seed,
    /lower\(extensions\.unaccent\(pg_catalog\.btrim\(course\.nome\)\)\) = 'informatica basica'/i,
  );
  assert.match(seed, /if v_course_count <> 1 then/i);
  assert.doesNotMatch(
    seed,
    /['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i,
  );
});

Deno.test("seed preserva IDs e conteúdo existente", () => {
  assert.doesNotMatch(seed, /\bdelete\b/i);
  assert.match(
    seed,
    /update public\.disciplinas discipline[\s\S]*where discipline\.id = v_subject_id/i,
  );
  assert.match(
    seed,
    /if not exists \([\s\S]*public\.aulas lesson[\s\S]*insert into public\.aulas/i,
  );
  assert.match(
    seed,
    /array_agg\(discipline\.id order by discipline\.created_at, discipline\.id\)/i,
  );
});

Deno.test("seed reconhece as grafias legadas existentes em produção", () => {
  assert.match(
    seed,
    /array\['hardware e perifericos','hardware e periferios'\]::text\[\]/i,
  );
  assert.match(
    seed,
    /array\['softwares e sistemas operacionais','softwares e sistema operacionais'\]::text\[\]/i,
  );
});

Deno.test("grade canônica possui nove matérias, 80 horas e descrições reais", () => {
  const subjects = [
    "INTRODUÇÃO À INFORMÁTICA",
    "HARDWARE E PERIFÉRICOS",
    "SOFTWARES E SISTEMAS OPERACIONAIS",
    "MICROSOFT WINDOWS",
    "MICROSOFT WORD",
    "MICROSOFT EXCEL",
    "MICROSOFT POWER POINT",
    "PESQUISA NA INTERNET E DOWNLOAD",
    "COMPLEMENTOS",
  ];
  for (const subject of subjects) {
    assert.ok(seed.includes(subject), `matéria ausente: ${subject}`);
  }
  assert.match(seed, /set carga_horaria = 80/i);
  assert.match(
    seed,
    /if \([\s\S]*select count\(\*\) from public\.disciplinas[\s\S]*\) <> 9 then/i,
  );
  assert.match(seed, /v_subject\.descricao/i);
});

Deno.test("banco seed publica exatamente cinquenta questões válidas", () => {
  const questionRows = seed.match(/jsonb_build_array\(/g) ?? [];
  assert.equal(questionRows.length, 50);
  assert.match(seed, /insert into public\.curso_livre_questoes/i);
  assert.match(
    seed,
    /set status = 'PUBLICADA' where assessment\.id = v_assessment_id/i,
  );
  assert.match(seed, /quantidade_sorteada, minimo_banco[\s\S]*70, 10, 50/i);
});
