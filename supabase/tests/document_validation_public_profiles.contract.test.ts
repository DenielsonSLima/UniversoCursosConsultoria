// @ts-nocheck -- contrato executado pelo Deno, fora do runtime TypeScript da aplicação.

const migrationUrl = new URL(
  "../migrations/20260728051634_version_document_validation_public_profiles.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  assert(pattern.test(value), message);
}

const allowedFields = [
  "studentName",
  "studentPhotoUrl",
  "studentCpf",
  "studentBirthDate",
  "maskedMotherName",
  "maskedEnrollmentNumber",
  "courseName",
  "className",
  "institutionName",
  "institutionCnpj",
  "unitName",
  "enrollmentStatus",
  "issuedAt",
  "lastIssuedAt",
  "expiresAt",
  "referencePeriod",
  "issueCount",
  "enrollmentDate",
] as const;

const documentTypes = [
  "carteirinha",
  "cracha_estagio",
  "declaracao_matricula",
  "declaracao_frequencia",
  "declaracao_irpf",
  "boletim",
  "atestado_conclusao_tecnico",
  "historico_escolar",
  "transferencia",
  "rematricula",
  "termo_estagio",
  "pasta_identificacao",
  "ficha_matricula",
  "certificado_tecnico",
  "certificado_livre",
  "certificado_ead",
  "certificado_especializacao",
] as const;

Deno.test("perfil público usa allowlist fechada e campos obrigatórios", () => {
  for (const field of allowedFields) {
    assert(
      sql.includes(`'${field}'`),
      `campo permitido ausente da migration: ${field}`,
    );
  }
  assertMatch(
    sql,
    /array\['institutionName', 'issuedAt'\]::text\[\]\s*<@\s*campos_publicos/,
    "institutionName e issuedAt precisam ser obrigatórios",
  );
  assertMatch(
    sql,
    /campos_publicos\s*<@\s*array\[/,
    "a política precisa usar operador de subconjunto da allowlist",
  );
});

Deno.test("todos os 17 tipos recebem seed seguro", () => {
  for (const type of documentTypes) {
    assert(
      sql.includes(`when '${type}' then array[`),
      `seed público ausente para ${type}`,
    );
  }
  assertMatch(
    sql,
    /when 'declaracao_irpf' then array\[\s*'institutionName', 'issuedAt', 'referencePeriod'/,
    "IRPF deve nascer com perfil mínimo",
  );
  for (const type of ["pasta_identificacao", "ficha_matricula"]) {
    assertMatch(
      sql,
      new RegExp(
        `when '${type}' then array\\[\\s*` +
          `'institutionName', 'issuedAt', 'maskedEnrollmentNumber', 'studentName'`,
      ),
      `${type} deve nascer com perfil mínimo`,
    );
  }
  const photoSeeds = [...sql.matchAll(/when '([^']+)' then array\[[\s\S]*?\]::text\[\]/g)]
    .filter((match) => match[0].includes("'studentPhotoUrl'"))
    .map((match) => match[1]);
  assert(
    JSON.stringify(photoSeeds) ===
      JSON.stringify(["carteirinha", "cracha_estagio"]),
    `foto apareceu em seeds indevidos: ${photoSeeds.join(", ")}`,
  );
});

Deno.test("snapshot é mascarado, congelado e atualizado só na reemissão", () => {
  assertMatch(
    sql,
    /add column if not exists politica_versao_emissao integer/,
    "versão da emissão ausente",
  );
  assertMatch(
    sql,
    /add column if not exists campos_publicos_emissao text\[\]/,
    "campos da emissão ausentes",
  );
  assertMatch(
    sql,
    /add column if not exists dados_publicos_snapshot jsonb/,
    "snapshot público ausente",
  );
  assertMatch(
    sql,
    /new\.quantidade_emissoes <= old\.quantidade_emissoes[\s\S]*new\.dados_publicos_snapshot := old\.dados_publicos_snapshot/,
    "atualização comum não pode reescrever o snapshot",
  );
  assertMatch(
    sql,
    /public\.mascarar_cpf_validacao_publica/,
    "CPF deve ser mascarado antes de entrar no snapshot",
  );
  assertMatch(
    sql,
    /trg_zz_preparar_snapshot_publico_documento_validacao/,
    "todos os emissores devem passar pelo trigger canônico",
  );
  assertMatch(
    sql,
    /tg_op = 'INSERT'[\s\S]*new\.quantidade_emissoes > old\.quantidade_emissoes[\s\S]*new\.validacao_publica := v_policy\.validacao_publica/,
    "reemissão deve adotar validacao_publica vigente nos dois sentidos",
  );
});

Deno.test("máscaras não confiam em asteriscos vindos de dados_emissao", () => {
  const nameMaskStart = sql.indexOf(
    "create or replace function public.mascarar_nome_validacao_publica",
  );
  const nameMaskEnd = sql.indexOf("$function$;", nameMaskStart);
  const nameMask = sql.slice(nameMaskStart, nameMaskEnd);
  assert(nameMaskStart >= 0 && nameMaskEnd > nameMaskStart, "máscara de nome ausente");
  assertMatch(
    nameMask,
    /regexp_replace\(v_valor, '\\\*', '', 'g'\)/,
    "nome precisa remover máscara alegada antes de remascarar",
  );
  assert(
    !/position\('\*' in v_valor\)[\s\S]*return v_valor/.test(nameMask),
    "nome como `Maria da Silva *` não pode ser aceito verbatim",
  );
  assertMatch(
    nameMask,
    /split_part\(v_valor, ' ', 1\)[\s\S]*split_part\(v_valor, ' ', 2\)/,
    "nome deve conservar somente primeiro nome e inicial seguinte",
  );

  const enrollmentMaskStart = sql.indexOf(
    "create or replace function public.mascarar_matricula_validacao_publica",
  );
  const enrollmentMaskEnd = sql.indexOf("$function$;", enrollmentMaskStart);
  const enrollmentMask = sql.slice(enrollmentMaskStart, enrollmentMaskEnd);
  assert(
    enrollmentMaskStart >= 0 && enrollmentMaskEnd > enrollmentMaskStart,
    "máscara de matrícula ausente",
  );
  assertMatch(
    enrollmentMask,
    /\[\^A-Z0-9-\]/,
    "matrícula precisa remover `*` e caracteres não canônicos antes de remascarar",
  );
  assert(
    !/position\('\*' in v_valor\)[\s\S]*return v_valor/.test(enrollmentMask),
    "matrícula como `2026001234*` não pode ser aceita verbatim",
  );
});

Deno.test("consulta aplica interseção e kill switch vigente", () => {
  const validatorStart = sql.indexOf(
    "create or replace function public.validar_documento_por_codigo",
  );
  const validatorEnd = sql.indexOf(
    "comment on function public.validar_documento_por_codigo",
    validatorStart,
  );
  assert(validatorStart >= 0 && validatorEnd > validatorStart, "RPC pública ausente");
  const validator = sql.slice(validatorStart, validatorEnd);

  assertMatch(
    validator,
    /from unnest\(candidate\.campos_publicos_emissao\)[\s\S]*emission_field\.field = any\(candidate\.campos_publicos_atuais\)/,
    "visibilidade deve ser a interseção emissão x política atual",
  );
  assertMatch(
    validator,
    /and policy\.consulta_publica_ativa/,
    "kill switch vigente não foi aplicado",
  );
  assertMatch(
    validator,
    /visibleFields/,
    "contrato deve informar visibleFields",
  );
  assertMatch(
    validator,
    /schemaVersion/,
    "contrato deve informar schemaVersion",
  );
  assert(
    !/enrollmentId/.test(validator),
    "RPC pública nunca pode devolver enrollmentId",
  );
  assert(
    !/left join public\.parceiros/.test(validator),
    "RPC pública não pode reconstruir dados pessoais do cadastro atual",
  );
});

Deno.test("prefixo é seguro, versionado e único sem diferenciar caixa", () => {
  assertMatch(
    sql,
    /\^\[A-Z0-9\]\+\(-\[A-Z0-9\]\+\)\*\$/,
    "regex segura do prefixo ausente",
  );
  assertMatch(
    sql,
    /char_length\(prefixo\) between 2 and 20/,
    "limite persistido do prefixo ausente",
  );
  assertMatch(
    sql,
    /documentos_validacao_politicas_prefixo_lower_uidx[\s\S]*lower\(prefixo\)/,
    "prefixo precisa de unicidade case-insensitive",
  );
  assertMatch(
    sql,
    /p_expected_version[\s\S]*policy\.versao = p_expected_version/,
    "update deve usar concorrência otimista",
  );
  assertMatch(
    sql,
    /documentos_validacao_politicas_historico/,
    "histórico versionado ausente",
  );
});

Deno.test("wrapper v1 habilita consulta no false para true sem apagar kill switch manual", () => {
  const legacyStart = sql.indexOf(
    "create or replace function public.atualizar_politica_validacao_documento(",
  );
  const legacyEnd = sql.indexOf("$function$;", legacyStart);
  const legacy = sql.slice(legacyStart, legacyEnd);
  assert(legacyStart >= 0 && legacyEnd > legacyStart, "wrapper v1 ausente");
  assertMatch(
    legacy,
    /when p_validacao_publica\s+and not v_current\.validacao_publica\s+then true\s+else v_current\.consulta_publica_ativa/,
    "false→true legado deve habilitar consulta e preservar kill switch nos demais casos",
  );
});

Deno.test("índices, RLS e grants preservam menor privilégio", () => {
  assertMatch(
    sql,
    /documentos_validacao_codigo_normalizado_uidx[\s\S]*upper\(btrim\(codigo\)\)/,
    "busca normalizada do código precisa de índice",
  );
  assertMatch(
    sql,
    /alter table public\.documentos_validacao_politicas_historico\s+enable row level security/,
    "RLS do histórico ausente",
  );
  assertMatch(
    sql,
    /revoke all on table public\.documentos_validacao_politicas_historico\s+from public, anon, authenticated, service_role/,
    "histórico deve revogar acessos amplos",
  );
  assert(
    !/create\s+policy\s+(?:"[^"]+"|\S+)\s+on\s+public\.documentos_validacao_politicas_historico/i
      .test(sql),
    "histórico bruto não deve possuir policy de leitura para clientes",
  );
  assert(
    !/grant select on table public\.documentos_validacao_politicas_historico\s+to authenticated/i
      .test(sql),
    "P1 não pode abrir uma janela de SELECT direto do histórico para authenticated",
  );
  assertMatch(
    sql,
    /grant select on table public\.documentos_validacao_politicas_historico\s+to service_role/,
    "somente service_role pode ler o histórico bruto na P1",
  );
  assertMatch(
    sql,
    /revoke insert, update, delete, truncate, references, trigger\s+on table public\.documentos_validacao_politicas\s+from service_role/,
    "service_role também deve escrever políticas somente pela RPC auditada",
  );
  assertMatch(
    sql,
    /grant execute on function public\.validar_documento_por_codigo\(text\)\s+to anon, authenticated/,
    "somente a RPC pública deve ser executável anonimamente",
  );
  const v2Grant = sql.match(
    /grant execute on function public\.atualizar_politica_validacao_documento_v2\([\s\S]*?\)\s+to ([^;]+);/,
  );
  assert(v2Grant, "grant da RPC administrativa v2 ausente");
  assert(!v2Grant[1].includes("anon"), "anon não pode alterar política");
  assert(
    !/alter publication\s+supabase_realtime\s+add table\s+public\.documentos_validacao_politicas/i
      .test(sql),
    "políticas não devem ser publicadas no Realtime nesta etapa",
  );
});
