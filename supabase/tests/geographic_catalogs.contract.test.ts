import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260927141413_create_geographic_catalogs.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const countrySeedUrl = new URL(
  "../migrations/20260927141429_seed_country_nationality_catalog.sql",
  import.meta.url,
);
const countrySeed = await Deno.readTextFile(countrySeedUrl);

const brazilianNationalityBackfill = await Deno.readTextFile(new URL(
  "../migrations/20260927141505_normalize_brazilian_nationality.sql",
  import.meta.url,
));

const municipalitySeeds = await Promise.all(
  [
    "141432", "141434", "141437", "141439", "141441", "141444", "141446",
    "141449", "141451", "141454", "141456", "141458", "141502",
  ].map((time, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    return Deno.readTextFile(
      new URL(
        `../migrations/20260927${time}_seed_ibge_municipalities_${sequence}.sql`,
        import.meta.url,
      ),
    );
  }),
);

const functionDefinition = (name: string) => {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    "i",
  );
  return sql.match(pattern)?.[0] ?? "";
};

Deno.test("catálogos públicos são somente leitura, protegidos por RLS e sem PII", () => {
  for (
    const table of [
      "catalogo_municipios_ibge",
      "catalogo_paises_nacionalidades",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(`create table if not exists public\\.${table}`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]*from public, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant select on table public\\.${table}[\\s\\S]*to anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(
        `grant (insert|update|delete|all) on (table )?public\\.${table}[^;]*to (anon|authenticated)`,
        "i",
      ),
    );
  }

  assert.match(
    sql,
    /create policy catalogo_municipios_ibge_leitura_publica[\s\S]*for select[\s\S]*to anon, authenticated[\s\S]*using \(ativo = true\)/i,
  );
  assert.match(
    sql,
    /create policy catalogo_paises_nacionalidades_leitura_publica[\s\S]*for select[\s\S]*to anon, authenticated[\s\S]*using \(ativo = true\)/i,
  );
});

Deno.test("RPCs de typeahead são invoker, acento-insensíveis e limitadas", () => {
  for (
    const name of [
      "buscar_municipios_ibge",
      "buscar_paises_nacionalidades",
    ]
  ) {
    const definition = functionDefinition(name);
    assert.ok(definition, `RPC ausente: ${name}`);
    assert.match(definition, /security invoker/i);
    assert.doesNotMatch(definition, /security definer/i);
    assert.match(definition, /set search_path = ''/i);
    assert.match(definition, /extensions\.unaccent/i);
    assert.match(definition, /pg_catalog\.length\(parametros\.busca\) >= 2/i);
    assert.match(definition, /LEAST\([\s\S]*30\)/i);
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}\\(text, integer\\)[\\s\\S]*from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${name}\\(text, integer\\)[\\s\\S]*to anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  assert.match(
    functionDefinition("buscar_municipios_ibge"),
    /municipio\.nome \|\| '\/' \|\| municipio\.uf as rotulo/i,
  );
});

Deno.test("naturalidade livre e textos legados permanecem compatíveis", () => {
  assert.match(
    sql,
    /add column if not exists naturalidade_codigo_ibge bigint/i,
  );
  assert.match(sql, /add column if not exists naturalidade_uf text/i);
  assert.match(sql, /add column if not exists nacionalidade_codigo_iso3 text/i);
  assert.match(
    sql,
    /foreign key \(naturalidade_codigo_ibge\)[\s\S]*references public\.catalogo_municipios_ibge\(codigo_ibge\)/i,
  );
  assert.doesNotMatch(sql, /alter column naturalidade set not null/i);
  assert.doesNotMatch(sql, /foreign key \(naturalidade\)/i);
  assert.match(
    sql,
    /texto livre permanece permitido em parceiros\.naturalidade/i,
  );
});

Deno.test("tipo de documento deixa de inferir CIN sem alterar registros existentes", () => {
  assert.match(sql, /alter column tipo_documento drop default/i);
  assert.match(
    sql,
    /drop constraint if exists parceiros_tipo_documento_check/i,
  );
  assert.match(sql, /'CARTEIRA DE IDENTIDADE NACIONAL'/i);
  assert.match(sql, /'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'/i);
  assert.match(sql, /'RG \(ANTIGO\)'/i);
  assert.doesNotMatch(sql, /update public\.parceiros/i);
  assert.doesNotMatch(sql, /update parceiros/i);
});

Deno.test("backfill padroniza apenas nacionalidades brasileiras determinísticas", () => {
  assert.match(brazilianNationalityBackfill, /nacionalidade = 'BRASILEIRA'/i);
  assert.match(brazilianNationalityBackfill, /nacionalidade_codigo_iso3 = 'BRA'/i);
  assert.match(brazilianNationalityBackfill, /'BRASILEIRO\(A\)'/i);
  assert.doesNotMatch(brazilianNationalityBackfill, /naturalidade\s*=/i);
});

Deno.test("seeds oficiais são completos, idempotentes e respeitam 500 linhas", () => {
  const countryRows =
    countrySeed.match(/^[ ]{2}\('[A-Z]{3}', '[A-Z]{2}', \d+, /gm) ?? [];
  assert.equal(countryRows.length, 193);
  assert.match(
    countrySeed,
    /Fonte: https:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/localidades\/paises/i,
  );
  assert.match(countrySeed, /\('BRA', 'BR', 76, 'Brasil', 'BRASILEIRA'\)/i);
  assert.match(countrySeed, /\('AFG', 'AF', 4, 'Afeganistão', NULL\)/i);
  assert.match(
    functionDefinition("buscar_paises_nacionalidades"),
    /item\.nacionalidade is not null/i,
  );
  assert.match(countrySeed, /on conflict \(codigo_iso3\) do update/i);
  assert.ok(countrySeed.split("\n").length <= 500);

  const combinedMunicipalities = municipalitySeeds.join("\n");
  const municipalityRows = combinedMunicipalities.match(/^[ ]{2}\(\d{7}, /gm) ?? [];
  const municipalityCodes =
    combinedMunicipalities.match(/^[ ]{2}\((\d{7}), /gm)?.map((row) =>
      row.slice(3, 10)
    ) ?? [];
  assert.equal(municipalityRows.length, 5571);
  assert.equal(new Set(municipalityCodes).size, 5571);
  assert.match(combinedMunicipalities, /\(2804409, 'Neópolis', 'SE'\)/i);
  assert.match(
    combinedMunicipalities,
    /on conflict \(codigo_ibge\) do update/i,
  );
  for (const seed of municipalitySeeds) {
    assert.match(
      seed,
      /Fonte: https:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/localidades\/municipios/i,
    );
    assert.ok(seed.split("\n").length <= 500);
  }
});
