import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migrationUrl = new URL(
  "../migrations/20260820190000_fix_partner_access_trigger_order.sql",
  import.meta.url,
);

const migration = await Deno.readTextFile(migrationUrl);

Deno.test("proteção do INSERT roda antes da identidade automática do aluno", () => {
  assert.match(
    migration,
    /drop trigger if exists trg_00_protect_student_access_insert on public\.parceiros/i,
  );
  assert.match(
    migration,
    /create trigger a00_protect_student_access_insert\s+before insert on public\.parceiros\s+for each row\s+execute function public\.protect_student_access_control_fields\(\)/is,
  );
  assert.doesNotMatch(
    migration,
    /create trigger trg_00_protect_student_access_insert/i,
  );
  assert.ok(
    "a00_protect_student_access_insert" < "assign_student_portal_identity_trigger",
    "o guard deve executar antes do trigger que gera a identidade do aluno",
  );
});
