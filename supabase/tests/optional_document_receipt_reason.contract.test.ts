import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migrationUrl = new URL(
  "../migrations/20260803173000_canonicalize_student_access_lifecycle.sql",
  import.meta.url,
);

const migration = await Deno.readTextFile(migrationUrl);
const functionStart = migration.indexOf(
  "create or replace function public.marcar_documento_recebido_sem_anexo(",
);
const functionEnd = migration.indexOf("$$;", functionStart);
const rpc = migration.slice(functionStart, functionEnd);

Deno.test("justificativa de entrega é opcional e normalizada", () => {
  assert.match(migration, /alter column motivo drop not null/i);
  assert.match(
    migration,
    /motivo is null\s+or length\(btrim\(motivo\)\) between 1 and 1000/i,
  );
  assert.match(
    rpc,
    /v_motivo text := nullif\(btrim\(coalesce\(p_motivo, ''\)\), ''\)/i,
  );
  assert.doesNotMatch(rpc, /v_motivo is null or/i);
  assert.doesNotMatch(rpc, /between 10 and 1000/i);
});

Deno.test("backend mantém limite máximo de 1000 caracteres", () => {
  assert.match(rpc, /if length\(v_motivo\) > 1000 then/i);
  assert.match(rpc, /A justificativa deve ter no máximo 1000 caracteres/i);
});

Deno.test("observação e evento aceitam motivo ausente sem texto nulo", () => {
  assert.match(
    rpc,
    /when v_motivo is null\s+then 'Documento entregue e conferido sem anexo\.'/i,
  );
  assert.match(
    rpc,
    /jsonb_build_object\([\s\S]*'motivo', v_motivo/i,
  );
  assert.match(rpc, /'GESTOR_CONFIRMACAO_SEM_ANEXO'/i);
});

Deno.test("RPC continua autenticado, escopado e sem arquivo", () => {
  assert.match(rpc, /auth\.uid\(\) is null/i);
  assert.match(rpc, /gestor_pode_gerenciar_documento_aluno/i);
  assert.match(rpc, /versao_atual_id is not null/i);
  assert.match(rpc, /arquivo_bucket is not null/i);
  assert.match(rpc, /for update/i);
});
