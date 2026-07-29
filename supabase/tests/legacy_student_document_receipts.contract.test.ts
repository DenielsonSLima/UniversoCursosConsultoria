import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const schemaMigrationUrl = new URL(
  '../migrations/20260729204606_legacy_student_document_receipts_without_files.sql',
  import.meta.url,
);
const t41MigrationUrl = new URL(
  '../migrations/20260729204613_mark_t41_legacy_documents_received.sql',
  import.meta.url,
);

Deno.test('recebimento sem anexo possui ledger fechado e imutável', async () => {
  const source = await Deno.readTextFile(schemaMigrationUrl);

  assert.match(
    source,
    /create table public\.documentos_aluno_recebimentos_sem_anexo/i,
  );
  assert.match(
    source,
    /alter table public\.documentos_aluno_recebimentos_sem_anexo[\s\S]*enable row level security/i,
  );
  assert.match(
    source,
    /revoke all on public\.documentos_aluno_recebimentos_sem_anexo[\s\S]*from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    source,
    /grant select on public\.documentos_aluno_recebimentos_sem_anexo[\s\S]*to authenticated/i,
  );
  assert.doesNotMatch(
    source,
    /create policy documentos_recebimentos_sem_anexo_select/i,
  );
  assert.match(
    source,
    /create trigger trg_protect_documentos_recebimentos_sem_anexo_audit[\s\S]*before update or delete/i,
  );
  assert.match(source, /on delete restrict/i);
});

Deno.test('RPC exige gestor, aluno legado, motivo e item sem arquivo ou versão', async () => {
  const source = await Deno.readTextFile(schemaMigrationUrl);
  const start = source.search(
    /create or replace function\s+public\.marcar_documento_recebido_sem_anexo/i,
  );
  const end = source.indexOf('$$;', start);
  const rpc = source.slice(start, end);

  assert.match(rpc, /auth\.uid\(\) is null/i);
  assert.match(rpc, /gestor_pode_gerenciar_documento_aluno/i);
  assert.match(rpc, /matricula_liberacoes_diario/i);
  assert.match(rpc, /liberacao\.origem = 'MIGRACAO_LEGADA'/i);
  assert.match(rpc, /liberacao\.revogado_em is null/i);
  assert.match(rpc, /for update/i);
  assert.match(rpc, /length\(v_motivo\) not between 10 and 1000/i);
  assert.match(rpc, /versao_atual_id is not null/i);
  assert.match(rpc, /arquivo_bucket is not null/i);
  assert.match(rpc, /documento_recebido_sem_anexo/i);
  assert.doesNotMatch(rpc, /contas_receber/i);
  assert.doesNotMatch(rpc, /update public\.matriculas/i);
});

Deno.test('upload real revoga marcador sem anexo sem publicar ledger no realtime', async () => {
  const source = await Deno.readTextFile(schemaMigrationUrl);

  assert.match(
    source,
    /create trigger trg_revogar_recebimento_sem_anexo_ao_enviar_arquivo[\s\S]*after update of versao_atual_id/i,
  );
  assert.doesNotMatch(
    source,
    /alter publication supabase_realtime[\s\S]*documentos_aluno_recebimentos_sem_anexo/i,
  );
});

Deno.test('consulta do ledger é exclusiva do gestor e elegibilidade é canônica', async () => {
  const source = await Deno.readTextFile(schemaMigrationUrl);
  const listStart = source.search(
    /create or replace function\s+public\.listar_documentos_recebidos_sem_anexo/i,
  );
  const listEnd = source.indexOf('$$;', listStart);
  const listRpc = source.slice(listStart, listEnd);
  const eligibilityStart = source.search(
    /create or replace function\s+public\.aluno_pode_registrar_documento_sem_anexo/i,
  );
  const eligibilityEnd = source.indexOf('$$;', eligibilityStart);
  const eligibilityRpc = source.slice(eligibilityStart, eligibilityEnd);

  assert.match(listRpc, /gestor_pode_gerenciar_documento_aluno/i);
  assert.doesNotMatch(listRpc, /pode_acessar_documento_aluno/i);
  assert.match(eligibilityRpc, /gestor_pode_gerenciar_documento_aluno/i);
  assert.match(eligibilityRpc, /matricula_liberacoes_diario/i);
  assert.match(eligibilityRpc, /origem = 'MIGRACAO_LEGADA'/i);
});

Deno.test('ativação reconhece recebimento, mas continua exigindo pagamento', async () => {
  const source = await Deno.readTextFile(schemaMigrationUrl);
  const start = source.search(
    /create or replace function public\.ativar_matricula_tecnica_apos_documentos/i,
  );
  const rpc = source.slice(start);

  assert.match(rpc, /documentos_aluno_recebimentos_sem_anexo/i);
  assert.match(rpc, /from public\.contas_receber/i);
  assert.match(rpc, /from public\.inscricoes_online/i);
  assert.match(rpc, /pagamento da matrícula ainda não foi confirmado/i);
});

Deno.test('backfill T41 marca 288 itens sem ativar matrícula ou criar financeiro', async () => {
  const source = await Deno.readTextFile(t41MigrationUrl);

  assert.match(source, /codigo = 'ENF-T41-SEM-AQU'/i);
  assert.match(source, /v_matriculas <> 32/i);
  assert.match(source, /v_documentos <> 288/i);
  assert.match(source, /v_recebimentos <> 288/i);
  assert.match(source, /having count\(documento\.id\) <> 9/i);
  assert.match(source, /having count\(recebimento\.id\) <> 9/i);
  assert.match(source, /'MIGRACAO_LEGADA_T41'/i);
  assert.match(source, /from public\.contas_receber/i);
  assert.match(source, /conta\.matricula_id/i);
  assert.match(source, /from public\.inscricoes_online/i);
  assert.doesNotMatch(source, /insert into public\.contas_receber/i);
  assert.doesNotMatch(source, /update public\.matriculas/i);
  assert.doesNotMatch(source, /insert into public\.parceiros/i);
});
