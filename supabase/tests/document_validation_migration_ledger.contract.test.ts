// @ts-nocheck -- contrato executado pelo Deno, fora do runtime TypeScript da aplicação.
//
// As entradas `releasedMigrations` espelham versões já registradas pelo MCP no
// ledger remoto. As entradas `pendingMcpMigrations` são nomes provisórios
// locais: depois de cada apply_migration, o nome deve ser substituído pela
// versão exata devolvida pelo MCP e movido para `releasedMigrations`.

const migrationsDirectory = new URL("../migrations/", import.meta.url);

const releasedMigrations = [
  "20260728051617_remove_legacy_public_document_validation_policy.sql",
  "20260728051634_version_document_validation_public_profiles.sql",
  "20260728051701_realtime_document_validation_policy_governance.sql",
  "20260728073445_idempotent_document_reissue.sql",
  "20260728073832_create_canonical_diario_document_validation.sql",
  "20260728074216_index_canonical_diario_validation_foreign_keys.sql",
] as const;

const supersededLocalNames = [
  "20260728050000_remove_legacy_public_document_validation_policy.sql",
  "20260728060000_version_document_validation_public_profiles.sql",
  "20260728070000_realtime_document_validation_policy_governance.sql",
  "20260728075000_idempotent_document_reissue.sql",
  "20260728080000_create_canonical_diario_document_validation.sql",
  "20260728074500_index_canonical_diario_validation_foreign_keys.sql",
] as const;

const pendingMcpMigrations = [] as const;

const migrationFiles: string[] = [];
for await (const entry of Deno.readDir(migrationsDirectory)) {
  if (entry.isFile && entry.name.endsWith(".sql")) {
    migrationFiles.push(entry.name);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function migrationVersion(fileName: string) {
  const match = /^(\d{14})_/.exec(fileName);
  assert(match, `migration sem versão canônica: ${fileName}`);
  return match[1];
}

function migrationSlug(fileName: string) {
  return fileName.replace(/^\d{14}_/, "");
}

async function readMigration(fileName: string) {
  return await Deno.readTextFile(new URL(fileName, migrationsDirectory));
}

function rolesGrantedTableRead(sql: string, tableName: string) {
  const roles: string[] = [];
  const pattern = new RegExp(
    `grant\\s+([^;]+?)\\s+on\\s+table\\s+public\\.${tableName}` +
      "\\s+to\\s+([^;]+);",
    "gi",
  );

  for (const match of sql.matchAll(pattern)) {
    const privileges = match[1].trim().toLowerCase();
    if (
      privileges !== "all" &&
      privileges !== "all privileges" &&
      !privileges.split(",").map((item) => item.trim()).includes("select")
    ) {
      continue;
    }
    roles.push(
      ...match[2]
        .split(",")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return roles;
}

Deno.test("ledger local usa exatamente as versões já devolvidas pelo MCP", async () => {
  for (const fileName of releasedMigrations) {
    assert(
      migrationFiles.includes(fileName),
      `migration remota ausente ou com versão divergente: ${fileName}`,
    );

    const sql = await readMigration(fileName);
    assert(
      sql.includes(`Ledger remoto: ${migrationVersion(fileName)}`),
      `cabeçalho não confirma a versão remota de ${fileName}`,
    );
  }

  for (const fileName of supersededLocalNames) {
    assert(
      !migrationFiles.includes(fileName),
      `nome local obsoleto ainda existe: ${fileName}`,
    );
  }

  const versions = releasedMigrations.map(migrationVersion);
  assert(
    versions.every((version, index) =>
      index === 0 || versions[index - 1] < version
    ),
    "P0, P1 e P2 precisam respeitar a ordem do ledger remoto",
  );
});

Deno.test("cada migration publicada possui um único arquivo local por slug", () => {
  for (const fileName of releasedMigrations) {
    const slug = migrationSlug(fileName);
    const matchingFiles = migrationFiles.filter((candidate) =>
      migrationSlug(candidate) === slug
    );
    assert(
      matchingFiles.length === 1,
      `slug ${slug} possui ${matchingFiles.length} arquivos: ${
        matchingFiles.join(", ")
      }`,
    );
    assert(
      matchingFiles[0] === fileName,
      `slug ${slug} aponta para ${matchingFiles[0]}, esperado ${fileName}`,
    );
  }
});

Deno.test("novas migrations mantêm versões locais provisórias até o MCP responder", () => {
  for (const fileName of pendingMcpMigrations) {
    assert(
      migrationFiles.includes(fileName),
      `migration pendente foi renomeada sem reconciliar o contrato: ${fileName}`,
    );

    const slug = migrationSlug(fileName);
    const matchingFiles = migrationFiles.filter((candidate) =>
      migrationSlug(candidate) === slug
    );
    assert(
      matchingFiles.length === 1 && matchingFiles[0] === fileName,
      `migration pendente ${slug} possui versão concorrente: ${
        matchingFiles.join(", ")
      }`,
    );
  }
});

Deno.test("P1 nunca concede SELECT direto do histórico a clientes", async () => {
  const p1 = await readMigration(releasedMigrations[1]);
  const granted = rolesGrantedTableRead(
    p1,
    "documentos_validacao_politicas_historico",
  );

  for (const forbiddenRole of ["public", "anon", "authenticated"]) {
    assert(
      !granted.includes(forbiddenRole),
      `P1 concedeu SELECT bruto do histórico a ${forbiddenRole}`,
    );
  }
  assert(
    granted.includes("service_role"),
    "P1 deve preservar somente a leitura interna do service_role",
  );
  assert(
    /revoke all on table public\.documentos_validacao_politicas_historico\s+from public, anon, authenticated, service_role/i
      .test(p1),
    "P1 precisa revogar papéis clientes antes de qualquer grant mínimo",
  );
  assert(
    !/create\s+policy\s+(?:"[^"]+"|\S+)\s+on\s+public\.documentos_validacao_politicas_historico/i
      .test(p1),
    "P1 não deve deixar policy latente de leitura do histórico bruto",
  );
});

Deno.test("P2 repete a revogação do histórico como defesa em profundidade", async () => {
  const p2 = await readMigration(releasedMigrations[2]);
  const granted = rolesGrantedTableRead(
    p2,
    "documentos_validacao_politicas_historico",
  );

  for (const forbiddenRole of ["public", "anon", "authenticated"]) {
    assert(
      !granted.includes(forbiddenRole),
      `P2 restaurou SELECT bruto do histórico a ${forbiddenRole}`,
    );
  }
  assert(
    /revoke all on table public\.documentos_validacao_politicas_historico\s+from public, anon, authenticated/i
      .test(p2),
    "P2 deve repetir a revogação dos papéis clientes",
  );
  assert(
    /grant select on table public\.documentos_validacao_politicas_historico\s+to service_role/i
      .test(p2),
    "P2 deve manter somente a leitura interna do service_role",
  );
  assert(
    /drop policy if exists "gestores_consultam_historico_politicas_validacao"\s+on public\.documentos_validacao_politicas_historico/i
      .test(p2),
    "P2 deve remover qualquer policy autenticada residual do histórico",
  );
});

Deno.test("migration corretiva publicada remove a policy já aplicada no remoto", async () => {
  const reissue = await readMigration(releasedMigrations[3]);
  assert(
    /drop policy if exists "gestores_consultam_historico_politicas_validacao"\s+on public\.documentos_validacao_politicas_historico/i
      .test(reissue),
    "migration nova precisa corrigir a policy latente nos ambientes existentes",
  );
});
