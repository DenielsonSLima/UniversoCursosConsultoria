// @ts-nocheck -- contrato executado pelo Deno, fora do runtime TypeScript da aplicação.

const migrationUrl = new URL(
  "../migrations/20260804143000_harden_library_folder_write_consistency.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);
const invokerMigrationUrl = new URL(
  "../migrations/20260804144000_use_invoker_for_library_folder_write_helper.sql",
  import.meta.url,
);
const invokerSql = await Deno.readTextFile(invokerMigrationUrl);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMatch(value: string, pattern: RegExp, message: string) {
  assert(pattern.test(value), message);
}

Deno.test("documento e pasta permanecem no mesmo repositório", () => {
  assertMatch(
    sql,
    /folder\.teacher_id is not distinct from p_teacher_id/,
    "a policy precisa comparar o repositório do documento com o da pasta",
  );
  assertMatch(
    sql,
    /v_folder_teacher_id is distinct from new\.teacher_id[\s\S]*raise exception/,
    "a trigger precisa rejeitar inconsistência mesmo fora da RLS",
  );
  assertMatch(
    sql,
    /before insert or update of pasta_id, teacher_id[\s\S]*biblioteca_documentos/,
    "a validação estrutural precisa cobrir insert e update",
  );
});

Deno.test("professor só escreve em pasta do próprio repositório", () => {
  assertMatch(
    sql,
    /folder\.teacher_id = public\.current_professor_id\(\)[\s\S]*p_teacher_id = public\.current_professor_id\(\)/,
    "o professor precisa ser dono tanto da pasta quanto do documento",
  );
  for (const operation of ["insert", "update"]) {
    assertMatch(
      sql,
      new RegExp(
        `create policy portal_biblioteca_documentos_${operation}[\\s\\S]*professor_can_publish_library_document[\\s\\S]*biblioteca_document_folder_write_allowed`,
      ),
      `a policy de ${operation} precisa combinar escopo atual e pasta autorizada`,
    );
  }
});

Deno.test("audiência da subpasta é limitada por ancestrais e descendentes", () => {
  assertMatch(
    sql,
    /with recursive ancestors[\s\S]*A subpasta não pode ter público mais amplo que seus ancestrais/,
    "a cadeia ancestral inteira precisa limitar a audiência da subpasta",
  );
  assertMatch(
    sql,
    /with recursive descendants[\s\S]*A pasta não pode ficar mais privada que uma de suas subpastas/,
    "restringir um pai não pode deixar descendentes mais públicos",
  );
  assertMatch(
    sql,
    /before insert or update of parent_id, teacher_id, publico_alvo/,
    "mudanças de público e de hierarquia precisam disparar a validação",
  );
  assertMatch(
    sql,
    /v_relative\.teacher_id is distinct from new\.teacher_id[\s\S]*subpastas precisam permanecer no mesmo repositório/,
    "alterar o pai não pode separar seus descendentes em outro repositório",
  );
  assertMatch(
    sql,
    /when 'ALUNOS' then v_relative\.publico_alvo in \('ALUNOS', 'TODOS'\)[\s\S]*when 'PROFESSORES' then v_relative\.publico_alvo in \('PROFESSORES', 'TODOS'\)[\s\S]*when 'TODOS' then v_relative\.publico_alvo = 'TODOS'/,
    "o conjunto de audiência do filho precisa estar contido no ancestral",
  );
});

Deno.test("funções de trigger não ficam executáveis pelo cliente", () => {
  assertMatch(
    sql,
    /revoke all on function public\.validate_biblioteca_document_folder\(\)[\s\S]*from public, anon, authenticated/,
    "a trigger de documentos não deve ser uma RPC pública",
  );
  assertMatch(
    sql,
    /revoke all on function public\.validate_biblioteca_folder_tree\(\)[\s\S]*from public, anon, authenticated/,
    "a trigger de pastas não deve ser uma RPC pública",
  );
});

Deno.test("helper de policy não fica exposto como RPC privilegiada", () => {
  assertMatch(
    invokerSql,
    /alter function public\.biblioteca_document_folder_write_allowed\(uuid, uuid\)[\s\S]*security invoker/,
    "o helper de escrita precisa respeitar RLS e identidade da sessão",
  );
});
